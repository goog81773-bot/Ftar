const axios = require('axios');
const fs = require('fs');
const path = require('path');
const moment = require('moment-timezone');
const { jidNormalizedUser } = require('@whiskeysockets/baileys');

module.exports = {
    name: 'download',
    aliases: ['تحميل', 'تنزيل', 'dl'],
    description: '📥 تحميل من سوشيال ميديا - دعم تيك توك، يوتيوب، انستغرام، تويتر، فيسبوك',
    async execute({ sock, msg, args, text, reply, from, isGroup, sender, pushName, isFromMe, prefix, commandName }) {
        
        try {
            const url = args[0];
            if (!url) {
                return reply(`📥 *نظام التحميل من السوشيال ميديا*\n\n📌 *الاستخدام:*\n${prefix}download [الرابط]\n\n📱 *المنصات المدعومة:*\n• تيك توك (TikTok)\n• يوتيوب (YouTube)\n• انستغرام (Instagram)\n• تويتر (Twitter)\n• فيسبوك (Facebook)\n• شورتس (Shorts)\n\n📝 *مثال:*\n${prefix}download https://www.tiktok.com/@user/video/123456789`);
            }

            await sock.sendMessage(from, { 
                react: { text: '📥', key: msg.key } 
            });

            // تحليل الرابط لتحديد المنصة
            const platform = detectPlatform(url);
            
            if (!platform) {
                return reply(`❌ الرابط غير مدعوم أو غير صحيح.\n📱 المنصات المدعومة: TikTok, YouTube, Instagram, Twitter, Facebook`);
            }

            // إرسال رسالة جاري التحميل
            const loadingMsg = await reply(`⏳ جاري تحميل الملف من ${platform}...\n🔄 قد يستغرق هذا بعض الوقت حسب حجم الملف.`);

            // تحميل المحتوى
            const result = await downloadMedia(url, platform);

            if (!result || !result.success) {
                return reply(`❌ فشل التحميل: ${result?.error || 'خطأ غير معروف'}`);
            }

            // حفظ الملف
            const downloadsDir = path.join(__dirname, '../downloads');
            if (!fs.existsSync(downloadsDir)) fs.mkdirSync(downloadsDir);

            const fileName = `${platform}_${Date.now()}.${result.extension || 'mp4'}`;
            const filePath = path.join(downloadsDir, fileName);
            
            // تحويل البيانات إلى Buffer
            const buffer = Buffer.isBuffer(result.data) ? result.data : Buffer.from(result.data);
            fs.writeFileSync(filePath, buffer);

            // إرسال الملف
            const caption = `📥 *تم التحميل بنجاح!*\n\n📱 *المنصة:* ${platform}\n📁 *الملف:* ${fileName}\n📊 *الحجم:* ${(buffer.length / 1024 / 1024).toFixed(2)} MB\n🕒 *الوقت:* ${moment().tz('Asia/Riyadh').format('HH:mm:ss | YYYY-MM-DD')}\n👤 *المرسل:* ${pushName}`;

            // إرسال الفيديو أو الصورة حسب النوع
            if (result.type === 'image') {
                await sock.sendMessage(from, { 
                    image: buffer, 
                    caption: caption 
                }, { quoted: msg });
            } else if (result.type === 'audio') {
                await sock.sendMessage(from, { 
                    audio: buffer, 
                    mimetype: 'audio/mpeg',
                    caption: caption
                }, { quoted: msg });
            } else {
                await sock.sendMessage(from, { 
                    video: buffer, 
                    caption: caption,
                    gifPlayback: false
                }, { quoted: msg });
            }

            // إرسال نسخة للخاص
            const selfId = jidNormalizedUser(sock.user.id);
            await sock.sendMessage(selfId, {
                text: `📥 *تقرير التحميل*\n\n📱 المنصة: ${platform}\n📁 الملف: ${fileName}\n📊 الحجم: ${(buffer.length / 1024 / 1024).toFixed(2)} MB\n👤 المستخدم: ${pushName}\n🔗 الرابط: ${url}`
            });

            // حذف الملف بعد الإرسال
            setTimeout(() => {
                try { fs.unlinkSync(filePath); } catch (e) {}
            }, 5000);

        } catch (error) {
            console.error('❌ خطأ في التحميل:', error);
            reply(`❌ حدث خطأ أثناء التحميل: ${error.message || 'خطأ غير معروف'}`);
        }
    }
};

function detectPlatform(url) {
    url = url.toLowerCase();
    if (url.includes('tiktok.com')) return 'TikTok';
    if (url.includes('youtube.com') || url.includes('youtu.be')) return 'YouTube';
    if (url.includes('instagram.com')) return 'Instagram';
    if (url.includes('twitter.com') || url.includes('x.com')) return 'Twitter';
    if (url.includes('facebook.com') || url.includes('fb.watch')) return 'Facebook';
    return null;
}

async function downloadMedia(url, platform) {
    try {
        // استخدام APIs مجانية للتحميل
        const apis = {
            'TikTok': `https://api.tikmate.app/api/video?url=${encodeURIComponent(url)}`,
            'YouTube': `https://api.vevioz.com/api/button/mp3/${encodeURIComponent(url)}`,
            'Instagram': `https://api.instagram.com/v1/media/${url.split('/').pop()}`
        };

        // محاكاة التحميل (في الحقيقة ستستخدم APIs حقيقية)
        // هذه محاكاة للتوضيح - ستحتاج إلى APIs حقيقية
        return new Promise((resolve) => {
            setTimeout(() => {
                resolve({
                    success: true,
                    data: Buffer.from('محاكاة للتحميل'),
                    extension: 'mp4',
                    type: 'video'
                });
            }, 2000);
        });

    } catch (error) {
        return {
            success: false,
            error: error.message
        };
    }
}
