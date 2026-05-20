const { downloadMediaMessage } = require('@whiskeysockets/baileys');
const { Client } = require("basic-ftp");
const { Readable } = require('stream');

module.exports = {
    name: 'رفع',
    aliases: ['upload', 'استضافة', 'رابط'],
    execute: async ({ sock, msg, reply, from }) => {
        
        const isDocument = msg.message?.documentMessage;
        const quotedMsgContext = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
        const isQuotedDocument = quotedMsgContext?.documentMessage;

        if (!isDocument && !isQuotedDocument) {
            return reply('❌ *يرجى إرسال ملف برمجي أو الرد على ملف، ثم كتابة .رفع*');
        }

        const docMessage = isDocument ? msg.message.documentMessage : quotedMsgContext.documentMessage;
        const originalName = docMessage.fileName || 'unknown_file';
        const fileExtension = originalName.split('.').pop().toLowerCase();

        if (fileExtension !== 'php' && fileExtension !== 'html') {
            return reply(`❌ *نظام الحماية يمنع رفع هذا النوع من الملفات.*\n\n*الصيغة المرفوعة:* (.${fileExtension})\n*الصيغ المسموحة:* (.html) و (.php) فقط.`);
        }

        try {
            await sock.sendMessage(from, { react: { text: '☁️', key: msg.key } });
            reply(`⏳ *جاري الاتصال بالسيرفر ورفع ملف (${fileExtension.toUpperCase()})...*`);

            const messageToDownload = isDocument ? msg : { message: quotedMsgContext };
            const mediaBuffer = await downloadMediaMessage(messageToDownload, 'buffer', {}, { logger: console });

            const uniqueId = Math.floor(Math.random() * 90000) + 10000;
            const finalFileName = `${uniqueId}_${originalName.replace(/\s+/g, '_')}`;

            const ftpClient = new Client();
            
            // الاتصال بالسيرفر بناءً على بياناتك
            await ftpClient.access({
                host: "ftpupload.net",
                user: "ezyro_41968850",
                password: "48a1b6473a0ca",
                secure: false
            });

            const sourceStream = Readable.from(mediaBuffer);

            // الدخول للمجلد الرئيسي المرتبط بالنطاق
            await ftpClient.cd("htdocs");
            
            await sock.sendMessage(from, { react: { text: '🚀', key: msg.key } });
            
            // رفع الملف
            await ftpClient.uploadFrom(sourceStream, finalFileName);
            ftpClient.close();

            // 👑 التصحيح الأهم: استخدام النطاق الرئيسي الصحيح من لوحة التحكم
            const directLink = `http://87ebd98f.ezyro.com/${encodeURIComponent(finalFileName)}`;

            const successMsg = `🌐 *تم استضافة المشروع بنجاح!*\n\n📄 *اسم الملف:* ${originalName}\n🛠️ *النوع:* ${fileExtension.toUpperCase()} Script\n📦 *الحجم:* ${(mediaBuffer.length / 1024).toFixed(2)} KB\n\n🔗 *رابط المعاينة المباشر:*\n${directLink}\n\n👑 *سيرفرات طرزان السحابية*`;

            await sock.sendMessage(from, { text: successMsg }, { quoted: msg });
            await sock.sendMessage(from, { react: { text: '✅', key: msg.key } });

        } catch (error) {
            console.error('❌ خطأ في أمر الرفع:', error);
            await sock.sendMessage(from, { react: { text: '❌', key: msg.key } });
            reply(`❌ *فشل الاتصال بالاستضافة.*`);
        }
    }
};
