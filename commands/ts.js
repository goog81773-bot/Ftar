const axios = require('axios');

module.exports = {
    name: 'design',
    aliases: ['تصميم', 'اسماء', 'حب', 'عشاق'],
    execute: async ({ sock, msg, reply, from, args }) => {
        
        // دمج المدخلات ثم تقسيمها بناءً على علامة الزائد (+) أو (و) أو (&)
        const inputText = args.join(' ');
        let names = inputText.split(/\+|&| و /);

        // التأكد من إدخال اسمين
        if (!inputText || names.length < 2) {
            return reply('❌ *يرجى كتابة اسمين وبينهما علامة (+)*\n\n*مثال:* .تصميم أحمد + سارة');
        }

        const name1 = names[0].trim();
        const name2 = names[1].trim();

        try {
            // تفاعل قيد الانتظار
            await sock.sendMessage(from, { react: { text: '🎨', key: msg.key } });
            reply(`⏳ *جاري ترجمة الأسماء وتصميم صورة فخمة لـ (${name1}) و (${name2})، يرجى الانتظار...*`);

            // دالة مصغرة لترجمة الأسماء العربية إلى الإنجليزية
            const translateName = async (name) => {
                try {
                    const transUrl = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=en&dt=t&q=${encodeURIComponent(name)}`;
                    const transRes = await axios.get(transUrl);
                    return transRes.data[0].map(item => item[0]).join('').trim();
                } catch (err) {
                    console.error('⚠️ خطأ في الترجمة:', err);
                    return name; // في حال تعطل الترجمة، نستخدم الاسم كما هو
                }
            };

            // ترجمة الاسمين
            const enName1 = await translateName(name1);
            const enName2 = await translateName(name2);

            // الوصف الاحترافي للذكاء الاصطناعي (Prompt)
            // نستخدم الأسماء المترجمة (enName1 و enName2) لضمان رسم الحروف بشكل صحيح
            const prompt = `A highly detailed, luxurious, romantic 3D typography design featuring the names "${enName1}" and "${enName2}" written together in elegant glowing gold 3D calligraphy. The background is a magical, premium setting with dark red roses, glowing bokeh lights, floating golden dust, and a royal, elegant romantic atmosphere. 8k resolution, masterpiece, unreal engine 5 render.`;
            
            // رابط الـ API المجاني (Pollinations)
            const apiUrl = `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?width=1024&height=1024&nologo=true`;

            // جلب الصورة كـ Buffer (بيانات خام) لإرسالها مباشرة كصورة وليس كرابط
            const response = await axios.get(apiUrl, { responseType: 'arraybuffer' });
            const imageBuffer = Buffer.from(response.data, 'binary');

            // إرسال الصورة للمستخدم
            await sock.sendMessage(from, { 
                image: imageBuffer, 
                caption: `✨ *تم التصميم بنجاح!*\n💖 *الأسماء:* ${enName1} & ${enName2}\n👑 *بواسطة طرزان بوت*` 
            }, { quoted: msg });

            // تفاعل النجاح
            await sock.sendMessage(from, { react: { text: '❤️', key: msg.key } });

        } catch (error) {
            console.error('❌ خطأ في أمر التصميم:', error);
            await sock.sendMessage(from, { react: { text: '❌', key: msg.key } });
            reply('❌ *حدث خطأ أثناء توليد الصورة، قد يكون السيرفر عليه ضغط. يرجى المحاولة بعد قليل.*');
        }
    }
};
