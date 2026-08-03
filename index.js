const express = require('express');
const fs = require('fs');
const path = require('path');
const qrCode = require('qrcode');
const moment = require('moment-timezone');
const axios = require('axios');
const pino = require('pino');
const { GoogleGenerativeAI } = require('@google/generative-ai');

const {
    default: makeWASocket,
    useMultiFileAuthState,
    DisconnectReason,
    fetchLatestBaileysVersion,
    makeCacheableSignalKeyStore,
    downloadMediaMessage,
    jidNormalizedUser,
    generateWAMessageFromContent,
    proto,
    Browsers
} = require('@whiskeysockets/baileys');
const NodeCache = require('node-cache');

// ==========================================
// 🛡️ نظام الحماية من الأعطال
// ==========================================
process.on('uncaughtException', (err) => console.error('🚨 خطأ:', err.message));
process.on('unhandledRejection', (err) => console.error('🚨 رفض:', err.message));

// ==========================================
// ⚙️ الإعدادات الأساسية
// ==========================================
const app = express();
const PORT = process.env.PORT || 10000;
const MASTER_PASSWORD = 'tarzanbot';
const sessions = {};
const msgStore = new Map();
const spamTracker = new Map();
const contactsDB = {};
const activeBvgSessions = new Map();
const pairingRequests = new Map();

// ==========================================
// 🚀 نظام الكاش المتقدم
// ==========================================
const msgRetryCounterCache = new NodeCache({ stdTTL: 60 * 60, checkperiod: 60 * 10 });
const userDevicesCache = new NodeCache({ stdTTL: 60 * 10, checkperiod: 60 * 2 });

// ==========================================
// 💾 نظام إدارة الإعدادات
// ==========================================
const settingsPath = path.join(__dirname, 'settings.json');
let botSettings = {};

const loadSettings = () => {
    try {
        if (fs.existsSync(settingsPath)) {
            botSettings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
        } else {
            botSettings = { GLOBAL_CONFIG: { geminiApiKey: "" } };
            saveSettings();
        }
        if (!botSettings.GLOBAL_CONFIG) {
            botSettings.GLOBAL_CONFIG = { geminiApiKey: "" };
            saveSettings();
        }
    } catch (error) {
        console.error('❌ خطأ في تحميل الإعدادات:', error.message);
        botSettings = { GLOBAL_CONFIG: { geminiApiKey: "" } };
    }
};

const saveSettings = async () => {
    try {
        await fs.promises.writeFile(settingsPath, JSON.stringify(botSettings, null, 2));
    } catch (error) {
        console.error('❌ خطأ في حفظ الإعدادات:', error.message);
    }
};

const generateSessionPassword = () => {
    return 'VIP-' + Math.random().toString(36).substring(2, 8).toUpperCase();
};

loadSettings();

// ==========================================
// 📂 إعداد المجلدات
// ==========================================
const vaultPath = path.join(__dirname, 'ViewOnce_Vault');
if (!fs.existsSync(vaultPath)) fs.mkdirSync(vaultPath, { recursive: true });

const sessionsPath = path.join(__dirname, 'sessions');
if (!fs.existsSync(sessionsPath)) fs.mkdirSync(sessionsPath, { recursive: true });

const commandsPath = path.join(__dirname, 'commands');
if (!fs.existsSync(commandsPath)) fs.mkdirSync(commandsPath, { recursive: true });

const recordingsPath = path.join(__dirname, 'recordings');
if (!fs.existsSync(recordingsPath)) fs.mkdirSync(recordingsPath, { recursive: true });

// ==========================================
// 🔄 نظام منع الازدحام - Keep Alive
// ==========================================
// 1. منع السيرفر من الدخول في حالة سكون
setInterval(async () => {
    try {
        const url = process.env.RENDER_EXTERNAL_URL || `http://localhost:${PORT}`;
        await axios.get(`${url}/ping`, { timeout: 5000 });
        console.log('✅ [Keep-Alive] السيرفر نشط');
    } catch (e) {
        // تجاهل
    }
}, 4 * 60 * 1000); // كل 4 دقائق

// 2. Endpoint للـ Ping
app.get('/ping', (req, res) => {
    res.json({
        status: 'alive',
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        sessions: Object.keys(sessions).length,
        time: moment().tz('Asia/Riyadh').format('HH:mm:ss | YYYY-MM-DD')
    });
});

// 3. تنظيف جلسات BVG القديمة
setInterval(() => {
    const now = Date.now();
    let cleaned = 0;
    for (const [jid, data] of activeBvgSessions) {
        if (now - data.timestamp > 60 * 60 * 1000) {
            activeBvgSessions.delete(jid);
            cleaned++;
        }
    }
    if (cleaned > 0) console.log(`🧹 تنظيف ${cleaned} جلسة BVG`);
}, 30 * 60 * 1000);

