const axios = require('axios');

// قاموس للغات الشائعة لإعطاء طابع احترافي مع الأعلام
const languageMap = {
    'ar': 'العَرَبِيَّة 🇸🇦',
    'en': 'الإِنْجِلِيزِيَّة 🇬🇧',
    'fr': 'الفَرَنْسِيَّة 🇫🇷',
    'es': 'الإِسْبَانِيَّة 🇪🇸',
    'de': 'الأَلْمَانِيَّة 🇩🇪',
    'it': 'الإِيطَالِيَّة 🇮🇹',
    'ru': 'الرُّوسِيَّة 🇷🇺',
    'tr': 'التُّرْكِيَّة 🇹🇷',
    'ja': 'اليَابَانِيَّة 🇯🇵',
    'ko': 'الكُورِيَّة 🇰🇷',
    'zh': 'الصِّينِيَّة 🇨🇳',
    'hi': 'الهِنْدِيَّة 🇮🇳',
    'ur': 'الأُورْدِيَّة 🇵🇰',
    'pt': 'البُرْتُغَالِيَّة 🇵🇹'
};

module.exports = {
    name: 'ترجمة',
    aliases: ['tr', 'translate', 'ترجم'],
    category: 'ذكاء',
    description: 'مترجم احترافي يدعم جميع اللغات.',
    execute: async ({ reply, text, msg }) => {
        
        let targetLang = 'ar'; // اللغة الافتراضية هي العربية
        let targetText = '';
        let args = text ? text.split(' ') : [];

        // التحقق مما إذا كان المستخدم قد كتب كود لغة (مثال: en أو fr) في بداية الأمر
        if (args.length > 0 && /^[a-zA-Z]{2,3}$/.test(args[0])) {
            targetLang = args[0].toLowerCase();
            args.shift(); // إزالة كود اللغة من النص المراد ترجمته
        }

        // تجميع باقي النص
        targetText = args.join(' ').trim();

        // إذا لم يكتب نصاً، نبحث في الرسالة المُقتبسة (Reply)
        if (!targetText) {
            targetText = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage?.conversation || 
                         msg.message?.extendedTextMessage?.contextInfo?.quotedMessage?.extendedTextMessage?.text;
        }

        // إذا لم يجد نصاً لا في الأمر ولا في الرد
        if (!targetText) {
            const helpMsg = `⚠️ ╟ *يُرْجَى إِرْفَاق النَّصِّ أَو الرَّدِ عَلَى رِسَالَة.*\n\n` +
                            `📌 ╟ *طَرِيقَةُ الِاسْتِخْدَام:*\n` +
                            `▫️ للترجمة للعربية: *.ترجم How are you*\n` +
                            `▫️ للترجمة للإنجليزية: *.ترجم en كيف حالك*\n` +
                            `▫️ أو قم بالرد على أي رسالة واكتب: *.ترجم*`;
            return reply(helpMsg);
        }

        try {
            await reply('⏳ ╟ *جَارِي المُعَالَجَةُ وَالتَّرْجَمَة...*');

            // الاتصال بـ API جوجل للترجمة
            const res = await axios.get(`https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${targetLang}&dt=t&q=${encodeURIComponent(targetText)}`);
            
            // دمج الجمل المترجمة (لأن جوجل يقسم النصوص الطويلة إلى مصفوفات)
            let fullTranslation = '';
            for (let i = 0; i < res.data[0].length; i++) {
                if (res.data[0][i][0]) {
                    fullTranslation += res.data[0][i][0];
                }
            }

            // استخراج اللغة التي تم التعرف عليها تلقائياً من النص الأصلي
            const detectedSourceLang = res.data[2];
            const sourceLangName = languageMap[detectedSourceLang] || detectedSourceLang.toUpperCase();
            const targetLangName = languageMap[targetLang] || targetLang.toUpperCase();

            // قص النص الأصلي إذا كان طويلاً جداً لكي لا يشوه شكل الرسالة
            let displaySourceText = targetText;
            if (displaySourceText.length > 100) {
                displaySourceText = displaySourceText.substring(0, 100) + '...';
            }

            // صياغة التقرير الاحترافي المُنسّق
            const finalMessage = 
                `❖ ════ 🌐 ﴿ المُتَرْجِمُ المَلَكِيُّ ﴾ 🌐 ════ ❖\n\n` +
                `🔄 ╟ *المَسَار:* مِن [ ${sourceLangName} ] إِلَى [ ${targetLangName} ]\n\n` +
                `📝 ╟ *النَّصُّ الأَصْلِي:*\n${displaySourceText}\n\n` +
                `✅ ╟ *التَّرْجَمَةُ الدَّقِيقَة:*\n${fullTranslation.trim()}\n\n` +
                `❖ ════════════════════════ ❖`;

            await reply(finalMessage);

        } catch (error) {
            console.error('[Translation Error]:', error);
            reply('❌ ╟ *عُذْراً، حَدَثَ خَلَلٌ فِي خَوَادِمِ التَّرْجَمَةِ، حَاوِلْ مُجَدَّداً.*');
        }
    }
};
