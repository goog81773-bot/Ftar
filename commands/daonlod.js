const axios = require('axios');
const fs = require('fs');
const path = require('path');
const moment = require('moment-timezone');
const { jidNormalizedUser } = require('@whiskeysockets/baileys');
const ytdl = require('ytdl-core');
const ytSearch = require('yt-search');

// ==========================================
// نظام التحميل المتطور مع مصادر متعددة
// ==========================================

module.exports = {
    name: 'download',
    aliases: ['تحميل', 'تنزيل', 'dl', 'بحث'],
    description: '📥 تحميل من سوشيال ميديا - دعم متعدد مع مصادر بديلة',
    
    async execute({ sock, msg, args, text, reply, from, isGroup, sender, pushName, isFromMe, prefix, commandName }) {
        
        try {
            const input = args.join(' ');
            if (!input) {
                return reply(`📥 *نظام التحميل المتطور*\n\n📌 *الاستخدام:*\n${prefix}download [رابط أو كلمة بحث]\n\n📱 *المنصات المدعومة:*\n• يوتيوب (YouTube)\n• تيك توك (TikTok)\n• انستغرام (Instagram)\n• تويتر (Twitter/X)\n• فيسبوك (Facebook)\n\n📝 *أمثلة:*\n${prefix}download https://www.youtube.com/watch?v=xxxx\n${prefix}download اغنية حزينة\n${prefix}download فيديو مضحك`);
            }

            await sock.sendMessage(from, { 
                react: { text: '📥', key: msg.key } 
            });

            // التحقق من رابط
            const isUrl = input.match(/^(https?:\/\/)?([\w-]+\.)+[\w-]+(\/[\w-./?%&=]*)?$/i);
            
            let result = null;
            let platform = '';

            if (isUrl) {
                platform = detectPlatform(input);
                if (!platform) {
                    return reply(`❌ الرابط غير مدعوم.\n📱 المنصات المدعومة: YouTube, TikTok, Instagram, Twitter, Facebook`);
                }
                
                await reply(`⏳ جاري تحميل الملف من ${platform}...`);
                result = await downloadFromUrl(input, platform);
            } else {
                await reply(`🔍 جاري البحث عن: "${input}"...`);
                result = await searchAndDownload(input);
                platform = 'YouTube (بحث)';
            }

            if (!result || !result.success) {
                // محاولة مصادر بديلة
                await reply(`🔄 جاري المحاولة عبر مصدر بديل...`);
                result = await downloadAlternative(input, platform);
                
                if (!result || !result.success) {
                    return reply(`❌ فشل التحميل: ${result?.error || 'الرابط غير صالح أو منتهي الصلاحية'}\n\n📌 حاول باستخدام رابط مباشر أو بحث آخر.`);
                }
            }

            // حفظ وإرسال الملف
            await sendDownloadedFile(sock, from, msg, result, platform, pushName);

        } catch (error) {
            console.error('❌ خطأ في التحميل:', error);
            reply(`❌ حدث خطأ: ${error.message || 'خطأ غير معروف'}`);
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
// دالة تحميل من الرابط
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
        const formats = info.formats.filter(f => f.hasVideo && f.hasAudio);
        const format = formats.find(f => f.qualityLabel === '720p') || 
                      formats.find(f => f.qualityLabel === '480p') || 
                      formats[0];

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
// دالة البحث والتحميل
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
// دالة تحميل بديل (مصادر متعددة)
// ==========================================
async function downloadAlternative(url, platform) {
    try {
        // محاولة استخدام APIs بديلة
        const altApis = {
            'YouTube': [
                `https://api.vevioz.com/api/button/mp4/${encodeURIComponent(url)}`,
                `https://api.savetube.me/download?url=${encodeURIComponent(url)}`
            ],
            'TikTok': [
                `https://www.tikwm.com/api/?url=${encodeURIComponent(url)}`,
                `https://tiksave.io/api?url=${encodeURIComponent(url)}`
            ]
        };

        const apis = altApis[platform] || [];
        
        for (const api of apis) {
            try {
                const response = await axios.get(api, {
                    timeout: 15000,
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                    }
                });

                if (response.data && response.data.video) {
                    const videoUrl = response.data.video || response.data.url || response.data.download;
                    if (videoUrl) {
                        const videoResponse = await axios({
                            method: 'get',
                            url: videoUrl,
                            responseType: 'arraybuffer',
                            timeout: 30000
                        });
                        
                        return {
                            success: true,
                            data: videoResponse.data,
                            extension: 'mp4',
                            type: 'video',
                            url: url,
                            title: 'Downloaded Video'
                        };
                    }
                }
            } catch (e) {
                console.log(`⚠️ فشل API بديل: ${e.message}`);
            }
        }

        return { success: false, error: 'جميع المصادر البديلة فشلت' };

    } catch (error) {
        console.error('❌ فشل التحميل البديل:', error.message);
        return { success: false, error: error.message };
    }
}

// ==========================================
// دالة تحميل تيك توك
// ==========================================
async function downloadTikTok(url) {
    try {
        // استخدام API مجاني
        const apiUrl = `https://www.tikwm.com/api/?url=${encodeURIComponent(url)}`;
        
        const response = await axios.get(apiUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            },
            timeout: 15000
        });

        if (response.data && response.data.code === 0) {
            const data = response.data.data;
            const videoUrl = data.play || data.wmplay || data.download || '';
            
            if (!videoUrl) {
                return { success: false, error: 'لا يوجد فيديو' };
            }

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
// دالة تحميل انستغرام
// ==========================================
async function downloadInstagram(url) {
    try {
        // استخدام API مجاني
        const apiUrl = `https://api.instagram.com/oembed?url=${encodeURIComponent(url)}`;
        
        const response = await axios.get(apiUrl, {
            timeout: 10000,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            }
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
// دالة تحميل تويتر
// ==========================================
async function downloadTwitter(url) {
    try {
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
// دالة تحميل فيسبوك
// ==========================================
async function downloadFacebook(url) {
    try {
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

// ==========================================
// دالة إرسال الملف المحمل
// ==========================================
async function sendDownloadedFile(sock, from, msg, result, platform, pushName) {
    try {
        // حفظ الملف
        const downloadsDir = path.join(__dirname, '../downloads');
        if (!fs.existsSync(downloadsDir)) fs.mkdirSync(downloadsDir, { recursive: true });

        const extension = result.extension || 'mp4';
        const fileName = `${platform.replace(/\s/g, '_')}_${Date.now()}.${extension}`;
        const filePath = path.join(downloadsDir, fileName);
        
        const buffer = Buffer.isBuffer(result.data) ? result.data : Buffer.from(result.data);
        fs.writeFileSync(filePath, buffer);

        // إرسال الملف
        const caption = `📥 *تم التحميل بنجاح!*\n\n📱 *المنصة:* ${platform}\n📁 *الملف:* ${fileName}\n📊 *الحجم:* ${(buffer.length / 1024 / 1024).toFixed(2)} MB\n🕒 *الوقت:* ${moment().tz('Asia/Riyadh').format('HH:mm:ss | YYYY-MM-DD')}\n👤 *المرسل:* ${pushName}`;

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

        // حذف الملف بعد الإرسال
        setTimeout(() => {
            try { fs.unlinkSync(filePath); } catch (e) {}
        }, 10000);

    } catch (error) {
        console.error('❌ فشل إرسال الملف:', error);
        throw error;
    }
}