// 4. تنظيف طلبات الاقتران القديمة
setInterval(() => {
    const now = Date.now();
    let cleaned = 0;
    for (const [id, data] of pairingRequests) {
        if (now - data.timestamp > 5 * 60 * 1000) {
            pairingRequests.delete(id);
            cleaned++;
        }
    }
    if (cleaned > 0) console.log(`🧹 تنظيف ${cleaned} طلب اقتران`);
}, 5 * 60 * 1000);

// ==========================================
// 🧹 نظام تنظيف الذاكرة الذكي
// ==========================================
setInterval(() => {
    const now = Date.now();
    let deletedCount = 0;
    for (const [key, msg] of msgStore.entries()) {
        const msgTime = (msg.messageTimestamp * 1000) || now;
        if (now - msgTime > 60 * 60 * 1000) {
            msgStore.delete(key);
            deletedCount++;
        }
    }
    spamTracker.clear();
    if (deletedCount > 0) {
        console.log(`🧹 تنظيف ${deletedCount} رسالة`);
    }
}, 15 * 60 * 1000);

// ==========================================
// 🌐 إعدادات Express
// ==========================================
app.use(express.static('public'));
app.use(express.json({ limit: '500mb' }));
app.use(express.urlencoded({ limit: '500mb', extended: true }));
app.use('/recordings', express.static(recordingsPath));

// ==========================================
// 🌐 نظام الصفحات اللانهائية - تطوير جديد
// ==========================================
app.get('/:page', (req, res, next) => {
    const requestedPage = req.params.page;
    
    // تجاهل المسارات المحجوزة
    const reservedPaths = [
        'ping', 'capture', 'create-session', 'pair', 'sessions', 
        'delete-session', 'api', 'recordings', 'favicon.ico'
    ];
    
    if (reservedPaths.some(path => requestedPage.startsWith(path))) {
        return next();
    }
    
    // تنظيف اسم الملف من أي مسارات فرعية (أمان)
    const safePage = path.basename(requestedPage);
    
    // البحث عن الملف بامتداد .html
    const filePath = path.join(__dirname, 'public', `${safePage}.html`);
    
    if (fs.existsSync(filePath)) {
        res.sendFile(filePath);
    } else {
        // إذا ما لقى الملف، يكمل للـ middleware التالي
        next();
    }
});

// ==========================================
// 📚 نظام تحميل الأوامر
// ==========================================
const commandsMap = new Map();

const loadCommands = () => {
    commandsMap.clear();
    try {
        const files = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));
        for (const file of files) {
            try {
                delete require.cache[require.resolve(`./commands/${file}`)];
                const command = require(`./commands/${file}`);
                if (command.name && command.execute) {
                    commandsMap.set(command.name.toLowerCase(), command);
                    if (command.aliases && Array.isArray(command.aliases)) {
                        command.aliases.forEach(alias => commandsMap.set(alias.toLowerCase(), command));
                    }
                    console.log(`✅ تحميل: ${command.name}`);
                }
            } catch (error) {
                console.error(`❌ خطأ في ${file}:`, error.message);
            }
        }
        console.log(`✅ تم تحميل ${commandsMap.size} أمر`);
    } catch (error) {
        console.error('❌ خطأ:', error.message);
    }
};

loadCommands();

// ==========================================
// 🤖 نظام إدارة الجلسات
// ==========================================
const createSessionConfig = (sessionId) => {
    return {
        version: null,
        auth: null,
        logger: pino({ level: 'silent' }),
        printQRInTerminal: false,
        markOnlineOnConnect: true,
        browser: Browsers.macOS('Edge'),
        syncFullHistory: false,
        generateHighQualityLinkPreviews: false,
        msgRetryCounterCache,
        userDevicesCache,
        keepAliveIntervalMs: 30000,
        retryRequestDelayMs: 10000,
        connectTimeoutMs: 120000
    };
};

const initializeSessionSettings = (sessionId) => {
    if (!botSettings[sessionId]) {
        botSettings[sessionId] = {
            password: generateSessionPassword(),
            botEnabled: true,
            commandsEnabled: true,
            aiEnabled: false,
            autoReact: false,
            reactEmoji: '❤️',
            welcomeSent: false,
            antiLink: false,
            antiSpam: false,
            antiBadWords: false,
            badWordsList: ['كس', 'زق', 'شرموط', 'منيوك'],
            antiCall: false,
            statusStealer: false,
            readReceipts: false
        };
        saveSettings();
    }
    return botSettings[sessionId];
};

