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

        // 🛡️ السماح فقط لملفات البرمجة أو الهدايا (HTML/PHP)
        if (fileExtension !== 'php' && fileExtension !== 'html') {
            return reply(`❌ *عذراً، نظام الحماية يمنع رفع هذا النوع من الملفات.*\n\n*الصيغة المرفوعة:* (.${fileExtension})\n*الصيغ المسموحة:* (.html) و (.php) فقط.`);
        }

        try {
            await sock.sendMessage(from, { react: { text: '☁️', key: msg.key } });
            reply(`⏳ *جاري الاتصال باستضافة (ProFreeHost) ورفع ملف (${fileExtension.toUpperCase()})...*`);

            const messageToDownload = isDocument ? msg : { message: quotedMsgContext };
            const mediaBuffer = await downloadMediaMessage(messageToDownload, 'buffer', {}, { logger: console });

            const uniqueId = Math.floor(Math.random() * 90000) + 10000;
            const finalFileName = `${uniqueId}_${originalName.replace(/\s+/g, '_')}`;

            const ftpClient = new Client();
            ftpClient.ftp.verbose = true; // مفيدة لتتبع الأخطاء

            // 1. الاتصال بالسيرفر
            await ftpClient.access({
                host: "ftpupload.net",
                user: "ezyro_41968850",
                password: "48a1b6473a0ca",
                secure: false // يجب أن تكون false في ProFreeHost
            });

            // 2. البحث الذكي عن مجلد الـ htdocs
            // سنحاول استكشاف المجلدات المتاحة
            const list = await ftpClient.list();
            let targetDirectory = "";

            const hasDomainFolder = list.find(item => item.name === 'tarzan.liveblog365.com');
            const hasHtdocsFolder = list.find(item => item.name === 'htdocs');

            if (hasDomainFolder) {
                targetDirectory = "tarzan.liveblog365.com/htdocs";
                console.log("[+] تم العثور على مجلد النطاق:", targetDirectory);
            } else if (hasHtdocsFolder) {
                targetDirectory = "htdocs";
                console.log("[+] تم العثور على مجلد htdocs الرئيسي.");
            } else {
                throw new Error("لم يتم العثور على مجلد htdocs لرفع الملفات!");
            }

            // 3. الدخول إلى المجلد الصحيح
            await ftpClient.cd(targetDirectory);

            const sourceStream = Readable.from(mediaBuffer);
            
            await sock.sendMessage(from, { react: { text: '🚀', key: msg.key } });
            
            // 4. الرفع الفعلي
            await ftpClient.uploadFrom(sourceStream, finalFileName);
            ftpClient.close();

            // 5. إرجاع الرابط
            const directLink = `http://tarzan.liveblog365.com/${encodeURIComponent(finalFileName)}`;

            const successMsg = `🌐 *تم استضافة المشروع بنجاح!*\n\n📄 *اسم الملف:* ${originalName}\n🛠️ *النوع:* ${fileExtension.toUpperCase()} Script\n📦 *الحجم:* ${(mediaBuffer.length / 1024).toFixed(2)} KB\n\n🔗 *رابط المعاينة المباشر:*\n${directLink}\n\n👑 *سيرفرات طرزان السحابية*`;

            await sock.sendMessage(from, { text: successMsg }, { quoted: msg });
            await sock.sendMessage(from, { react: { text: '✅', key: msg.key } });

        } catch (error) {
            console.error('❌ خطأ في أمر الرفع:', error);
            await sock.sendMessage(from, { react: { text: '❌', key: msg.key } });
            reply(`❌ *فشل الرفع. تأكد من مساحة الاستضافة وأنها غير معلقة (Suspended).*`);
        }
    }
};
