const axios = require('axios');
module.exports = {
    name: 'ترجمة',
    aliases: ['tr', 'translate'],
    execute: async ({ reply, text, msg }) => {
        // جلب النص سواء كان مكتوباً بعد الأمر أو في رسالة مقتبسة (Reply)
        let targetText = text || msg.message?.extendedTextMessage?.contextInfo?.quotedMessage?.conversation || msg.message?.extendedTextMessage?.contextInfo?.quotedMessage?.extendedTextMessage?.text;

        if (!targetText) return reply('🌐 *أرسل النص مع الأمر أو قم بالرد على رسالة لترجمتها للعربية.*');
        
        try {
            const res = await axios.get(`https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=ar&dt=t&q=${encodeURIComponent(targetText.trim())}`);
            const translation = res.data[0][0][0];
            await reply(`🌍 *[ مُتَرْجِمُ طَرْزَانَ العَالَمِيُّ ]* 🌍\n\n📌 *النص الأصلي:* ${targetText.trim()}\n\n✅ *الترجمة:* \n${translation}\n\n*— تَمَّتِ التَّرْجَمَةُ بِدِقَّةٍ عَالِيَةٍ 🛡️*`);
        } catch { reply('❌ *حدث خطأ في نظام الترجمة.*'); }
    }
};