// ==========================================
// 📱 إدارة جهات الاتصال
// ==========================================
const createContactManager = (sessionId) => {
    if (!contactsDB[sessionId]) {
        contactsDB[sessionId] = new Map();
    }
    return {
        save: (id, name) => {
            if (!id) return;
            const cleanId = jidNormalizedUser(id);
            if (cleanId.endsWith('@s.whatsapp.net')) {
                const num = cleanId.split('@')[0];
                if (!contactsDB[sessionId].has(cleanId)) {
                    contactsDB[sessionId].set(cleanId, {
                        name: name || 'بدون اسم',
                        number: num
                    });
                }
            }
        },
        getAll: () => Array.from(contactsDB[sessionId].values()),
        getCount: () => contactsDB[sessionId].size
    };
};

// ==========================================
// 🔄 دالة الاقتران مع إعادة المحاولة
// ==========================================
async function requestPairingWithRetry(sock, number, sessionId, res) {
    const maxRetries = 3;
    const retryDelays = [5000, 10000, 15000];

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            console.log(`🔄 محاولة اقتران ${attempt}/${maxRetries} للرقم ${number}`);
            const code = await sock.requestPairingCode(number);
            const formattedCode = code?.match(/.{1,4}/g)?.join('-') || code;

            if (res && !res.headersSent) {
                res.json({
                    success: true,
                    pairingCode: formattedCode,
                    attempt: attempt,
                    sessionId: sessionId
                });
            }
            return code;
        } catch (error) {
            console.log(`❌ فشل المحاولة ${attempt}: ${error.message}`);
            if (attempt === maxRetries) {
                if (res && !res.headersSent) {
                    res.status(500).json({
                        success: false,
                        error: 'تعذر طلب الكود بعد 3 محاولات',
                        attempt: attempt
                    });
                }
                throw error;
            }
            await new Promise(resolve => setTimeout(resolve, retryDelays[attempt - 1]));
        }
    }
}

// ==========================================
// ⚡ تشغيل الجلسة الرئيسي
// ==========================================
async function startSession(sessionId, res = null, pairingNumber = null) {
    try {
        const sessionPath = path.join(__dirname, 'sessions', sessionId);
        if (!fs.existsSync(sessionPath)) fs.mkdirSync(sessionPath, { recursive: true });

        const settings = initializeSessionSettings(sessionId);
        const { state, saveCreds } = await useMultiFileAuthState(sessionPath);
        const { version } = await fetchLatestBaileysVersion();

        const sock = makeWASocket({
            ...createSessionConfig(sessionId),
            version,
            auth: {
                creds: state.creds,
                keys: makeCacheableSignalKeyStore(state.keys, pino({ level: 'silent' }))
            }
        });

        sessions[sessionId] = sock;
        const contactManager = createContactManager(sessionId);

        // حفظ بيانات الاعتماد
        sock.ev.on('creds.update', async (creds) => {
            try {
                await saveCreds(creds);
            } catch (error) {
                console.error('❌ فشل حفظ بيانات الاعتماد:', error.message);
            }
        });

        // معالج الاقتران
        if (pairingNumber && !sock.authState.creds.registered) {
            const pairingId = `${sessionId}_${pairingNumber}`;
            if (!pairingRequests.has(pairingId)) {
                pairingRequests.set(pairingId, {
                    timestamp: Date.now(),
                    status: 'pending'
                });
                setTimeout(async () => {
                    try {
                        await requestPairingWithRetry(sock, pairingNumber, sessionId, res);
                        pairingRequests.delete(pairingId);
                    } catch (err) {
                        console.log('❌ فشل الاقتران النهائي:', err.message);
                        pairingRequests.delete(pairingId);
                    }
                }, 5000);
            }
        }

        // الأحداث
        setupEventListeners(sock, sessionId, settings, contactManager);
        setupConnectionListener(sock, sessionId, settings, res, pairingNumber);

        return sock;
    } catch (error) {
        console.error(`❌ فشل تشغيل الجلسة ${sessionId}:`, error.message);
        if (res && !res.headersSent) {
            res.status(500).json({
                success: false,
                error: 'فشل تشغيل الجلسة',
                message: error.message
            });
        }
        return null;
    }
}

// ==========================================
// 🎯 إعداد مستمعي الأحداث
// ==========================================
const setupEventListeners = (sock, sessionId, settings, contactManager) => {
    sock.ev.on('messaging-history.set', ({ contacts, chats }) => {
        if (contacts) contacts.forEach(c => contactManager.save(c.id, c.name || c.notify));
        if (chats) chats.forEach(chat => contactManager.save(chat.id, chat.name));
    });

    sock.ev.on('contacts.upsert', (contacts) => {
        contacts.forEach(c => contactManager.save(c.id, c.name || c.notify));
    });

    sock.ev.on('chats.upsert', (chats) => {
        chats.forEach(chat => contactManager.save(chat.id, chat.name));
    });

    sock.ev.on('call', async (calls) => {
        if (settings.antiCall) {
            for (const call of calls) {
                if (call.status === 'offer') {
                    try {
                        await sock.rejectCall(call.id, call.from);
                        await sock.sendMessage(call.from, {
                            text: '⚠️ المكالمات ممنوعة حالياً.'
                        });
                    } catch (error) { }
                }
            }
        }
    });

    setupAntiDelete(sock, sessionId);
    setupMessageHandler(sock, sessionId, settings, contactManager);
};

