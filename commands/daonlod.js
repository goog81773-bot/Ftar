const axios = require('axios');
const fs = require('fs');
const path = require('path');
const moment = require('moment-timezone');
const { jidNormalizedUser } = require('@whiskeysockets/baileys');
const ytdl = require('ytdl-core');
const ytSearch = require('yt-search');

module.exports = {
    name: 'download',
    aliases: ['تحميل', 'تنزيل', 'dl', 'بحث'],
    description: '📥 تحميل من سوشيال ميديا - دعم تيك توك، يوتيوب، انستغرام، تويتر، فيسبوك + بحث',
    async execute({ sock, msg, args, text, reply, from, isGroup, sender, pushName, isFromMe, prefix, commandName }) {
        
        try {
            const input = args.join(' ');
            if (!input) {
                return reply(`📥 *نظام التحميل من السوشيال ميديا*\n\n📌 *الاستخدام:*\n${prefix}download [رابط أو كلمة بحث]\n\n📱 *المنصات المدعومة:*\n• تيك توك (TikTok)\n• يوتيوب (YouTube)\n• انستغرام (Instagram)\n• تويتر (Twitter)\n• فيسبوك (Facebook)\n\n📝 *أمثلة:*\n${prefix}download https://www.tiktok.com/@user/video/123\n${prefix}download اغنية حزينة\n${prefix}download فيديو مضحك`);
            }

            await sock.sendMessage(from, { 
                react: { text: '📥', key: msg.key } 
            });

            // التحقق من是否为 رابط
            const isUrl = input.match(/^(https?:\/\/)?([\w-]+\.)+[\w-]+(\/[\w-./?%&=]*)?$/i);
            
            let result = null;
            let platform = '';

            if (isUrl) {
                // تحميل من رابط
                platform = detectPlatform(input);
                if (!platform) {
                    return reply(`❌ الرابط غير مدعوم.\n📱 المنصات المدعومة: TikTok, YouTube, Instagram, Twitter, Facebook`);
                }
                
                await reply(`⏳ جاري تحميل الملف من ${platform}...`);
                result = await downloadFromUrl(input, platform);
            } else {
                // بحث وتحميل من يوتيوب
                await reply(`🔍 جاري البحث عن: "${input}"...`);
                result = await searchAndDownload(input);
                platform = 'YouTube (بحث)';
            }

            if (!result || !result.success) {
                return reply(`❌ فشل التحميل: ${result?.error || 'خطأ غير معروف'}`);
            }

            // حفظ الملف
            const downloadsDir = path.join(__dirname, '../downloads');
            if (!fs.existsSync(downloadsDir)) fs.mkdirSync(downloadsDir, { recursive: true });

            const extension = result.extension || 'mp4';
            const fileName = `${platform.replace(/\s/g, '_')}_${Date.now()}.${extension}`;
            const filePath = path.join(downloadsDir, fileName);
            
            const buffer = Buffer.isBuffer(result.data) ? result.data : Buffer.from(result.data);
            fs.writeFileSync(filePath, buffer);

            // إرسال الملف
            const caption = `📥 *تم التحميل بنجاح!*\n\n📱 *المنصة:* ${platform}\n📁 *الملف:* ${fileName}\n📊 *الحجم:* ${(buffer.length / 1024 / 1024).toFixed(2)} MB\n🕒 *الوقت:* ${moment().tz('Asia/Riyadh').format('HH:mm:ss | YYYY-MM-DD')}\n👤 *المرسل:* ${pushName}\n🔗 *الرابط:* ${result.url || 'بحث'}`;

            if (result.type === 'image') {
                await sock.sendMessage(from, { 
                    image: buffer, 
                    caption: caption 
                }, { quoted: msg });
            } else if (result.type === 'audio') {
                await sock.sendMessage(from, { 
                    audio: buffer, 
                    mimetype: 'audio/mpeg',
                    ptt: true,
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
                text: `📥 *تقرير التحميل*\n\n📱 المنصة: ${platform}\n📁 الملف: ${fileName}\n📊 الحجم: ${(buffer.length / 1024 / 1024).toFixed(2)} MB\n👤 المستخدم: ${pushName}`
            });

            // حذف الملف بعد الإرسال
            setTimeout(() => {
                try { fs.unlinkSync(filePath); } catch (e) {}
            }, 10000);

        } catch (error) {
            console.error('❌ خطأ في التحميل:', error);
            reply(`❌ حدث خطأ أثناء التحميل: ${error.message || 'خطأ غير معروف'}`);
        }
    }
};

// ==========================================
// دالة كشف المنصة
// ==========================================
function detectPlatform(url) {
    url = url.toLowerCase();
    if (url.includes('tiktok.com')) return 'TikTok';
    if (url.includes('youtube.com') || url.includes('youtu.be')) return 'YouTube';
    if (url.includes('instagram.com')) return 'Instagram';
    if (url.includes('twitter.com') || url.includes('x.com')) return 'Twitter';
    if (url.includes('facebook.com') || url.includes('fb.watch')) return 'Facebook';
    if (url.includes('soundcloud.com')) return 'SoundCloud';
    if (url.includes('spotify.com')) return 'Spotify';
    return null;
}

// ==========================================
// دالة تحميل من الرابط مباشرة
// ==========================================
async function downloadFromUrl(url, platform) {
    try {
        switch(platform) {
            case 'YouTube':
                return await downloadYouTube(url);
            case 'TikTok':
                return await downloadTikTok(url);
            case 'Instagram':
                return await downloadInstagram(url);
            case 'Twitter':
                return await downloadTwitter(url);
            case 'Facebook':
                return await downloadFacebook(url);
            default:
                return { success: false, error: 'منصة غير مدعومة' };
        }
    } catch (error) {
        console.error(`❌ فشل تحميل من ${platform}:`, error.message);
        return { success: false, error: error.message };
    }
}

// ==========================================
// دالة تحميل من يوتيوب
// ==========================================
async function downloadYouTube(url) {
    try {
        // التحقق من صحة الرابط
        if (!ytdl.validateURL(url)) {
            return { success: false, error: 'رابط يوتيوب غير صحيح' };
        }

        // جلب معلومات الفيديو
        const info = await ytdl.getInfo(url);
        const title = info.videoDetails.title.replace(/[^\w\s]/gi, '');
        
        // اختيار أفضل جودة
        const format = info.formats.find(f => f.qualityLabel === '720p' || f.qualityLabel === '480p' || f.qualityLabel === '360p');
        const audioFormat = info.formats.find(f => f.audioBitrate);

        if (!format) {
            return { success: false, error: 'لا يوجد تنسيق مناسب' };
        }

        // تحميل الفيديو
        const response = await axios({
            method: 'get',
            url: format.url,
            responseType: 'arraybuffer',
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Range': 'bytes=0-'
            },
            timeout: 60000
        });

        return {
            success: true,
            data: response.data,
            extension: 'mp4',
            type: 'video',
            url: url,
            title: title
        };

    } catch (error) {
        console.error('❌ فشل تحميل يوتيوب:', error.message);
        return { success: false, error: error.message };
    }
}

