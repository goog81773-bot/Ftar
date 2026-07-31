const axios = require('axios');
const fs = require('fs');
const path = require('path');
const moment = require('moment-timezone');
const { jidNormalizedUser } = require('@whiskeysockets/baileys');
const cheerio = require('cheerio');

module.exports = {
    name: 'image',
    aliases: ['صور', 'بحث', 'google', 'gif'],
    description: '🖼️ بحث عن صور وGIF - محاكاة المتصفح للبحث في جوجل',
    async execute({ sock, msg, args, text, reply, from, isGroup, sender, pushName, isFromMe, prefix, commandName }) {
        
        try {
            if (args.length < 1) {
                return reply(`🖼️ *نظام البحث عن الصور*\n\n📌 *الاستخدام:*\n${prefix}image [كلمة البحث] [العدد]\n${prefix}gif [كلمة البحث] [العدد]\n\n📝 *مثال:*\n${prefix}image قطط 5\n${prefix}gif قطط مضحكة 3\n\n📊 *العدد:* 1-10 (افتراضي 5)`);
            }

            // تحديد نوع البحث
            const isGif = commandName === 'gif' || args[0]?.toLowerCase() === 'gif';
            let searchTerm = args.join(' ');
            let limit = 5;

            if (args[0]?.toLowerCase() === 'gif') {
                args.shift();
                searchTerm = args.join(' ');
            }

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
                react: { text: isGif ? '🎬' : '🔍', key: msg.key } 
            });

            await reply(`🔍 جاري البحث عن ${isGif ? 'صور متحركة (GIF)' : 'صور'} لـ "${searchTerm}"...\n📊 العدد المطلوب: ${limit}`);

            // البحث عن الصور من جوجل
            const images = await searchGoogleImages(searchTerm, limit, isGif);

            if (!images || images.length === 0) {
                return reply(`❌ لم يتم العثور على ${isGif ? 'صور متحركة' : 'صور'} لـ "${searchTerm}"`);
            }

            // إرسال الصور
            let successCount = 0;
            for (let i = 0; i < Math.min(images.length, limit); i++) {
                const img = images[i];
                const caption = `🖼️ *نتيجة البحث ${i+1}/${Math.min(images.length, limit)}*\n\n🔍 *البحث:* ${searchTerm}\n📱 *النوع:* ${isGif ? 'GIF متحرك' : 'صورة'}\n📊 *الحجم:* ${img.size || 'غير معروف'}\n📱 *المصدر:* ${img.source || 'جوجل'}\n👤 *المرسل:* ${pushName}`;

                try {
                    const response = await axios.get(img.url, { 
                        responseType: 'arraybuffer',
                        timeout: 15000,
                        headers: {
                            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                            'Accept': 'image/webp,image/apng,image/*,*/*;q=0.8',
                            'Accept-Language': 'ar,en;q=0.9',
                            'Referer': 'https://www.google.com/',
                            'Sec-Fetch-Dest': 'image',
                            'Sec-Fetch-Mode': 'no-cors',
                            'Sec-Fetch-Site': 'cross-site'
                        }
                    });
                    
                    const buffer = Buffer.from(response.data);
                    
                    if (buffer.length > 20 * 1024 * 1024) {
                        continue;
                    }

                    if (isGif) {
                        await sock.sendMessage(from, { 
                            video: buffer,
                            caption: caption,
                            gifPlayback: true,
                            mimetype: 'video/mp4'
                        }, { quoted: msg });
                    } else {
                        await sock.sendMessage(from, { 
                            image: buffer, 
                            caption: caption 
                        }, { quoted: msg });
                    }
                    
                    successCount++;
                    await new Promise(resolve => setTimeout(resolve, 800));

                } catch (e) {
                    console.error(`❌ فشل تحميل الصورة ${i+1}:`, e.message);
                    continue;
                }
            }

            await reply(`✅ تم إرسال ${successCount} ${isGif ? 'صورة متحركة' : 'صورة'} بنجاح!\n🔍 البحث: "${searchTerm}"`);

        } catch (error) {
            console.error('❌ خطأ في البحث عن الصور:', error);
            reply(`❌ حدث خطأ: ${error.message || 'خطأ غير معروف'}`);
        }
    }
};