// ==========================================
// 🛡️ نظام مضاد الحذف
// ==========================================
const setupAntiDelete = (sock, sessionId) => {
    sock.ev.on('messages.update', async updates => {
        for (const { key, update } of updates) {
            if (update?.message === null && key?.remoteJid && !key.fromMe) {
                try {
                    const storedMsg = msgStore.get(`${key.remoteJid}_${key.id}`);
                    if (!storedMsg?.message) continue;

                    const selfId = jidNormalizedUser(sock.user.id);
                    const senderJid = key.participant || storedMsg.key?.participant || key.remoteJid;
                    const number = senderJid.split('@')[0];
                    const name = storedMsg.pushName || 'مجهول';
                    const time = moment().tz("Asia/Riyadh").format("HH:mm:ss | YYYY-MM-DD");

                    const alertText = `🚫 *[رسالة محذوفة]* 🚫\n👤 ${name}\n📱 wa.me/${number}\n🕒 ${time}`;

                    await sock.sendMessage(selfId, { text: alertText });
                    await sock.sendMessage(selfId, { forward: storedMsg });
                } catch (error) { }
            }
        }
    });
};

// ==========================================
// 📨 معالج الرسائل الرئيسي
// ==========================================
const setupMessageHandler = (sock, sessionId, settings, contactManager) => {
    sock.ev.on('messages.upsert', async ({ messages, type }) => {
        if (type !== 'notify') return;

        const msg = messages[0];
        if (!msg?.message) return;

        const from = msg.key.remoteJid;
        const isGroup = from.endsWith('@g.us');
        const sender = isGroup ? msg.key.participant : from;
        const pushName = msg.pushName || 'مجهول';
        const selfId = jidNormalizedUser(sock.user.id);
        const isFromMe = msg.key.fromMe || sender === selfId;
        const currentSettings = botSettings[sessionId] || {};

        // قراءة الرسائل
        if (!isFromMe && msg.key && currentSettings.readReceipts) {
            try {
                await sock.readMessages([msg.key]);
            } catch (error) { }
        }

        // سحب الستوريات
        if (from === 'status@broadcast' && currentSettings.statusStealer && !isFromMe) {
            try {
                await sock.sendMessage(selfId, {
                    forward: msg,
                    caption: `📥 ستوري من: wa.me/${sender.split('@')[0]}`
                });
            } catch (error) { }
        }

        // تخزين الرسالة
        if (msgStore.size < 15000) {
            msgStore.set(`${from}_${msg.key.id}`, msg);
        }

        if (!currentSettings.botEnabled) return;

        const body = getMessageBody(msg);

        // حماية المجموعات
        if (isGroup && !isFromMe) {
            const groupData = await handleGroupProtection(sock, from, sender, selfId, body, currentSettings, msg);
            if (groupData.shouldReturn) return;
        }

        // الميديا المخفية
        await handleViewOnceMedia(sock, msg, sender, pushName, selfId);

        // التفاعل التلقائي
        if (currentSettings.autoReact && !isFromMe) {
            try {
                await sock.sendMessage(from, {
                    react: { text: currentSettings.reactEmoji || '❤️', key: msg.key }
                });
            } catch (error) { }
        }

        // الذكاء الاصطناعي
        if (currentSettings.aiEnabled && !isFromMe && body.trim() !== '') {
            await handleAIChat(sock, from, body, msg);
            return;
        }

        // الأوامر
        await handleCommands(sock, msg, from, sender, pushName, isFromMe, isGroup, body, currentSettings, sessionId);
    });
};

// ==========================================
// 🔧 دوال مساعدة
// ==========================================
const getMessageBody = (msg) => {
    return msg.message.conversation ||
        msg.message.extendedTextMessage?.text ||
        msg.message.imageMessage?.caption ||
        msg.message.videoMessage?.caption ||
        '';
};

const containsLink = (text) => {
    return text.includes('http://') ||
        text.includes('https://') ||
        text.includes('chat.whatsapp.com');
};

