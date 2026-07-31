const axios = require('axios');
const moment = require('moment-timezone');
const fs = require('fs');
const path = require('path');

module.exports = {
    name: 'tweet',
    aliases: ['تغريدة', 'تويتر', 'غرد', 'twitter'],
    description: '🐦 إنشاء تغريدة احترافية بصورة وهمية (مزحة مع الأصدقاء)',
    
    async execute({ sock, msg, args, text, reply, from, sender, pushName, isFromMe, prefix, commandName }) {
        
        try {
            // التحقق من وجود نص
            if (!text || text.trim() === '') {
                return reply(`🐦 *نظام التغريدات الاحترافي*\n\n📌 *الاستخدام:*\n${prefix}tweet [النص الذي تريد تغريده]\n${prefix}تغريدة [النص]\n\n📝 *مثال:*\n${prefix}tweet أنا ملك الجروب 👑\n\n📊 *الحد الأقصى:* 500 حرف`);
            }

            // إرسال رد تفاعلي
            await sock.sendMessage(from, { 
                react: { text: '🐦', key: msg.key } 
            });

            // إرسال رسالة جاري المعالجة
            await reply('⏳ *جاري إنشاء التغريدة...*\n🎨 *معالجة الصورة وتنسيق النص*');

            // الحصول على اسم المستخدم
            const userName = pushName || 'Tarzan User';
            const userHandle = userName.replace(/\s+/g, '_').toLowerCase() + Math.floor(Math.random() * 1000);

            // جلب صورة البروفايل
            let profilePicUrl;
            try {
                profilePicUrl = await sock.profilePictureUrl(sender, 'image');
            } catch (err) {
                // صورة افتراضية احترافية
                profilePicUrl = 'https://i.ibb.co/3Fh9Q6M/blank-profile-picture-973460-1280.png';
            }

            // تحديد عدد الأحرف (الحد الأقصى 500)
            let tweetText = text.trim();
            let isTruncated = false;
            
            if (tweetText.length > 500) {
                tweetText = tweetText.slice(0, 500);
                isTruncated = true;
            }

            // تنظيف النص
            tweetText = tweetText
                .replace(/<[^>]*>/g, '')
                .replace(/&[^;]+;/g, '')
                .trim();

            // إضافة تاريخ وهمي
            const tweetDate = moment().tz('Asia/Riyadh').format('h:mm A · MMM D, YYYY');
            const tweetViews = Math.floor(Math.random() * 10000) + 1000;
            const tweetLikes = Math.floor(Math.random() * 5000) + 100;
            const tweetRetweets = Math.floor(Math.random() * 1000) + 10;

            // بناء رابط API المحسن
            const apiUrl = `https://some-random-api.com/canvas/misc/tweet`;
            
            // محاولة استخدام API مع معالجة أفضل
            let imageBuffer;
            
            try {
                // محاولة استخدام API الرئيسي
                const response = await axios.get(apiUrl, {
                    params: {
                        avatar: encodeURIComponent(profilePicUrl),
                        displayname: encodeURIComponent(userName),
                        username: encodeURIComponent(userHandle),
                        comment: encodeURIComponent(tweetText)
                    },
                    responseType: 'arraybuffer',
                    timeout: 25000,
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                    }
                });

                imageBuffer = Buffer.from(response.data);

            } catch (apiError) {
                console.error('❌ فشل API الرئيسي:', apiError.message);
                
                // محاولة API بديل
                try {
                    const altApiUrl = `https://api.popcat.xyz/tweet?avatar=${encodeURIComponent(profilePicUrl)}&name=${encodeURIComponent(userName)}&username=${encodeURIComponent(userHandle)}&text=${encodeURIComponent(tweetText)}`;
                    
                    const altResponse = await axios.get(altApiUrl, {
                        responseType: 'arraybuffer',
                        timeout: 20000,
                        headers: {
                            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                        }
                    });
                    
                    imageBuffer = Buffer.from(altResponse.data);
                    
                } catch (altError) {
                    console.error('❌ فشل API البديل:', altError.message);
                    
                    // إنشاء صورة وهمية محلية
                    imageBuffer = await createLocalTweetImage(userName, userHandle, tweetText, profilePicUrl);
                }
            }

            // التحقق من نجاح التوليد
            if (!imageBuffer || imageBuffer.length < 1000) {
                throw new Error('فشل إنشاء صورة التغريدة');
            }

            // إضافة معلومات التغريدة
            const tweetInfo = `🐦 *تـم نـشـر الـتـغـريـدة بـنـجـاح!* 🐦\n\n` +
                             `👤 *المستخدم:* ${userName}\n` +
                             `📝 *النص:* ${tweetText.length > 50 ? tweetText.substring(0, 50) + '...' : tweetText}\n` +
                             `📊 *العدد:* ${tweetText.length}/500 حرف${isTruncated ? ' (تم الاختصار)' : ''}\n` +
                             `👁️ *المشاهدات:* ${tweetViews.toLocaleString()}\n` +
                             `❤️ *الإعجابات:* ${tweetLikes.toLocaleString()}\n` +
                             `🔁 *إعادة التغريد:* ${tweetRetweets.toLocaleString()}\n` +
                             `🕒 *التاريخ:* ${tweetDate}\n\n` +
                             `*— 𝑻𝑨𝑹𝒁𝑨𝑵 𝑽𝑰𝑷 👑*`;

            // إرسال التغريدة مع معلومات إضافية
            await sock.sendMessage(from, { 
                image: imageBuffer, 
                caption: tweetInfo,
                contextInfo: {
                    mentionedJid: [sender],
                    forwardingScore: 999,
                    isForwarded: true,
                    forwardedNewsletterMessageInfo: {
                        newsletterJid: '120363@newsletter',
                        newsletterName: 'نظام التغريدات',
                        serverMessageId: -1
                    }
                }
            }, { quoted: msg });

            // إرسال نسخة للخاص
            const selfId = sock.user.id;
            if (selfId) {
                await sock.sendMessage(selfId, {
                    text: `🐦 *نسخة التغريدة*\n\n👤 المستخدم: ${userName}\n📝 النص: ${tweetText}\n🕒 التاريخ: ${tweetDate}\n🔗 من: ${pushName || 'مجهول'}`
                });
            }

            // ردود تفاعلية
            await sock.sendMessage(from, { 
                react: { text: '✅', key: msg.key } 
            });

        } catch (error) {
            console.error('❌ خطأ في أمر التغريدة:', error);

            await sock.sendMessage(from, { 
                react: { text: '❌', key: msg.key } 
            });

            // رسائل خطأ محسنة
            let errorMessage = '❌ *فشل إنشاء التغريدة!*';
            
            if (error.message?.includes('timeout')) {
                errorMessage = '⏰ *انتهى وقت المعالجة!* السيرفر مزدحم، حاول مرة أخرى.';
            } else if (error.message?.includes('404')) {
                errorMessage = '🔍 *خدمة إنشاء التغريدات غير متوفرة حالياً.* حاول بعد قليل.';
            } else if (error.message?.includes('500')) {
                errorMessage = '🔄 *خطأ في الخادم الخارجي.* جاري المحاولة بطريقة بديلة...';
            } else {
                errorMessage = `❌ *فشل إنشاء التغريدة*\n\n📌 السبب: ${error.message || 'خطأ غير معروف'}\n\n💡 حاول كتابة نص أقصر أو أعد المحاولة.`;
            }

            await reply(errorMessage);
        }
    }
};

