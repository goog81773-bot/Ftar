const { downloadMediaMessage } = require('@whiskeysockets/baileys');
const axios = require('axios');
const FormData = require('form-data');

module.exports = {
    name: 'رفع',
    aliases: ['upload', 'استضافة', 'رابط'],
    execute: async ({ sock, msg, reply, from }) => {
        
        // 1. التحقق من أن المرفق هو "مستند" (Document) فقط
        const isDocument = msg.message?.documentMessage;
        const quotedMsgContext = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
        const isQuotedDocument = quotedMsgContext?.documentMessage;

        if (!isDocument && !isQuotedDocument) {
            return reply('❌ *يرجى إرسال ملف برمجي أو الرد على ملف، ثم كتابة .رفع*');
        }

        // 2. استخراج معلومات الملف والصيغة
        const docMessage = isDocument ? msg.message.documentMessage : quotedMsgContext.documentMessage;
        const originalName = docMessage.fileName || 'unknown_file';
        const fileExtension = originalName.split('.').pop().toLowerCase();

        // 3. نظام الحماية: السماح فقط بصيغ البرمجة (HTML و PHP)
        if (fileExtension !== 'php' && fileExtension !== 'html') {
            return reply(`❌ *نظام الحماية يمنع رفع هذا النوع من الملفات.*\n\n*الصيغة المرفوعة:* (.${fileExtension})\n*الصيغ المسموحة:* (.html) و (.php) فقط.\n\n🛡️ _سيرفرات طرزان الآمنة_`);
        }

        try {
            await sock.sendMessage(from, { react: { text: '☁️', key: msg.key } });
            reply(`⏳ *جاري الاتصال بـ (Tarzan API) ورفع ملف (${fileExtension.toUpperCase()})...*`);

            // 4. تحميل الملف من سيرفرات واتساب
            const messageToDownload = isDocument ? msg : { message: quotedMsgContext };
            const mediaBuffer = await downloadMediaMessage(messageToDownload, 'buffer', {}, { logger: console });

            // 5. تجهيز اسم فريد للملف لتجنب استبدال الملفات
            const uniqueId = Math.floor(Math.random() * 90000) + 10000;
            const finalFileName = `${uniqueId}_${originalName.replace(/\s+/g, '_')}`;

            await sock.sendMessage(from, { react: { text: '🚀', key: msg.key } });

            // 6. الاتصال بالـ API الخاص بك ورفع الملف
            const form = new FormData();
            form.append('key', 'tarzan2026'); // مفتاح الأمان السري
            form.append('filename', finalFileName);
            form.append('file', mediaBuffer, finalFileName);

            const response = await axios.post('http://tarzan.liveblog365.com/api.php', form, {
                headers: { ...form.getHeaders() }
            });

            // 7. معالجة الاستجابة وإرسال الرابط المباشر
            if (response.data && response.data.status) {
                const directLink = response.data.url;
                const successMsg = `🌐 *تم استضافة المشروع بنجاح!*\n\n📄 *اسم الملف:* ${originalName}\n🛠️ *النوع:* ${fileExtension.toUpperCase()} Script\n📦 *الحجم:* ${(mediaBuffer.length / 1024).toFixed(2)} KB\n\n🔗 *رابط المعاينة المباشر:*\n${directLink}\n\n👑 *سيرفرات طرزان السحابية*`;

                await sock.sendMessage(from, { text: successMsg }, { quoted: msg });
                await sock.sendMessage(from, { react: { text: '✅', key: msg.key } });
            } else {
                throw new Error(response.data.message || "رفض السيرفر استقبال الملف");
            }

        } catch (error) {
            console.error('❌ خطأ في أمر الرفع:', error.message);
            await sock.sendMessage(from, { react: { text: '❌', key: msg.key } });
            reply(`❌ *فشل الرفع عبر الـ API. تأكد من أن ملف api.php موجود في الاستضافة ويعمل.*`);
        }
    }
};
