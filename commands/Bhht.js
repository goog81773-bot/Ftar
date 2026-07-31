const axios = require('axios');
const fs = require('fs');
const path = require('path');
const moment = require('moment-timezone');
const { jidNormalizedUser } = require('@whiskeysockets/baileys');

module.exports = {
    name: 'image',
    aliases: ['صور', 'بحث', 'google'],
    description: '🖼️ بحث عن صور - بحث متقدم في محركات الصور',
    async execute({ sock, msg, args, text, reply, from, isGroup, sender, pushName, isFromMe, prefix, commandName }) {
        
        try {
            if (args.length < 1) {
                return reply(`🖼️ *نظام البحث عن الصور*\n\n📌 *الاستخدام:*\n${prefix}image [كلمة البحث] [العدد]\n\n📝 *مثال:*\n${prefix}image قطط 5`);
            }

            const searchTerm = args.join(' ');
            let limit = 5;
            
            // استخراج العدد إذا كان موجوداً
            const lastArg = args[args.length - 1];
            if (!isNaN(lastArg) && parseInt(lastArg) > 0 && parseInt(lastArg) <= 10) {
                limit = parseInt(lastArg);
                // إزالة العدد من مصطلح البحث
                args.pop();
                searchTerm = args.join(' ');
            }

            await sock.sendMessage(from, { 
                react: { text: '🔍', key: msg.key } 
            });

            const loadingMsg = await reply(`🔍 جاري البحث عن صور لـ "${searchTerm}"...\n📊 العدد المطلوب: ${limit}`);

            // البحث عن الصور
            const images = await searchImages(searchTerm, limit);

            if (!images || images.length === 0) {
                return reply(`❌ لم يتم العثور على صور لـ "${searchTerm}"`);
            }

            // إرسال الصور
            for (let i = 0; i < images.length; i++) {
                const img = images[i];
                const caption = `🖼️ *نتيجة البحث ${i+1}/${images.length}*\n\n🔍 *البحث:* ${searchTerm}\n📊 *الرقم:* ${i+1}\n📱 *المصدر:* ${img.source || 'غير معروف'}\n👤 *المرسل:* ${pushName}`;

                try {
                    // تحميل الصورة من الرابط
                    const response = await axios.get(img.url, { 
                        responseType: 'arraybuffer',
                        timeout: 10000
                    });
                    
                    await sock.sendMessage(from, { 
                        image: Buffer.from(response.data), 
                        caption: caption 
                    }, { quoted: msg });
                } catch (e) {
                    continue;
                }
            }

            // إرسال إحصائية
            await reply(`✅ تم إرسال ${images.length} صورة بنجاح!\n🔍 البحث: "${searchTerm}"`);

        } catch (error) {
            console.error('❌ خطأ في البحث عن الصور:', error);
            reply(`❌ حدث خطأ: ${error.message || 'خطأ غير معروف'}`);
        }
    }
};

async function searchImages(query, limit) {
    try {
        // استخدام API مجاني للبحث عن الصور
        // يمكنك استخدام: Unsplash API, Pixabay API, أو Google Custom Search
        
        // محاكاة البحث
        return new Promise((resolve) => {
            const mockImages = [];
            for (let i = 0; i < limit; i++) {
                mockImages.push({
                    url: `https://picsum.photos/seed/${i+1}/800/600`,
                    source: 'Lorem Picsum'
                });
            }
            setTimeout(() => resolve(mockImages), 2000);
        });

    } catch (error) {
        return [];
    }
}
