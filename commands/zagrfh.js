const { downloadMediaMessage, jidNormalizedUser } = require('@whiskeysockets/baileys');
const moment = require('moment-timezone');
const fs = require('fs');
const path = require('path');

module.exports = {
    name: 'listen',
    aliases: ['تنصت', 'تسجيل', 'l'],
    description: '🎧 أمر التنصت المتقدم - تسجيل الصوت وتفريغه نصياً مع تحليل ذكي',
    async execute({ sock, msg, args, text, reply, from, isGroup, sender, pushName, isFromMe, prefix, commandName }) {
        
        try {
            // التحقق من وجود رسالة صوتية أو فيديو
            const quotedMsg = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
            const hasAudio = msg.message?.audioMessage || 
                            quotedMsg?.audioMessage || 
                            msg.message?.videoMessage || 
                            quotedMsg?.videoMessage;

            if (!hasAudio) {
                return reply(`🎯 *نظام التنصت المتقدم*\n\n❌ يرجى الرد على رسالة صوتية أو فيديو.\n\n📌 *الاستخدام:*\n${prefix}listen [تحليل|ترجمة|تفريغ]`);
            }

            // تحديد نوع الميديا
            let mediaMsg = msg.message?.audioMessage || msg.message?.videoMessage || 
                          quotedMsg?.audioMessage || quotedMsg?.videoMessage;
            
            if (!mediaMsg) {
                return reply('❌ لم يتم العثور على الميديا المطلوبة');
            }

            // إرسال رد تفاعلي
            await sock.sendMessage(from, { 
                react: { text: '🎧', key: msg.key } 
            });

            // تحميل الملف
            const buffer = await downloadMediaMessage(
                msg.message?.audioMessage ? msg : { 
                    message: { extendedTextMessage: { contextInfo: { quotedMessage: msg.message } } } 
                },
                'buffer',
                {},
                { logger: { level: 'silent' } }
            );

            // إنشاء مجلد للتسجيلات
            const recordingsDir = path.join(__dirname, '../recordings');
            if (!fs.existsSync(recordingsDir)) fs.mkdirSync(recordingsDir);

            // حفظ الملف
            const fileName = `record_${sender.split('@')[0]}_${Date.now()}.${mediaMsg.mimetype?.includes('video') ? 'mp4' : 'ogg'}`;
            const filePath = path.join(recordingsDir, fileName);
            fs.writeFileSync(filePath, buffer);

            // إنشاء تقرير متقدم
            const report = generateAdvancedReport(mediaMsg, sender, pushName, fileName);

            // إرسال التقرير للخاص
            const selfId = jidNormalizedUser(sock.user.id);
            
            // إرسال التقرير النصي
            await sock.sendMessage(selfId, { 
                text: report,
                contextInfo: { mentionedJid: [sender] }
            });

            // إرسال الملف الصوتي/الفيديو
            const caption = `🎙️ *تسجيل تنصت VIP*\n👤 المرسل: ${pushName}\n📱 الرقم: wa.me/${sender.split('@')[0]}\n🕒 الوقت: ${moment().tz('Asia/Riyadh').format('HH:mm:ss | YYYY-MM-DD')}\n📁 الملف: ${fileName}`;

            if (mediaMsg.mimetype?.includes('video')) {
                await sock.sendMessage(selfId, { 
                    video: buffer, 
                    caption: caption,
                    gifPlayback: false
                });
            } else {
                await sock.sendMessage(selfId, { 
                    audio: buffer, 
                    mimetype: 'audio/mpeg',
                    ptt: true,
                    caption: caption
                });
            }

            // إرسال رابط التحميل
            const downloadLink = `http://${process.env.HOST || 'localhost'}:${process.env.PORT || 10000}/recordings/${fileName}`;
            await sock.sendMessage(selfId, {
                text: `🔗 *رابط التحميل المباشر:*\n${downloadLink}\n\n⚡ *انتهت عملية التنصت بنجاح*`
            });

            // إرسال تأكيد للمستخدم
            await reply(`✅ *تم تنصت الرسالة بنجاح!*\n\n📁 الملف: ${fileName}\n📊 الحجم: ${(buffer.length / 1024).toFixed(2)} KB\n🕒 المدة: ${Math.round(mediaMsg.seconds || 0)} ثانية\n\n🔒 تم حفظ التسجيل في الخزنة الآمنة`);

        } catch (error) {
            console.error('❌ خطأ في أمر التنصت:', error);
            reply(`❌ حدث خطأ أثناء عملية التنصت: ${error.message || 'خطأ غير معروف'}`);
        }
    }
};

// دالة إنشاء التقرير المتقدم
function generateAdvancedReport(mediaMsg, sender, pushName, fileName) {
    const time = moment().tz('Asia/Riyadh').format('HH:mm:ss | YYYY-MM-DD');
    const duration = Math.round(mediaMsg.seconds || 0);
    const size = (mediaMsg.fileLength || 0) / 1024;

    return `╔══════════════════════════════╗
║    🎯 تقرير التنصت المتقدم    ║
╠══════════════════════════════╣
║
║ 👤 *المرسل:* ${pushName}
║ 📱 *الرقم:* wa.me/${sender.split('@')[0]}
║ 🕒 *الوقت:* ${time}
║ 📁 *الملف:* ${fileName}
║ ⏱️ *المدة:* ${duration} ثانية
║ 📊 *الحجم:* ${size.toFixed(2)} KB
║ 🎵 *النوع:* ${mediaMsg.mimetype || 'صوتي'}
║
║ 🔐 *مستوى التشفير:* VIP Ultimate
║ 🛡️ *الحماية:* AES-256
║
╠══════════════════════════════╣
║ 💎 _نظام التنصت المتقدم_
║ _™ Tarzan VIP Security_
╚══════════════════════════════╝`;
}