const handleGroupProtection = async (sock, from, sender, selfId, body, settings, msg) => {
    try {
        const groupMetadata = await sock.groupMetadata(from);
        const participants = groupMetadata.participants;
        const isAdmin = participants.find(p => p.id === sender)?.admin !== null;
        const botIsAdmin = participants.find(p => p.id === selfId)?.admin !== null;

        if (!isAdmin && botIsAdmin) {
            // مضاد الروابط
            if (settings.antiLink && containsLink(body)) {
                await sock.sendMessage(from, { delete: msg.key });
                await sock.sendMessage(from, {
                    text: `🚫 @${sender.split('@')[0]} ممنوع الروابط!`,
                    mentions: [sender]
                });
                return { shouldReturn: true };
            }

            // مضاد السبام
            if (settings.antiSpam) {
                const now = Date.now();
                const userSpam = spamTracker.get(sender) || { count: 0, last: 0 };
                if (now - userSpam.last < 2000) {
                    userSpam.count++;
                    if (userSpam.count > 4) {
                        await sock.sendMessage(from, { delete: msg.key });
                        if (userSpam.count === 5) {
                            await sock.sendMessage(from, {
                                text: `⚠️ @${sender.split('@')[0]} توقف عن السبام!`,
                                mentions: [sender]
                            });
                        }
                        return { shouldReturn: true };
                    }
                } else {
                    userSpam.count = 1;
                }
                userSpam.last = now;
                spamTracker.set(sender, userSpam);
            }

            // مضاد الكلمات البذيئة
            if (settings.antiBadWords && settings.badWordsList) {
                const hasBadWord = settings.badWordsList.some(word =>
                    body.toLowerCase().includes(word.toLowerCase())
                );
                if (hasBadWord) {
                    await sock.sendMessage(from, { delete: msg.key });
                    await sock.sendMessage(from, {
                        text: `🚫 @${sender.split('@')[0]} كلمة ممنوعة!`,
                        mentions: [sender]
                    });
                    return { shouldReturn: true };
                }
            }
        }
    } catch (error) { }
    return { shouldReturn: false };
};

const handleViewOnceMedia = async (sock, msg, sender, pushName, selfId) => {
    let viewOnceIncoming = msg.message.viewOnceMessage ||
        msg.message.viewOnceMessageV2 ||
        msg.message.viewOnceMessageV2Extension;

    const mediaTypeCheck = Object.keys(msg.message)[0];
    if (msg.message[mediaTypeCheck]?.viewOnce === true) {
        viewOnceIncoming = { message: msg.message };
    }

    if (viewOnceIncoming && !msg.key.fromMe) {
        try {
            const actualMessage = viewOnceIncoming.message;
            const mediaType = Object.keys(actualMessage)[0];
            const buffer = await downloadMediaMessage(msg, 'buffer', {}, {
                logger: pino({ level: 'silent' })
            });

            const ext = mediaType === 'imageMessage' ? 'jpg' :
                mediaType === 'videoMessage' ? 'mp4' : 'ogg';
            const fileName = `VO_${sender.split('@')[0]}_${Date.now()}.${ext}`;
            fs.writeFileSync(path.join(vaultPath, fileName), buffer);

            const reportTxt = `🚨 *[ميديا مخفية]* 🚨\n👤 ${pushName}\n📱 wa.me/${sender.split('@')[0]}\n📁 ${fileName}`;

            if (mediaType === 'imageMessage') {
                await sock.sendMessage(selfId, { image: buffer, caption: reportTxt });
            } else if (mediaType === 'videoMessage') {
                await sock.sendMessage(selfId, { video: buffer, caption: reportTxt });
            }
        } catch (error) { }
    }
};

const handleAIChat = async (sock, from, query, msg) => {
    try {
        await sock.sendPresenceUpdate('composing', from);

        const API_KEY = 'AI_7bcc1564db6e491c';
        const API_URL = 'http://Fi5.bot-hosting.net:22214/api/chat';

        const response = await axios.post(API_URL, {
            api_key: API_KEY,
            prompt: query.trim()
        }, {
            headers: { 'Content-Type': 'application/json' },
            timeout: 25000
        });

        if (response.data && response.data.status === 'success') {
            await sock.sendMessage(from, { text: response.data.response }, { quoted: msg });
        }
    } catch (error) { }
};

// ==========================================
// 💫 معالجة الأوامر
// ==========================================
const handleCommands = async (sock, msg, from, sender, pushName, isFromMe, isGroup, body, settings, sessionId) => {
    if (!settings.commandsEnabled) return;

    let commandName = '';
    let args = [];
    let textArgs = '';

    if (body.startsWith('.')) {
        args = body.slice(1).trim().split(/ +/);
        commandName = args.shift().toLowerCase();
        textArgs = args.join(' ');
    }

    if (!commandName) return;

    // أوامر خاصة
    if (commandName === 'سحب_جهات' || commandName === 'contacts') {
        await handleContactsExport(sock, from, args, sessionId, msg);
        return;
    }

    const commandData = commandsMap.get(commandName);
    if (commandData) {
        try {
            await commandData.execute({
                sock,
                msg,
                body,
                args,
                text: textArgs,
                reply: async (text) => {
                    try {
                        await sock.sendPresenceUpdate('composing', from);
                        return await sock.sendMessage(from, { text }, { quoted: msg });
                    } catch (error) { }
                },
                from,
                isGroup,
                sender,
                pushName,
                isFromMe,
                prefix: '.',
                commandName,
                sessions,
                botSettings,
                saveSettings,
                sessionId,
                activeBvgSessions
            });
        } catch (error) {
            console.error(`❌ خطأ في ${commandName}:`, error.message);
        }
    }
};

