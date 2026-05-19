const { downloadMediaMessage } = require('@whiskeysockets/baileys');
const Tesseract = require('tesseract.js');

module.exports = {
    name: 'ocr',
    aliases: ['نص', 'استخراج'],
    execute: async ({ sock, msg, reply, from }) => {
        
        const isMedia = msg.message?.imageMessage;
        const quotedMsg = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
        const isQuotedMedia = quotedMsg?.imageMessage;

        if (!isMedia && !isQuotedMedia) {
            return reply('❌ *يرجى إرسال صورة أو الرد على صورة لاستخراج النص منها.*');
        }

        try {
            await sock.sendMessage(from, { react: { text: '🔍', key: msg.key } });

            const messageToDownload = isMedia ? msg : { message: quotedMsg };
            const buffer = await downloadMediaMessage(messageToDownload, 'buffer', {}, { logger: console });

            reply('⏳ *جاري تحليل الصورة وقراءة النص، يرجى الانتظار...*');

            // استخدام مكتبة Tesseract للتعرف على الحروف (يدعم العربية والإنجليزية)
            const { data: { text } } = await Tesseract.recognize(
                buffer,
                'ara+eng', // اللغات: عربي + إنجليزي
                { logger: m => console.log(m) }
            );

            if (!text.trim()) {
                return reply('❌ *لم أتمكن من العثور على أي نص واضح في هذه الصورة.*');
            }

            // إرسال النص المستخرج
            await reply(`📝 *النص المستخرج:*\n\n${text}`);
            await sock.sendMessage(from, { react: { text: '✅', key: msg.key } });

        } catch (error) {
            console.error('❌ خطأ في أمر OCR:', error);
            await sock.sendMessage(from, { react: { text: '❌', key: msg.key } });
            reply('❌ *حدث خطأ أثناء محاولة قراءة الصورة.*');
        }
    }
};
