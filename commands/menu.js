const axios = require('axios');

// 📜 قائمة بأسماء سور القرآن الكريم بالترتيب لتسهيل عملية البحث الذكي
const surahs = [
    "الفاتحة", "البقرة", "آل عمران", "النساء", "المائدة", "الأنعام", "الأعراف", "الأنفال", "التوبة", "يونس",
    "هود", "يوسف", "الرعد", "إبراهيم", "الحجر", "النحل", "الإسراء", "الكهف", "مريم", "طه",
    "الأنبياء", "الحج", "المؤمنون", "النور", "الفرقان", "الشعراء", "النمل", "القصص", "العنكبوت", "الروم",
    "لقمان", "السجدة", "الأحزاب", "سبأ", "فاطر", "يس", "الصافات", "ص", "الزمر", "غافر",
    "فصلت", "الشورى", "الزخرف", "الدخان", "الجاثية", "الأحقاف", "محمد", "الفتح", "الحجرات", "ق",
    "الذاريات", "الطور", "النجم", "القمر", "الرحمن", "الواقعة", "الحديد", "المجادلة", "الحشر", "الممتحنة",
    "الصف", "الجمعة", "المنافقون", "التغابن", "الطلاق", "التحريم", "الملك", "القلم", "الحاقة", "المعارج",
    "نوح", "الجن", "المزمل", "المدثر", "القيامة", "الإنسان", "المرسلات", "النبأ", "النازعات", "عبس",
    "التكوير", "الانفطار", "المطففين", "الانشقاق", "البروج", "الطارق", "الأعلى", "الغاشية", "الفجر", "البلد",
    "الشمس", "الليل", "الضحى", "الشرح", "التين", "العلق", "القدر", "البينة", "الزلزلة", "العاديات",
    "القارعة", "التكاثر", "العصر", "الهمزة", "الفيل", "قريش", "الماعون", "الكوثر", "الكافرون", "النصر",
    "المسد", "الإخلاص", "الفلق", "الناس"
];

// ⚙️ دالة لتنظيف النص من التشكيل وتوحيد الحروف (لتجنب أخطاء الإملاء من المستخدم)
const normalizeText = (text) => {
    return text.replace(/ة/g, 'ه').replace(/[أإآ]/g, 'ا').replace(/\s/g, '').trim();
};

