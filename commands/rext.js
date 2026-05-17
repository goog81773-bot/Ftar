const axios = require('axios');
module.exports = {
    name: 'اختصار',
    aliases: ['رابط', 'short'],
    execute: async ({ reply, text, msg }) => {
        // جلب النص سواء كان مكتوباً بعد الأمر أو في رسالة مقتبسة (Reply)
        let link = text || msg.message?.extendedTextMessage?.contextInfo?.quotedMessage?.conversation || msg.message?.extendedTextMessage?.contextInfo?.quotedMessage?.extendedTextMessage?.text;
        
        if (!link) return reply('🔗 *أرسل الرابط مع الأمر أو قم بالرد على رابط لاختصاره.*');
        
        try {
            const res = await axios.get(`https://tinyurl.com/api-create.php?url=${encodeURIComponent(link.trim())}`);
            await reply(`✨ *[ مَصْنَعُ الرَّوَابِطِ المَلَكِيُّ ]* ✨\n\n✅ *الرابط المختصر:* \n${res.data}\n\n*— تم الاختصار بنجاح 🛡️*`);
        } catch { reply('❌ *حدث خطأ أثناء اختصار الرابط. تأكد من صحة الرابط.*'); }
    }
};