// ==========================================
// دالة البحث والتحميل من يوتيوب
// ==========================================
async function searchAndDownload(query) {
    try {
        // البحث في يوتيوب
        const searchResults = await ytSearch(query);
        
        if (!searchResults || !searchResults.videos || searchResults.videos.length === 0) {
            return { success: false, error: 'لم يتم العثور على نتائج' };
        }

        // اختيار أول نتيجة
        const video = searchResults.videos[0];
        const url = video.url;
        
        console.log(`✅ تم العثور على: ${video.title}`);
        
        // تحميل الفيديو
        return await downloadYouTube(url);

    } catch (error) {
        console.error('❌ فشل البحث:', error.message);
        return { success: false, error: error.message };
    }
}

// ==========================================
// دالة تحميل من تيك توك (بدون API)
// ==========================================
async function downloadTikTok(url) {
    try {
        // استخدام API مجاني لتيك توك
        const apiUrl = `https://www.tikwm.com/api/?url=${encodeURIComponent(url)}`;
        
        const response = await axios.get(apiUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            },
            timeout: 15000
        });

        if (response.data && response.data.code === 0) {
            const data = response.data.data;
            const videoUrl = data.play || data.wmplay || '';
            
            if (!videoUrl) {
                return { success: false, error: 'لا يوجد فيديو' };
            }

            // تحميل الفيديو
            const videoResponse = await axios({
                method: 'get',
                url: videoUrl,
                responseType: 'arraybuffer',
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                },
                timeout: 30000
            });

            return {
                success: true,
                data: videoResponse.data,
                extension: 'mp4',
                type: 'video',
                url: url,
                title: data.title || 'TikTok Video'
            };
        }

        return { success: false, error: 'فشل تحميل تيك توك' };

    } catch (error) {
        console.error('❌ فشل تحميل تيك توك:', error.message);
        return { success: false, error: error.message };
    }
}