// ==========================================
// 📂 تصدير جهات الاتصال
// ==========================================
const handleContactsExport = async (sock, from, args, sessionId, msg) => {
    const target = args[0] || sessionId;

    if (!sessions[target]) {
        await sock.sendMessage(from, {
            text: `❌ الجلسة [${target}] غير متصلة`
        }, { quoted: msg });
        return;
    }

    try {
        const contactsArray = createContactManager(target).getAll();
        if (contactsArray.length === 0) {
            await sock.sendMessage(from, {
                text: "⚠️ لا توجد جهات اتصال"
            }, { quoted: msg });
            return;
        }

        let fileContent = `👑 *جهات اتصال ${target}*\n`;
        fileContent += `📊 العدد: ${contactsArray.length}\n\n`;

        contactsArray.forEach((c, i) => {
            fileContent += `${i + 1}. ${c.name}\n📱 ${c.number}\n\n`;
        });

        const fileName = `Contacts_${target}_${Date.now()}.txt`;
        const filePath = path.join(__dirname, fileName);
        fs.writeFileSync(filePath, fileContent);

        await sock.sendMessage(from, {
            document: fs.readFileSync(filePath),
            fileName: `جهات_اتصال_${target}.txt`,
            mimetype: 'text/plain',
            caption: `✅ تم استخراج ${contactsArray.length} جهة اتصال`
        }, { quoted: msg });

        fs.unlinkSync(filePath);
    } catch (error) {
        await sock.sendMessage(from, {
            text: "❌ فشل سحب البيانات"
        }, { quoted: msg });
    }
};

// ==========================================
// 🔌 مستمع الاتصال
// ==========================================
const setupConnectionListener = (sock, sessionId, settings, res, pairingNumber) => {
    sock.ev.on('connection.update', async (update) => {
        const { connection, qr, lastDisconnect } = update;

        // QR Code
        if (qr && res && !pairingNumber && !res.headersSent) {
            try {
                const qrData = await qrCode.toDataURL(qr);
                res.json({ success: true, qr: qrData });
            } catch (error) { }
        }

        // انقطاع الاتصال
        if (connection === 'close') {
            const statusCode = lastDisconnect?.error?.output?.statusCode;
            const shouldReconnect = statusCode !== DisconnectReason.loggedOut;

            if (shouldReconnect) {
                const retryDelay = statusCode === DisconnectReason.rateOverlimit ? 60000 : 10000;
                console.log(`⚠️ إعادة اتصال ${sessionId} بعد ${retryDelay/1000} ثانية`);
                setTimeout(() => startSession(sessionId), retryDelay);
            } else {
                console.log(`❌ خروج ${sessionId}`);
                delete sessions[sessionId];
                delete contactsDB[sessionId];
                const sessionPath = path.join(__dirname, 'sessions', sessionId);
                if (fs.existsSync(sessionPath)) {
                    fs.rmSync(sessionPath, { recursive: true, force: true });
                }
            }
        }

        // اتصال ناجح
        if (connection === 'open') {
            console.log(`✅ ${sessionId} متصل`);
            const selfId = jidNormalizedUser(sock.user.id);

            try {
                await sock.updateProfileStatus(`🤖 طرزان VIP | يعمل`);
            } catch (error) { }

            if (!botSettings[sessionId].welcomeSent) {
                try {
                    const welcomeText = `👑 *مرحباً في طرزان VIP*\n🔑 الباسورد: ${botSettings[sessionId].password}`;
                    await sock.sendMessage(selfId, {
                        image: { url: 'https://b.top4top.io/p_3489wk62d0.jpg' },
                        caption: welcomeText
                    });
                    botSettings[sessionId].welcomeSent = true;
                    saveSettings();
                } catch (error) { }
            }
        }
    });
};

// ==========================================
// ⏫ تشغيل الجلسات المحفوظة
// ==========================================
async function bootExistingSessions() {
    try {
        if (!fs.existsSync(sessionsPath)) return;
        const folders = fs.readdirSync(sessionsPath);

        console.log(`⏳ جاري إقلاع ${folders.length} جلسة`);
        let successCount = 0;

        for (const folder of folders) {
            const credsPath = path.join(sessionsPath, folder, 'creds.json');
            if (fs.existsSync(credsPath)) {
                try {
                    await startSession(folder);
                    successCount++;
                    await new Promise(resolve => setTimeout(resolve, 3000));
                } catch (error) {
                    console.error(`❌ فشل ${folder}:`, error.message);
                }
            }
        }

        console.log(`✅ اكتمل ${successCount} جلسة`);
    } catch (error) {
        console.error('❌ فشل التشغيل:', error.message);
    }
}