module.exports = {
    name: 'قرآن',
    aliases: ['ايه', 'آية', 'راحه', 'quran'],
    category: 'إسلاميات',
    description: 'محرك بحث قرآني شامل يجلب الآيات العشوائية، أو يبحث عن سورة وآية محددة، مع الصوت والتفسير.',
    
    execute: async ({ reply, sock, from, msg, args }) => {
        // 1️⃣ تفاعل مبدئي يوضح استلام الأمر
        await sock.sendMessage(from, { react: { text: '🕋', key: msg.key } });
        
        try {
            const userInput = args.join(' ').trim();
            let queryRef = null;

            // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
            // 🔍 القسم الأول: تحديد نوع البحث
            // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

            if (!userInput) {
                // الحالة A: المستخدم لم يكتب شيئاً (يريد آية عشوائية)
                await reply('⏳ ╟ *جَارِي جَلْبُ رَاحَةِ القَلْب (عَشْوَائِي)...*');
                queryRef = Math.floor(Math.random() * 6236) + 1;
            } 
            else {
                // الحالة B: المستخدم يبحث عن شيء معين (سورة، رقم آية، أو نص)
                await reply('🔍 ╟ *جَارِي البَحْثُ عَنْ الآيَةِ المَطْلُوبَة...*');
                
                // تنظيف المدخلات لاستخراج الرقم (رقم الآية) واسم السورة
                const cleanInput = userInput.replace(/سورة|سوره/g, '').trim();
                const matchNum = cleanInput.match(/\d+/);
                const ayahNum = matchNum ? matchNum[0] : 1; // الافتراضي هو الآية رقم 1
                const textWithoutNum = cleanInput.replace(/\d+/g, '').trim();

                const normalizedInput = normalizeText(textWithoutNum);

                // التحقق مما إذا كان النص المدخل هو اسم سورة
                const surahIndex = surahs.findIndex(s => normalizeText(s) === normalizedInput);

                if (surahIndex !== -1) {
                    // إذا وجد السورة (مثلاً: البقرة 255)
                    queryRef = `${surahIndex + 1}:${ayahNum}`;
                } else {
                    // إذا لم يجد اسم سورة، سيبحث في نصوص القرآن الكريم كاملة (مثال: نور على نور)
                    const searchUrl = `https://api.alquran.cloud/v1/search/${encodeURIComponent(userInput)}/all/ar`;
                    const searchRes = await axios.get(searchUrl);
                    
                    if (searchRes.data.data.count > 0) {
                        // أخذ رقم أول آية تطابق البحث
                        queryRef = searchRes.data.data.matches[0].number; 
                    } else {
                        // في حال فشل البحث ولم يجد شيئاً
                        await sock.sendMessage(from, { react: { text: '❓', key: msg.key } });
                        return reply('❌ ╟ *لَمْ أَتَمَكَّنْ مِنْ العُثُورِ عَلَى هَذِهِ السُّورَةِ أَوْ الآيَة، تَأَكَّدْ مِنْ الكِتَابَةِ الصَّحِيحَة.*');
                    }
                }
            }

            // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
            // 📥 القسم الثاني: جلب البيانات (الصوت والتفسير)
            // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

            const [audioRes, tafsirRes] = await Promise.all([
                axios.get(`https://api.alquran.cloud/v1/ayah/${queryRef}/ar.alafasy`), // صوت العفاسي
                axios.get(`https://api.alquran.cloud/v1/ayah/${queryRef}/ar.muyassar`) // التفسير الميسر
            ]);

            const audioData = audioRes.data.data;
            const tafsirData = tafsirRes.data.data;

            if (!audioData || !tafsirData) throw new Error("API Error");

            // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
            // 📝 القسم الثالث: صياغة وإرسال الرسالة
            // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

            // تنسيق الرسالة النصية بشكل فخم ومريح للعين
            const quranText = 
                `❖ ════ 🕋 ﴿ نُورٌ عَلَى نُور ﴾ 🕋 ════ ❖\n\n` +
                `📖 ╟ *الآيَة:*\n﴿ ${audioData.text} ﴾\n\n` +
                `💡 ╟ *التَّفْسِير (المُيَسَّر):*\n${tafsirData.text}\n\n` +
                `📌 ╟ *السُّورَة:* ${audioData.surah.name} - آيَة [${audioData.numberInSurah}]\n` +
                `🎙️ ╟ *القَارِئ:* مِشَارِي بن رَاشِد العَفَاسِي\n\n` +
                `❖ ════════════════════════ ❖`;

            // إرسال النص
            await reply(quranText);

            // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
            // 🎧 القسم الرابع: إرسال المقطع الصوتي كبصمة
            // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

            if (audioData.audio) {
                // إظهار حالة "يسجل مقطع صوتي" للمستخدمين
                await sock.sendPresenceUpdate('recording', from);
                
                // تحميل الملف الصوتي من الرابط كـ Buffer لضمان عمله كبصمة
                const audioBufferRes = await axios.get(audioData.audio, { responseType: 'arraybuffer' });
                const audioBuffer = Buffer.from(audioBufferRes.data, 'binary');

                // إرساله كبصمة صوتية (PTT) تعمل 100%
                await sock.sendMessage(from, { 
                    audio: audioBuffer, 
                    mimetype: 'audio/mp4', // صيغة متوافقة مع جميع أجهزة الواتساب
                    ptt: true 
                }, { quoted: msg });
                
                // تفاعل النجاح النهائي
                await sock.sendMessage(from, { react: { text: '✅', key: msg.key } });
            }

        } catch (error) {
            console.error('[Quran Engine Error]:', error.message);
            await sock.sendMessage(from, { react: { text: '❌', key: msg.key } });
            
            // معالجة الخطأ إذا طلب المستخدم آية غير موجودة (مثل سورة الكوثر الآية 10)
            if (error.response && error.response.status === 404) {
                return reply('❌ ╟ *رَقْمُ الآيَةِ الَّذِي أَدْخَلْتَهُ غَيْرُ مَوْجُودٍ فِي هَذِهِ السُّورَة.*');
            }
            
            // خطأ عام (مشكلة انترنت أو ضغط على السيرفر)
            reply('❌ ╟ *عُذْراً، حَدَثَ خَطَأٌ فِي الِاتِّصَالِ بِقَاعِدَةِ البَيَانَاتِ القُرْآنِيَّة، حَاوِلْ مُجَدَّداً.*');
        }
    }
};