// ==========================================
// دالة البحث في جوجل بمحاكاة المتصفح
// ==========================================
async function searchGoogleImages(query, limit, isGif = false) {
    try {
        // بناء رابط البحث في جوجل
        const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(query)}&tbm=isch&tbs=${isGif ? 'itp:animated' : 'itp:photo'}`;
        
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

        // الطلب الأول: جلب صفحة البحث
        const response = await axios.get(searchUrl, {
            headers: headers,
            timeout: 15000,
            maxRedirects: 5
        });

        // تحليل HTML واستخراج الصور
        const images = await extractImagesFromHTML(response.data, query, limit);

        if (images && images.length > 0) {
            return images;
        }

        // إذا فشل، جرب طريقة بديلة
        return await searchImagesAlternative(query, limit, isGif);

    } catch (error) {
        console.error('❌ فشل البحث في جوجل:', error.message);
        return await searchImagesAlternative(query, limit, isGif);
    }
}

// ==========================================
// دالة استخراج الصور من HTML
// ==========================================
async function extractImagesFromHTML(html, query, limit) {
    try {
        const $ = cheerio.load(html);
        const images = [];
        
        // البحث عن جميع روابط الصور
        const imageElements = $('img[src*=".jpg"], img[src*=".png"], img[src*=".jpeg"], img[src*=".gif"], img[src*=".webp"]');
        
        imageElements.each((index, element) => {
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
            
            // فلترة الروابط غير الصالحة
            if (url && 
                !url.includes('google') && 
                !url.includes('gstatic') && 
                !url.includes('logo') &&
                url.match(/\.(jpg|jpeg|png|gif|webp)/i)) {
                
                const width = $(element).attr('width') || 'غير معروف';
                const height = $(element).attr('height') || 'غير معروف';
                
                images.push({
                    url: url,
                    source: 'جوجل',
                    size: `${width}x${height}`,
                    title: $(element).attr('alt') || 'بدون عنوان'
                });
            }
        });

        // إزالة التكرارات
        const uniqueImages = [];
        const seenUrls = new Set();
        for (const img of images) {
            if (!seenUrls.has(img.url) && img.url) {
                seenUrls.add(img.url);
                uniqueImages.push(img);
                if (uniqueImages.length >= limit * 3) break;
            }
        }

        return uniqueImages.slice(0, limit);

    } catch (error) {
        console.error('❌ فشل استخراج الصور:', error.message);
        return [];
    }
}

// ==========================================
// دالة البحث البديلة (بدون API)
// ==========================================
async function searchImagesAlternative(query, limit, isGif = false) {
    try {
        // استخدام مواقع صور مجانية
        const sites = [
            {
                url: `https://picsum.photos/seed/${encodeURIComponent(query)}/800/600`,
                type: 'random',
                parser: (data) => ({
                    url: data,
                    source: 'Picsum',
                    size: '800x600'
                })
            },
            {
                url: `https://api.unsplash.com/photos/random?query=${encodeURIComponent(query)}&count=${Math.min(limit, 5)}`,
                type: 'json',
                parser: (data) => {
                    if (Array.isArray(data)) {
                        return data.map(img => ({
                            url: img.urls?.regular || img.urls?.full || '',
                            source: 'Unsplash',
                            size: `${img.width}x${img.height}` || 'غير معروف'
                        }));
                    }
                    return [];
                }
            }
        ];

        // محاولة كل موقع
        for (const site of sites) {
            try {
                if (site.type === 'random') {
                    const response = await axios.get(site.url, {
                        responseType: 'arraybuffer',
                        headers: {
                            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                        },
                        timeout: 8000
                    });
                    
                    if (response.data && response.data.length > 0) {
                        return [{
                            url: site.url,
                            source: 'Picsum',
                            size: '800x600'
                        }];
                    }
                }
            } catch (e) {
                console.log(`⚠️ فشل ${site.url}:`, e.message);
            }
        }

        // الحل الأخير: صور عشوائية
        const randomImages = [];
        for (let i = 0; i < limit; i++) {
            const seed = `${query.replace(/\s/g, '_')}_${i}_${Date.now()}`;
            randomImages.push({
                url: `https://picsum.photos/seed/${seed}/800/600`,
                source: 'Picsum (عشوائي)',
                size: '800x600'
            });
        }
        return randomImages;

    } catch (error) {
        console.error('❌ فشل البحث البديل:', error.message);
        return [];
    }
}

// ==========================================
// دالة محاكاة المتصفح بالكامل
// ==========================================
async function simulateBrowserSearch(query, limit, isGif) {
    try {
        // استخدام Puppeteer إذا كان متاحاً
        let puppeteer;
        try {
            puppeteer = require('puppeteer');
        } catch (e) {
            console.log('⚠️ Puppeteer غير متوفر');
            return null;
        }

        const browser = await puppeteer.launch({
            headless: true,
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-accelerated-2d-canvas',
                '--disable-gpu'
            ]
        });

        try {
            const page = await browser.newPage();
            await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
            await page.setViewport({ width: 1920, height: 1080 });
            
            // البحث في جوجل
            const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(query)}&tbm=isch&tbs=${isGif ? 'itp:animated' : 'itp:photo'}`;
            await page.goto(searchUrl, { waitUntil: 'networkidle2', timeout: 30000 });
            
            // انتظار تحميل الصور
            await page.waitForSelector('img[src*=".jpg"], img[src*=".png"], img[data-src*=".jpg"]', { timeout: 10000 });
            
            // استخراج روابط الصور
            const images = await page.evaluate(() => {
                const imgs = [];
                const elements = document.querySelectorAll('img[src*=".jpg"], img[src*=".png"], img[src*=".jpeg"], img[src*=".gif"]');
                elements.forEach(img => {
                    const src = img.src || img.dataset.src || '';
                    if (src && !src.includes('google') && !src.includes('gstatic')) {
                        imgs.push({
                            url: src,
                            width: img.width || 'غير معروف',
                            height: img.height || 'غير معروف'
                        });
                    }
                });
                return imgs;
            });

            await browser.close();
            return images.slice(0, limit);

        } catch (e) {
            await browser.close();
            console.error('❌ فشل Puppeteer:', e.message);
            return null;
        }

    } catch (error) {
        console.error('❌ فشل محاكاة المتصفح:', error.message);
        return null;
    }
}
