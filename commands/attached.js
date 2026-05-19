const axios = require('axios');
const { Sticker, StickerTypes } = require('wa-sticker-formatter');

module.exports = {
    name: 'ملصق_ذكي',
    aliases: ['ملصق', 'م', 'sticker_ai'],
    execute: async ({ sock, msg, reply, from, args }) => {
        
        // 1. استلام الوصف من المستخدم (بأي لغة، عربي أو إنجليزي)
        const description = args.join(' ');

        if (!description) {
            return reply('❌ *يرجى كتابة وصف للملصق الذي تريده.*\n\n*مثال:* .ملصق أسد يلبس نظارات شمسية ويشرب قهوة');
        }

        try {
            // تفاعل قيد الانتظار (الترجمة والتفكير)
            await sock.sendMessage(from, { react: { text: '🧠', key: msg.key } });
            reply('⏳ *جاري ترجمة الوصف وتخيل الملصق، يرجى الانتظار...*');

            // 2. المترجم الذكي (تحويل النص إلى إنجليزي لضمان دقة وفخامة الصورة)
            let englishDescription = description;
            try {
                const transUrl = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=en&dt=t&q=${encodeURIComponent(description)}`;
                const transRes = await axios.get(transUrl);
                // تجميع النص المترجم في حال كان طويلاً ومقسماً
                englishDescription = transRes.data[0].map(item => item[0]).join('');
                console.log(`[+] تم الترجمة بنجاح: ${englishDescription}`);
            } catch (transError) {
                console.error('⚠️ خطأ في الترجمة، سيتم استخدام النص الأصلي:', transError);
                // إذا فشلت الترجمة لأي سبب، سيكمل باستخدام النص الأصلي لتجنب توقف البوت
            }

            // تفاعل قيد الانتظار (توليد الصورة)
            await sock.sendMessage(from, { react: { text: '🎨', key: msg.key } });

            // 3. هندسة الوصف (Prompt Engineering) باللغة الإنجليزية
            // إضافة كلمات سحرية لضمان شكل الملصق (3D، عالي الجودة، بدون خلفية)
            const prompt = `${englishDescription}, highly detailed 3D sticker style, vector art, cute, 8k resolution, premium quality, white outline, solid flat background, no shadows on background`;
            
            // 4. استخدام Pollinations AI لتوليد الصورة (سيرفر مجاني مفتوح المصدر)
            const apiUrl = `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?width=512&height=512&nologo=true`;

            // 5. جلب الصورة كـ Buffer
            const response = await axios.get(apiUrl, { responseType: 'arraybuffer' });
            const imageBuffer = Buffer.from(response.data, 'binary');

            // تفاعل قيد الانتظار (صناعة الملصق)
            await sock.sendMessage(from, { react: { text: '⚙️', key: msg.key } });

            // 6. تحويل الصورة المولدة إلى ملصق احترافي باستخدام wa-sticker-formatter
            const sticker = new Sticker(imageBuffer, {
                pack: 'Tarzan VIP 👑', // اسم الحزمة
                author: 'الذكاء الاصطناعي', // اسم الصانع
                type: StickerTypes.FULL, // نوع الملصق ليأخذ مساحته الكاملة
                quality: 70 // جودة الملصق (عالية)
            });

            await sticker.build();
            const stickerBuffer = await sticker.get();

            // 7. إرسال الملصق
            await sock.sendMessage(from, { sticker: stickerBuffer }, { quoted: msg });
            
            // تفاعل النجاح
            await sock.sendMessage(from, { react: { text: '✅', key: msg.key } });

        } catch (error) {
            console.error('❌ خطأ في أمر صانع الملصقات الذكي:', error);
            await sock.sendMessage(from, { react: { text: '❌', key: msg.key } });
            reply('❌ *حدث خطأ أثناء صناعة الملصق. قد يكون الوصف معقداً جداً أو السيرفر مشغول، جرب مرة أخرى.*');
        }
    }
};