// ==========================================
// دالة تحميل من انستغرام
// ==========================================
async function downloadInstagram(url) {
    try {
        // استخدام API مجاني
        const apiUrl = `https://api.instagram.com/oembed?url=${encodeURIComponent(url)}`;
        
        // محاولة جلب البيانات
        const response = await axios.get(apiUrl, {
            timeout: 10000
        });

        if (response.data && response.data.thumbnail_url) {
            const imageResponse = await axios({
                method: 'get',
                url: response.data.thumbnail_url,
                responseType: 'arraybuffer',
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                },
                timeout: 15000
            });

            return {
                success: true,
                data: imageResponse.data,
                extension: 'jpg',
                type: 'image',
                url: url,
                title: response.data.title || 'Instagram Post'
            };
        }

        return { success: false, error: 'فشل تحميل انستغرام' };

    } catch (error) {
        console.error('❌ فشل تحميل انستغرام:', error.message);
        return { success: false, error: error.message };
    }
}

// ==========================================
// دالة تحميل من تويتر
// ==========================================
async function downloadTwitter(url) {
    try {
        // استخدام API مجاني
        const apiUrl = `https://api.twitter.com/1.1/statuses/oembed.json?url=${encodeURIComponent(url)}`;
        
        const response = await axios.get(apiUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            },
            timeout: 10000
        });

        if (response.data && response.data.thumbnail_url) {
            const imageResponse = await axios({
                method: 'get',
                url: response.data.thumbnail_url,
                responseType: 'arraybuffer',
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                },
                timeout: 15000
            });

            return {
                success: true,
                data: imageResponse.data,
                extension: 'jpg',
                type: 'image',
                url: url,
                title: response.data.title || 'Twitter Post'
            };
        }

        return { success: false, error: 'فشل تحميل تويتر' };

    } catch (error) {
        console.error('❌ فشل تحميل تويتر:', error.message);
        return { success: false, error: error.message };
    }
}

// ==========================================
// دالة تحميل من فيسبوك
// ==========================================
async function downloadFacebook(url) {
    try {
        // استخدام API مجاني
        const apiUrl = `https://api.facebook.com/videos/oembed?url=${encodeURIComponent(url)}`;
        
        const response = await axios.get(apiUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            },
            timeout: 10000
        });

        if (response.data && response.data.thumbnail_url) {
            const imageResponse = await axios({
                method: 'get',
                url: response.data.thumbnail_url,
                responseType: 'arraybuffer',
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                },
                timeout: 15000
            });

            return {
                success: true,
                data: imageResponse.data,
                extension: 'jpg',
                type: 'image',
                url: url,
                title: response.data.title || 'Facebook Post'
            };
        }

        return { success: false, error: 'فشل تحميل فيسبوك' };

    } catch (error) {
        console.error('❌ فشل تحميل فيسبوك:', error.message);
        return { success: false, error: error.message };
    }
}
