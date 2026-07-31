const axios = require('axios');
const fs = require('fs');
const path = require('path');
const moment = require('moment-timezone');
const { jidNormalizedUser } = require('@whiskeysockets/baileys');
const cheerio = require('cheerio');

module.exports = {
    name: 'gif',
    aliases: ['صور_متحركة', 'giphy', 'gifs'],
    description: '🎬 تحميل صور متحركة (GIF) من جوجل - بحث دقيق وتحميل مباشر',
    
    async execute({ sock, msg, args, text, reply, from, sender, pushName, isFromMe, prefix, commandName }) {
        
        try {
            if (args.length < 1) {
                return reply(`🎬 *نظام تحميل الصور المتحركة من جوجل*\n\n📌 *الاستخدام:*\n${prefix}gif [كلمة البحث] [العدد]\n\n📝 *مثال:*\n${prefix}gif قطط مضحكة 5\n${prefix}gif نار 3\n\n📊 *العدد:* 1-10 (افتراضي 5)`);
            }

            let searchTerm = args.join(' ');
            let limit = 5;

            // استخراج العدد
            const lastArg = args[args.length - 1];
            if (!isNaN(lastArg) && parseInt(lastArg) > 0 && parseInt(lastArg) <= 10) {
                limit = parseInt(lastArg);
                args.pop();
                searchTerm = args.join(' ');
            }

            if (!searchTerm || searchTerm.trim() === '') {
                return reply(`❌ يرجى إدخال كلمة البحث.`);
            }

            await sock.sendMessage(from, { 
                react: { text: '🎬', key: msg.key } 
            });

            await reply(`🔍 *جاري البحث عن صور متحركة (GIF) من جوجل لـ "${searchTerm}"...*\n📊 العدد المطلوب: ${limit}`);

            // البحث عن الصور المتحركة من جوجل فقط
            const gifs = await searchGoogleGifs(searchTerm, limit);

            if (!gifs || gifs.length === 0) {
                return reply(`❌ لم يتم العثور على صور متحركة في جوجل لـ "${searchTerm}"`);
            }

            // إرسال الصور
            let successCount = 0;
            for (let i = 0; i < Math.min(gifs.length, limit); i++) {
                const gif = gifs[i];
                const caption = `🎬 *صورة متحركة ${i+1}/${Math.min(gifs.length, limit)}*\n\n🔍 *البحث:* ${searchTerm}\n📊 *الحجم:* ${gif.size || 'غير معروف'}\n📱 *المصدر:* جوجل\n👤 *المرسل:* ${pushName}\n🕒 *الوقت:* ${moment().tz('Asia/Riyadh').format('HH:mm:ss')}`;

                try {
                    // تحميل الصورة من جوجل
                    const response = await axios.get(gif.url, { 
                        responseType: 'arraybuffer',
                        timeout: 15000,
                        headers: {
                            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                            'Accept': 'image/webp,image/apng,image/gif,image/*,*/*;q=0.8',
                            'Accept-Language': 'ar,en;q=0.9',
                            'Referer': 'https://www.google.com/',
                            'Sec-Fetch-Dest': 'image',
                            'Sec-Fetch-Mode': 'no-cors',
                            'Sec-Fetch-Site': 'cross-site'
                        }
                    });
                    
                    const buffer = Buffer.from(response.data);
                    
                    // التحقق من الحجم
                    if (buffer.length > 15 * 1024 * 1024) {
                        continue;
                    }

                    // إرسال كـ GIF متحرك
                    await sock.sendMessage(from, { 
                        video: buffer,
                        caption: caption,
                        gifPlayback: true,
                        mimetype: 'video/mp4'
                    }, { quoted: msg });
                    
                    successCount++;
                    await new Promise(resolve => setTimeout(resolve, 500));

                } catch (e) {
                    console.error(`❌ فشل تحميل الصورة ${i+1}:`, e.message);
                    continue;
                }
            }

            await reply(`✅ *تم إرسال ${successCount} صورة متحركة من جوجل بنجاح!*\n🔍 البحث: "${searchTerm}"\n📊 المطلوب: ${limit} | المستلم: ${successCount}`);

        } catch (error) {
            console.error('❌ خطأ في البحث عن الصور المتحركة:', error);
            reply(`❌ حدث خطأ: ${error.message || 'خطأ غير معروف'}`);
        }
    }
};