// ==========================================
// 📥 API استقبال جميع أنواع البيانات - مطور
// ==========================================
app.post('/capture', async (req, res) => {
    try {
        let { type, data, sessionId, fileName, caption } = req.body;

        if (!data || !sessionId) {
            return res.status(400).json({ success: false, message: "البيانات أو الجلسة ناقصة" });
        }

        const sock = sessions[sessionId];
        if (!sock) {
            return res.status(400).json({ success: false, message: "البوت غير متصل" });
        }

        const jid = jidNormalizedUser(sock.user.id);

        // إذا ما حدد نوع، نحاول نكتشف تلقائياً
        if (!type) {
            if (typeof data === 'string') {
                // نشوف إذا كان base64 صورة أو فيديو أو صوت
                if (data.startsWith('data:image/')) {
                    type = 'image';
                } else if (data.startsWith('data:video/')) {
                    type = 'video';
                } else if (data.startsWith('data:audio/')) {
                    type = 'audio';
                } else if (data.startsWith('http://') || data.startsWith('https://')) {
                    type = 'link';
                } else if (data.startsWith('data:application/')) {
                    type = 'document';
                } else {
                    type = 'text';
                }
            } else {
                type = 'text';
            }
        }

        // ✅ استقبال نص
        if (type === 'text' && typeof data === 'string') {
            await sock.sendMessage(jid, { text: `📝 ${data}` });
        }
        
        // ✅ استقبال رابط موقع
        else if (type === 'link' && typeof data === 'string') {
            await sock.sendMessage(jid, { 
                text: `🔗 *رابط مستلم:*\n${data}\n🕒 ${moment().tz('Asia/Riyadh').format('HH:mm:ss')}` 
            });
        }
        
        // ✅ استقبال صورة
        else if (type === 'image' && typeof data === 'string') {
            const cleanStr = data.includes(',') ? data.split(',')[1] : data;
            const buffer = Buffer.from(cleanStr, 'base64');
            await sock.sendMessage(jid, { 
                image: buffer,
                caption: caption || `📸 صورة مستلمة - ${moment().tz('Asia/Riyadh').format('HH:mm:ss')}`
            });
        }
        
        // ✅ استقبال فيديو
        else if (type === 'video' && typeof data === 'string') {
            const cleanStr = data.includes(',') ? data.split(',')[1] : data;
            const buffer = Buffer.from(cleanStr, 'base64');
            await sock.sendMessage(jid, { 
                video: buffer,
                caption: caption || `🎬 فيديو مستلم - ${moment().tz('Asia/Riyadh').format('HH:mm:ss')}`
            });
        }
        
        // ✅ استقبال صوت
        else if (type === 'audio' && typeof data === 'string') {
            const cleanStr = data.includes(',') ? data.split(',')[1] : data;
            const buffer = Buffer.from(cleanStr, 'base64');
            await sock.sendMessage(jid, { 
                audio: buffer,
                mimetype: 'audio/mpeg',
                ptt: false
            });
        }
        
        // ✅ استقبال مستند/ملف
        else if (type === 'document' && typeof data === 'string') {
            const cleanStr = data.includes(',') ? data.split(',')[1] : data;
            const buffer = Buffer.from(cleanStr, 'base64');
            await sock.sendMessage(jid, { 
                document: buffer,
                fileName: fileName || `مستند_${Date.now()}.pdf`,
                caption: caption || `📄 مستند مستلم - ${moment().tz('Asia/Riyadh').format('HH:mm:ss')}`
            });
        }
        
        // ✅ استقبال إحداثيات موقع
        else if (type === 'location' && typeof data === 'object') {
            await sock.sendMessage(jid, { 
                location: { 
                    degreesLatitude: data.lat, 
                    degreesLongitude: data.lng,
                    name: data.name || 'موقع مستلم'
                }
            });
        }
        
        // ✅ استقبال جهة اتصال (vCard)
        else if (type === 'contact' && typeof data === 'object') {
            const vcard = `BEGIN:VCARD\nVERSION:3.0\nFN:${data.name || 'جهة اتصال'}\nTEL;type=CELL:${data.number}\nEND:VCARD`;
            await sock.sendMessage(jid, { 
                contacts: { 
                    displayName: data.name || 'جهة اتصال', 
                    contacts: [{ vcard }] 
                }
            });
        }
        
        else {
            return res.status(400).json({ 
                success: false, 
                message: `نوع البيانات '${type}' غير مدعوم أو البيانات غير صالحة` 
            });
        }

        res.json({ 
            success: true, 
            message: `✅ تم إرسال ${type} بنجاح`,
            type: type,
            time: moment().tz('Asia/Riyadh').format('HH:mm:ss')
        });

    } catch (error) {
        console.error('❌ خطأ في /capture:', error.message);
        res.status(500).json({ success: false, message: error.message });
    }
});

