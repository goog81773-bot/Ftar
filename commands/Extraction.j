const axios = require('axios');

module.exports = {
    name: 'اقتباس',
    aliases: ['qc', 'مقولة'],
    execute: async ({ sock, msg, reply, from }) => {
        
        // التحقق من أن الأمر هو رد على رسالة شخص آخر
        const quotedMsgContext = msg.message?.extendedTextMessage?.contextInfo;
        const quotedMessage = quotedMsgContext?.quotedMessage;
        
        if (!quotedMessage) {
            return reply('❌ *يجب أن ترد على رسالة شخص ما بهذا الأمر لصنع اقتباس لها.*');
        }

        // استخراج نص الرسالة المردود عليها
        const textToQuote = quotedMessage.conversation || quotedMessage.extendedTextMessage?.text;
        
        if (!textToQuote) {
            return reply('❌ *لا يوجد نص في الرسالة المردود عليها!*');
        }

        try {
            await sock.sendMessage(from, { react: { text: '📸', key: msg.key } });

            // جلب رقم الشخص صاحب الرسالة الأصلية
            const senderJid = quotedMsgContext.participant;
            
            // محاولة جلب صورته الشخصية، وإذا لم يضع صورة نضع صورة افتراضية
            let ppUrl;
            try {
                ppUrl = await sock.profilePictureUrl(senderJid, 'image');
            } catch (e) {
                ppUrl = 'https://i.ibb.co/3Fh9Q6M/blank-profile-picture.png'; // صورة افتراضية
            }

            // محاولة جلب اسمه المسجل في الواتساب
            const contact = await sock.contactDB?.get(senderJid); // إذا كنت تستخدم قاعدة بيانات جهات اتصال
            const pushName = contact?.notify || contact?.name || senderJid.split('@')[0];

            // إعداد البيانات لإرسالها لـ API صانع الاقتباسات
            const obj = {
                type: "quote",
                format: "png",
                backgroundColor: "#1b1429", // لون خلفية فخم
                width: 512,
                height: 768,
                scale: 2,
                messages: [{
                    entities: [],
                    avatar: true,
                    from: {
                        id: 1,
                        name: pushName,
                        photo: { url: ppUrl }
                    },
                    text: textToQuote,
                    replyMessage: {}
                }]
            };

            // استخدام API مشهور لعمل الـ Quotes
            const response = await axios.post('https://bot.lyo.su/quote/generate', obj, {
                headers: { 'Content-Type': 'application/json' }
            });

            // جلب الصورة الناتجة (Base64) وتحويلها لـ Buffer
            const buffer = Buffer.from(response.data.result.image, 'base64');

            // إرسال صورة الاقتباس
            await sock.sendMessage(from, { 
                image: buffer,
                caption: '🌟 *تم تصميم الاقتباس بنجاح!*'
            }, { quoted: msg });

            await sock.sendMessage(from, { react: { text: '✅', key: msg.key } });

        } catch (error) {
            console.error('❌ خطأ في أمر الاقتباس:', error);
            await sock.sendMessage(from, { react: { text: '❌', key: msg.key } });
            reply('❌ *حدث خطأ أثناء صنع الاقتباس.*');
        }
    }
};
