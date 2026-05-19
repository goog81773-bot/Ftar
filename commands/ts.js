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
            return reply('❌ *يرجى كتابة اسمين وبينهما علامة (+)*\n\n*مثال:* .تصميم Ahmed + Sara\n\n⚠️ *ملاحظة:* يرجى كتابة الأسماء بالإنجليزية لضمان رسم الحروف بشكل صحيح فخم.');
        }

        const name1 = names[0].trim();
        const name2 = names[1].trim();

        try {
            // تفاعل قيد الانتظار
            await sock.sendMessage(from, { react: { text: '🎨', key: msg.key } });
            reply('⏳ *جاري تصميم صورة فخمة لـ (' + name1 + ') و (' + name2 + ')، يرجى الانتظار بضع ثواني...*');

            // الوصف الاحترافي للذكاء الاصطناعي (Prompt)
            // تصميم ثلاثي الأبعاد، حروف ذهبية، ورود حمراء، إضاءة سينمائية، فخامة
            const prompt = `A highly detailed, luxurious, romantic 3D typography design featuring the names "${name1}" and "${name2}" written together in elegant glowing gold 3D calligraphy. The background is a magical, premium setting with dark red roses, glowing bokeh lights, floating golden dust, and a royal, elegant romantic atmosphere. 8k resolution, masterpiece, unreal engine 5 render.`;
            
            // رابط الـ API المجاني (Pollinations)
            // أضفنا nologo=true لإزالة العلامة المائية، وحددنا الأبعاد لتكون مربعة عالية الجودة
            const apiUrl = `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?width=1024&height=1024&nologo=true`;

            // جلب الصورة كـ Buffer (بيانات خام) لإرسالها مباشرة كصورة وليس كرابط
            const response = await axios.get(apiUrl, { responseType: 'arraybuffer' });
            const imageBuffer = Buffer.from(response.data, 'binary');

            // إرسال الصورة للمستخدم
            await sock.sendMessage(from, { 
                image: imageBuffer, 
                caption: `✨ *تم التصميم بنجاح!*\n💖 *الأسماء:* ${name1} & ${name2}\n👑 *بواسطة طرزان بوت*` 
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