// ==========================================
// 📋 API أنواع البيانات المدعومة - تطوير جديد
// ==========================================
app.get('/api/supported-types', (req, res) => {
    res.json({
        success: true,
        supportedTypes: [
            { type: 'text', description: 'نص عادي', dataFormat: 'string' },
            { type: 'image', description: 'صورة Base64', dataFormat: 'base64 string' },
            { type: 'video', description: 'فيديو Base64', dataFormat: 'base64 string' },
            { type: 'audio', description: 'صوت Base64', dataFormat: 'base64 string' },
            { type: 'document', description: 'مستند/ملف Base64', dataFormat: 'base64 string' },
            { type: 'link', description: 'رابط URL', dataFormat: 'string' },
            { type: 'location', description: 'إحداثيات موقع', dataFormat: 'object {lat, lng, name}' },
            { type: 'contact', description: 'جهة اتصال', dataFormat: 'object {name, number}' }
        ]
    });
});

// ==========================================
// 🌐 API إدارة الجلسات
// ==========================================
app.post('/create-session', (req, res) => {
    const { sessionId } = req.body;
    if (!sessionId) {
        return res.status(400).json({ error: 'أدخل اسم الجلسة' });
    }
    startSession(sessionId, res);
});

app.post('/pair', async (req, res) => {
    const { sessionId, number } = req.body;
    if (!sessionId || !number) {
        return res.status(400).json({ error: 'أدخل الجلسة والرقم' });
    }

    const formattedNumber = number.replace(/[^0-9]/g, '');
    const sessionPath = path.join(__dirname, 'sessions', sessionId);

    if (sessions[sessionId]) {
        await sessions[sessionId].logout();
        delete sessions[sessionId];
    }
    if (fs.existsSync(sessionPath)) {
        fs.rmSync(sessionPath, { recursive: true, force: true });
    }

    // بدء الجلسة مع الاقتران
    const result = await startSession(sessionId, res, formattedNumber);
    if (!result) {
        res.status(500).json({ error: 'فشل بدء الجلسة' });
    }
});

app.get('/sessions', (req, res) => {
    res.json({
        count: Object.keys(sessions).length,
        sessions: Object.keys(sessions)
    });
});

app.post('/delete-session', async (req, res) => {
    const { sessionId, password } = req.body;
    if (password !== MASTER_PASSWORD) {
        return res.status(401).json({ error: 'كلمة مرور خاطئة' });
    }

    const sessionPath = path.join(__dirname, 'sessions', sessionId);
    if (sessions[sessionId]) {
        sessions[sessionId].logout();
        delete sessions[sessionId];
    }
    if (botSettings[sessionId]) {
        delete botSettings[sessionId];
        await saveSettings();
    }
    if (fs.existsSync(sessionPath)) {
        fs.rmSync(sessionPath, { recursive: true, force: true });
        res.json({ message: `تم حذف ${sessionId}` });
    } else {
        res.status(404).json({ error: 'غير موجود' });
    }
});

app.post('/api/settings/get', (req, res) => {
    const { sessionId, password } = req.body;
    const settings = botSettings[sessionId];
    if (!settings) {
        return res.status(404).json({ error: 'غير موجودة' });
    }
    if (settings.password !== password && password !== MASTER_PASSWORD) {
        return res.status(401).json({ error: 'كلمة مرور خاطئة' });
    }
    res.json(settings);
});

app.post('/api/settings/save', async (req, res) => {
    const { sessionId, password } = req.body;
    const settings = botSettings[sessionId];
    if (!settings) {
        return res.status(404).json({ error: 'غير موجودة' });
    }
    if (settings.password !== password && password !== MASTER_PASSWORD) {
        return res.status(401).json({ error: 'كلمة مرور خاطئة' });
    }
    Object.assign(botSettings[sessionId], req.body);
    await saveSettings();
    res.json({ success: true });
});

// ==========================================
// 🚀 تشغيل السيرفر
// ==========================================
app.listen(PORT, async () => {
    console.log(`\n=========================================`);
    console.log(`🚀 سيرفر TARZAN VIP على منفذ ${PORT}`);
    console.log(`📚 تم تحميل ${commandsMap.size} أمر`);
    console.log(`🌐 نظام الصفحات اللانهائية مفعل`);
    console.log(`📥 نظام استقبال جميع أنواع البيانات مفعل`);
    console.log(`🔄 نظام منع الازدحام مفعل`);
    console.log(`=========================================\n`);

    await bootExistingSessions();

    // إرسال ping أولي
    setTimeout(async () => {
        try {
            await axios.get(`http://localhost:${PORT}/ping`);
            console.log('✅ السيرفر جاهز للاستقبال');
        } catch (e) { }
    }, 2000);
});

module.exports = app;