// ==========================================
// دالة البحث في جوجل عن الصور المتحركة فقط
// ==========================================
async function searchGoogleGifs(query, limit) {
    try {
        // بناء رابط البحث في جوجل للصور المتحركة فقط
        const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(query)}&tbm=isch&tbs=itp:animated`;
        
        // محاكاة المتصفح الحقيقي
        const headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8',
            'Accept-Language': 'ar,en-US;q=0.9,en;q=0.8',
            'Accept-Encoding': 'gzip, deflate, br',
            'Connection': 'keep-alive',
            'Upgrade-Insecure-Requests': '1',
            'Sec-Fetch-Dest': 'document',
            'Sec-Fetch-Mode': 'navigate',
            'Sec-Fetch-Site': 'none',
            'Sec-Fetch-User': '?1',
            'Cache-Control': 'max-age=0',
            'Referer': 'https://www.google.com/'
        };

        // جلب صفحة البحث من جوجل
        const response = await axios.get(searchUrl, {
            headers: headers,
            timeout: 15000,
            maxRedirects: 5
        });

        // استخراج روابط الصور المتحركة من جوجل
        const gifs = await extractGifsFromGoogle(response.data, limit);

        if (gifs && gifs.length > 0) {
            return gifs;
        }

        return [];

    } catch (error) {
        console.error('❌ فشل البحث في جوجل:', error.message);
        return [];
    }
}

// ==========================================
// دالة استخراج الصور المتحركة من جوجل فقط
// ==========================================
async function extractGifsFromGoogle(html, limit) {
    try {
        const $ = cheerio.load(html);
        const gifs = [];
        const seenUrls = new Set();

        // البحث عن جميع الصور في صفحة جوجل
        const imgElements = $('img[src*=".gif"], img[src*=".webp"], img[data-src*=".gif"], img[data-src*=".webp"]');
        
        imgElements.each((index, element) => {
            let src = $(element).attr('src');
            let dataSrc = $(element).attr('data-src');
            let srcset = $(element).attr('srcset');
            
            // اختيار أفضل رابط
            let url = src || dataSrc || '';
            
            // استخراج من srcset
            if (!url && srcset) {
                const parts = srcset.split(',');
                if (parts.length > 0) {
                    const last = parts[parts.length - 1].trim().split(' ');
                    url = last[0] || '';
                }
            }
            
            // تنظيف الرابط
            if (url && !url.startsWith('http')) {
                if (url.startsWith('//')) {
                    url = 'https:' + url;
                } else if (url.startsWith('/')) {
                    url = 'https://www.google.com' + url;
                }
            }
            
            // فلترة الروابط - فقط من جوجل
            if (url && 
                !seenUrls.has(url) &&
                !url.includes('google') && 
                !url.includes('gstatic') &&
                !url.includes('logo') &&
                (url.includes('.gif') || url.includes('.webp'))) {
                
                seenUrls.add(url);
                gifs.push({
                    url: url,
                    source: 'جوجل',
                    size: $(element).attr('width') ? 
                        `${$(element).attr('width')}x${$(element).attr('height')}` : 
                        'غير معروف'
                });
                
                if (gifs.length >= limit * 2) return false;
            }
        });

        // إزالة التكرارات
        const uniqueGifs = [];
        const uniqueUrls = new Set();
        for (const gif of gifs) {
            if (!uniqueUrls.has(gif.url)) {
                uniqueUrls.add(gif.url);
                uniqueGifs.push(gif);
                if (uniqueGifs.length >= limit) break;
            }
        }

        return uniqueGifs;

    } catch (error) {
        console.error('❌ فشل استخراج الصور من جوجل:', error.message);
        return [];
    }
}
