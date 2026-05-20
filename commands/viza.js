const { downloadMediaMessage } = require('@whiskeysockets/baileys');
const axios = require('axios');
const FormData = require('form-data');

module.exports = {
    name: 'رفع',
    aliases: ['upload', 'استضافة', 'رابط'],
    execute: async ({ sock, msg, reply, from }) => {
        
        const isDocument = msg.message?.documentMessage;
        const quotedMsgContext = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
        const isQuotedDocument = quotedMsgContext?.documentMessage;

        if (!isDocument && !isQuotedDocument) {
            return reply('❌ *يرجى إرسال ملف برمجي (HTML/PHP) أو الرد عليه، ثم كتابة .رفع*');
        }

        const docMessage = isDocument ? msg.message.documentMessage : quotedMsgContext.documentMessage;
        const originalName = docMessage.fileName || 'file';
        const fileExtension = originalName.split('.').pop().toLowerCase();

        if (fileExtension !== 'php' && fileExtension !== 'html') {
            return reply(`❌ *نظام الحماية يمنع رفع هذا النوع.*`);
        }

        try {
            await sock.sendMessage(from, { react: { text: '☁️', key: msg.key } });
            reply(`⏳ *جاري ضخ الملف سحابياً عبر Tarzan API...*`);

            const messageToDownload = isDocument ? msg : { message: quotedMsgContext };
            const mediaBuffer = await downloadMediaMessage(messageToDownload, 'buffer', {}, { logger: console });

            const uniqueId = Math.floor(Math.random() * 90000) + 10000;
            // إزالة المسافات لتجنب أخطاء 404
            const cleanName = originalName.replace(/\s+/g, '_');
            const finalFileName = `${uniqueId}_${cleanName}`;

            await sock.sendMessage(from, { react: { text: '🚀', key: msg.key } });

            const form = new FormData();
            form.append('key', 'tarzan2026');
            form.append('filename', finalFileName);
            form.append('file', mediaBuffer, finalFileName);

            // 👑 السر هنا: التنكر كمتصفح حقيقي لاختراق جدار الحماية
            const response = await axios.post('http://tarzan.liveblog365.com/api.php', form, {
                headers: { 
                    ...form.getHeaders(),
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
                    'Accept': 'application/json, text/plain, */*'
                }
            });

            if (response.data && response.data.status) {
                const directLink = response.data.url;
                const successMsg = `🌐 *تم استضافة المشروع بنجاح!*\n\n📄 *الملف:* ${cleanName}\n🛠️ *النوع:* ${fileExtension.toUpperCase()} Script\n📦 *الحجم:* ${(mediaBuffer.length / 1024).toFixed(2)} KB\n\n🔗 *رابط المعاينة المباشر:*\n${directLink}`;
                
                await sock.sendMessage(from, { text: successMsg }, { quoted: msg });
                await sock.sendMessage(from, { react: { text: '✅', key: msg.key } });
            } else {
                reply(`❌ *رد السيرفر:* ${response.data.message}`);
            }

        } catch (error) {
            console.error('❌ خطأ API:', error.message);
            await sock.sendMessage(from, { react: { text: '❌', key: msg.key } });
            reply('❌ *فشل الاتصال بالـ API. تأكد من وضع ملف api.php في مجلد htdocs.*');
        }
    }
};
