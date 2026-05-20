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
            return reply(`❌ *نظام الحماية يمنع رفع هذا النوع من الملفات.*\n\n*الصيغ المسموحة:* (.html) و (.php) فقط.`);
        }

        try {
            await sock.sendMessage(from, { react: { text: '☁️', key: msg.key } });
            reply(`⏳ *جاري تجاوز حماية السيرفر ورفع الملف...*`);

            const messageToDownload = isDocument ? msg : { message: quotedMsgContext };
            const mediaBuffer = await downloadMediaMessage(messageToDownload, 'buffer', {}, { logger: console });

            const uniqueId = Math.floor(Math.random() * 90000) + 10000;
            const finalFileName = `${uniqueId}_${originalName.replace(/\s+/g, '_')}`;

            const ftpClient = new Client();
            
            await ftpClient.access({
                host: "ftpupload.net",
                user: "ezyro_41968850",
                password: "48a1b6473a0ca",
                secure: false
            });

            const sourceStream = Readable.from(mediaBuffer);

            // 🎯 الحل الجذري: البحث الإجباري عن المجلد الصحيح
            try {
                // المحاولة الأولى: مجلد النطاق الفرعي (إن وجد)
                await ftpClient.cd("/tarzan.liveblog365.com/htdocs");
            } catch (err) {
                // المحاولة الثانية: المجلد الرئيسي المباشر
                await ftpClient.cd("/htdocs");
            }
            
            await sock.sendMessage(from, { react: { text: '🚀', key: msg.key } });
            
            await ftpClient.uploadFrom(sourceStream, finalFileName);
            ftpClient.close();

            // استخدام النطاق الفعلي الخاص بك
            const directLink = `http://tarzan.liveblog365.com/${encodeURIComponent(finalFileName)}`;

            const successMsg = `🌐 *تم استضافة المشروع بنجاح!*\n\n📄 *اسم الملف:* ${originalName}\n🛠️ *النوع:* ${fileExtension.toUpperCase()} Script\n📦 *الحجم:* ${(mediaBuffer.length / 1024).toFixed(2)} KB\n\n🔗 *رابط المعاينة المباشر:*\n${directLink}`;

            await sock.sendMessage(from, { text: successMsg }, { quoted: msg });
            await sock.sendMessage(from, { react: { text: '✅', key: msg.key } });

        } catch (error) {
            console.error('❌ خطأ:', error);
            await sock.sendMessage(from, { react: { text: '❌', key: msg.key } });
            reply(`❌ *فشل الرفع.*`);
        }
    }
};