// ==========================================
// دالة إنشاء صورة تغريدة محلية (بديل)
// ==========================================
async function createLocalTweetImage(userName, userHandle, tweetText, avatarUrl) {
    try {
        // محاولة استخدام Canvas لإنشاء صورة محلية
        const { createCanvas, loadImage } = require('canvas');
        
        // إنشاء قماش
        const canvas = createCanvas(600, 300);
        const ctx = canvas.getContext('2d');

        // الخلفية
        const gradient = ctx.createLinearGradient(0, 0, 0, 300);
        gradient.addColorStop(0, '#1DA1F2');
        gradient.addColorStop(1, '#0D8BD9');
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, 600, 300);

        // النص
        ctx.fillStyle = '#FFFFFF';
        ctx.font = 'bold 24px Arial';
        ctx.fillText(`🐦 ${userName}`, 20, 50);
        
        ctx.font = '18px Arial';
        ctx.fillStyle = '#E8F5FE';
        ctx.fillText(`@${userHandle}`, 20, 80);

        ctx.font = '20px Arial';
        ctx.fillStyle = '#FFFFFF';
        
        // تقسيم النص إلى أسطر
        const words = tweetText.split(' ');
        let lines = [];
        let currentLine = '';
        
        for (const word of words) {
            const testLine = currentLine + word + ' ';
            const metrics = ctx.measureText(testLine);
            
            if (metrics.width > 540) {
                lines.push(currentLine.trim());
                currentLine = word + ' ';
            } else {
                currentLine = testLine;
            }
        }
        lines.push(currentLine.trim());

        // رسم النص
        let y = 120;
        for (const line of lines) {
            ctx.fillText(line, 30, y);
            y += 30;
        }

        // إضافة التاريخ
        ctx.font = '14px Arial';
        ctx.fillStyle = '#B3E0FF';
        const date = moment().tz('Asia/Riyadh').format('h:mm A · MMM D, YYYY');
        ctx.fillText(date, 30, y + 30);

        return canvas.toBuffer('image/png');

    } catch (error) {
        console.error('❌ فشل إنشاء صورة محلية:', error.message);
        
        // صورة احتياطية نصية
        const fallbackText = `🐦 ${userName} (@${userHandle})\n\n${tweetText}\n\n${moment().tz('Asia/Riyadh').format('h:mm A · MMM D, YYYY')}`;
        
        return Buffer.from(fallbackText);
    }
}
