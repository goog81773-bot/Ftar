const { downloadMediaMessage } = require('@whiskeysockets/baileys');
const { Client } = require("basic-ftp");
const { Readable } = require('stream');

module.exports = {
    name: 'رفع',
    aliases: ['upload', 'استضافة', 'رابط'],
    execute: async ({ sock, msg, reply, from }) => {
        
        // التحقق من أن الملف المرسل هو "مستند" (Document) فقط
        const isDocument = msg.message?.documentMessage;
        const quotedMsgContext = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
        const isQuotedDocument = quotedMsgContext?.documentMessage;

        if (!isDocument && !isQuotedDocument) {
            return reply('❌ *يرجى إرسال ملف برمجي أو الرد على ملف، ثم كتابة .رفع*');
        }

        // جلب معلومات الملف
        const docMessage = isDocument ? msg.message.documentMessage : quotedMsgContext.documentMessage;
        const originalName = docMessage.fileName || 'unknown_file';
        
        // استخراج امتداد الملف (الصيغة)
        const fileExtension = originalName.split('.').pop().toLowerCase();

        // 🛡️ نظام الحماية: التحقق من الصيغة (السماح فقط بـ php و html)
        if (fileExtension !== 'php' && fileExtension !== 'html') {
            return reply(`❌ *عذراً، نظام الحماية يمنع رفع هذا النوع من الملفات.*\n\n*الصيغة المرفوعة:* (.${fileExtension})\n*الصيغ المسموحة:* (.html) و (.php) فقط.\n\n🛡️ _سيرفرات طرزان الآمنة_`);
        }

        try {
            await sock.sendMessage(from, { react: { text: '☁️', key: msg.key } });
            reply(`⏳ *جاري فحص ملف الـ (${fileExtension.toUpperCase()}) ورفعه للسيرفر...*`);

            // 1. تحميل الملف
            const messageToDownload = isDocument ? msg : { message: quotedMsgContext };
            const mediaBuffer = await downloadMediaMessage(messageToDownload, 'buffer', {}, { logger: console });

            // 2. تجهيز اسم الملف (نضيف رقم عشوائي لمنع استبدال الملفات إذا كان لها نفس الاسم)
            const uniqueId = Math.floor(Math.random() * 90000) + 10000;
            const finalFileName = `${uniqueId}_${originalName.replace(/\s+/g, '_')}`;

            // 3. الاتصال بسيرفر FTP
            const ftpClient = new Client();
            await ftpClient.access({
                host: "ftpupload.net",
                user: "ezyro_41968850",
                password: "48a1b6473a0ca",
                secure: false
            });

            const sourceStream = Readable.from(mediaBuffer);

            // الانتقال لمجلد الموقع
            await ftpClient.cd("htdocs");
            
            await sock.sendMessage(from, { react: { text: '🚀', key: msg.key } });
            
            // الرفع الفعلي
            await ftpClient.uploadFrom(sourceStream, finalFileName);
            ftpClient.close(); // إغلاق الاتصال

            // 4. إرجاع الرابط المباشر
            const directLink = `http://tarzan.liveblog365.com/${encodeURIComponent(finalFileName)}`;

            const successMsg = `🌐 *تم استضافة المشروع بنجاح!*\n\n📄 *اسم الملف:* ${originalName}\n🛠️ *النوع:* ${fileExtension.toUpperCase()} Script\n📦 *الحجم:* ${(mediaBuffer.length / 1024).toFixed(2)} KB\n\n🔗 *رابط المعاينة المباشر:*\n${directLink}\n\n👑 *سيرفرات طرزان السحابية*`;

            await sock.sendMessage(from, { text: successMsg }, { quoted: msg });
            await sock.sendMessage(from, { react: { text: '✅', key: msg.key } });

        } catch (error) {
            console.error('❌ خطأ في أمر الرفع:', error);
            await sock.sendMessage(from, { react: { text: '❌', key: msg.key } });
            reply('❌ *حدث خطأ أثناء الاتصال بالاستضافة.*');
        }
    }
};
