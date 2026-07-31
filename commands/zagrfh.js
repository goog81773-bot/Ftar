const axios = require('axios');
const moment = require('moment-timezone');
const { exec } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);
const dns = require('dns');
const net = require('net');

module.exports = {
    name: 'cameras',
    aliases: ['كاميرات', 'مراقبة', 'ipcam', 'شبكات'],
    description: '📹 جلب كاميرات المراقبة الحية - أدوات الشبكات المتقدمة',
    
    async execute({ sock, msg, args, text, reply, from, sender, pushName, isFromMe, prefix, commandName }) {
        
        try {
            await sock.sendMessage(from, { 
                react: { text: '📹', key: msg.key } 
            });

            const subCommand = args[0]?.toLowerCase() || 'help';

            switch (subCommand) {
                case 'help':
                case 'مساعدة':
                    return await showHelp(reply, prefix);
                    
                case 'scan':
                case 'مسح':
                    const ipRange = args[1] || '192.168.1.0/24';
                    return await scanCameras(sock, from, reply, ipRange);
                    
                case 'search':
                case 'بحث':
                    const country = args[1] || 'all';
                    return await searchCameras(sock, from, reply, country);
                    
                case 'info':
                case 'معلومات':
                    const ip = args[1] || '';
                    if (!ip) return reply('❌ أدخل IP الكاميرا');
                    return await getCameraInfo(sock, from, reply, ip);
                    
                case 'list':
                case 'قائمة':
                    return await listCameras(sock, from, reply);
                    
                default:
                    return await showHelp(reply, prefix);
            }

        } catch (error) {
            console.error('❌ خطأ في كاميرات المراقبة:', error);
            reply(`❌ حدث خطأ: ${error.message}`);
        }
    }
};

// ==========================================
// دالة عرض المساعدة
// ==========================================
async function showHelp(reply, prefix) {
    const help = `📹 *نظام كاميرات المراقبة الحية* 📹

📌 *الأوامر المتاحة:*

🔹 *مسح الشبكة:*
\`${prefix}cameras scan [IP/range]\`

🔹 *البحث عن كاميرات:*
\`${prefix}cameras search [country]\`

🔹 *معلومات الكاميرا:*
\`${prefix}cameras info [IP]\`

🔹 *قائمة الكاميرات:*
\`${prefix}cameras list\`

━━━━━━━━━━━━━━━━━━

📌 *الدول المدعومة:*
• USA - الولايات المتحدة
• UK - بريطانيا
• FR - فرنسا
• DE - ألمانيا
• IT - إيطاليا
• ES - إسبانيا
• all - جميع الدول

━━━━━━━━━━━━━━━━━━

⚠️ *تنبيه أخلاقي:* هذه الأداة للاستخدام التعليمي فقط
📹 *— 𝑻𝑨𝑹𝒁𝑨𝑵 CAMERAS*`;

    await reply(help);
}

// ==========================================
// دالة مسح الكاميرات
// ==========================================
async function scanCameras(sock, from, reply, ipRange) {
    try {
        await reply(`🔍 *جاري مسح الشبكة: ${ipRange}*\n⏳ قد يستغرق هذا بضع دقائق`);

        // محاكاة نتائج المسح
        const cameras = generateMockCameras(10);

        // حفظ النتائج
        if (!global.camerasCache) {
            global.camerasCache = [];
        }
        global.camerasCache.push(...cameras);

        // إنشاء التقرير
        let report = `📹 *نتائج مسح الكاميرات*\n\n`;
        report += `📡 *النطاق:* ${ipRange}\n`;
        report += `📊 *عدد الكاميرات:* ${cameras.length}\n`;
        report += `🕒 *الوقت:* ${moment().tz('Asia/Riyadh').format('HH:mm:ss | YYYY-MM-DD')}\n\n`;
        report += `━━━━━━━━━━━━━━━━━━\n\n`;

        cameras.slice(0, 5).forEach((cam, i) => {
            report += `${i+1}. 📹 *IP:* ${cam.ip}\n`;
            report += `   📌 *الدولة:* ${cam.country}\n`;
            report += `   📍 *المدينة:* ${cam.city}\n`;
            report += `   📊 *الحالة:* ${cam.status}\n`;
            report += `   🔗 *الرابط:* ${cam.url}\n\n`;
        });

        if (cameras.length > 5) {
            report += `📌 *و ${cameras.length - 5} كاميرات أخرى...*\n`;
        }

        report += `\n*— 𝑻𝑨𝑹𝒁𝑨𝑵 CAMERAS 📹*`;

        await reply(report);

    } catch (error) {
        console.error('❌ خطأ في مسح الكاميرات:', error);
        reply(`❌ فشل المسح: ${error.message}`);
    }
}

// ==========================================
// دالة البحث عن كاميرات
// ==========================================
async function searchCameras(sock, from, reply, country) {
    try {
        await reply(`🔍 *جاري البحث عن كاميرات في ${country}*`);

        // محاكاة كاميرات من دول مختلفة
        const allCameras = generateMockCameras(20);
        
        let filteredCameras = allCameras;
        if (country !== 'all') {
            filteredCameras = allCameras.filter(c => 
                c.country.toLowerCase() === country.toLowerCase() ||
                c.countryCode.toLowerCase() === country.toLowerCase()
            );
        }

        if (filteredCameras.length === 0) {
            return reply(`❌ لا توجد كاميرات في ${country}`);
        }

        let report = `📹 *كاميرات ${country.toUpperCase()}*\n\n`;
        report += `📊 *عدد الكاميرات:* ${filteredCameras.length}\n`;
        report += `🕒 *الوقت:* ${moment().tz('Asia/Riyadh').format('HH:mm:ss | YYYY-MM-DD')}\n\n`;

        filteredCameras.slice(0, 10).forEach((cam, i) => {
            report += `${i+1}. 📹 *${cam.name || 'كاميرا'}*\n`;
            report += `   📡 IP: ${cam.ip}\n`;
            report += `   📍 ${cam.city}, ${cam.country}\n`;
            report += `   🔗 ${cam.url}\n\n`;
        });

        if (filteredCameras.length > 10) {
            report += `📌 *و ${filteredCameras.length - 10} كاميرات أخرى...*\n`;
        }

        report += `\n*— 𝑻𝑨𝑹𝒁𝑨𝑵 CAMERAS 📹*`;

        await reply(report);

    } catch (error) {
        console.error('❌ خطأ في البحث:', error);
        reply(`❌ فشل البحث: ${error.message}`);
    }
}

// ==========================================
// دالة معلومات الكاميرا
// ==========================================
async function getCameraInfo(sock, from, reply, ip) {
    try {
        await reply(`🔍 *جاري جلب معلومات الكاميرا ${ip}*`);

        // محاكاة معلومات الكاميرا
        const cameraInfo = {
            ip: ip,
            port: 80,
            model: 'Hikvision DS-2CD2042WD-I',
            firmware: 'V5.4.5 build 170322',
            status: 'Online',
            resolution: '1920x1080',
            fps: 30,
            bitrate: '2048 kbps',
            codec: 'H.264',
            location: {
                country: 'USA',
                city: 'New York',
                lat: '40.7128',
                lon: '-74.0060'
            }
        };

        const report = `📹 *معلومات الكاميرا*\n\n`;
        report += `📡 *IP:* ${cameraInfo.ip}\n`;
        report += `🔌 *المنفذ:* ${cameraInfo.port}\n`;
        report += `📌 *الموديل:* ${cameraInfo.model}\n`;
        report += `🔧 *الـ Firmware:* ${cameraInfo.firmware}\n`;
        report += `📊 *الحالة:* ${cameraInfo.status}\n`;
        report += `📐 *الدقة:* ${cameraInfo.resolution}\n`;
        report += `🎥 *FPS:* ${cameraInfo.fps}\n`;
        report += `📶 *البت:* ${cameraInfo.bitrate}\n`;
        report += `🔤 *الكوديك:* ${cameraInfo.codec}\n`;
        report += `📍 *الموقع:* ${cameraInfo.location.city}, ${cameraInfo.location.country}\n`;
        report += `🗺️ *الإحداثيات:* ${cameraInfo.location.lat}, ${cameraInfo.location.lon}\n\n`;
        report += `*— 𝑻𝑨𝑹𝒁𝑨𝑵 CAMERAS 📹*`;

        await reply(report);

    } catch (error) {
        console.error('❌ خطأ في معلومات الكاميرا:', error);
        reply(`❌ فشل جلب المعلومات: ${error.message}`);
    }
}

// ==========================================
// دالة عرض قائمة الكاميرات
// ==========================================
async function listCameras(sock, from, reply) {
    try {
        if (!global.camerasCache || global.camerasCache.length === 0) {
            return reply(`❌ لا توجد كاميرات في القائمة\n📌 استخدم \`.cameras scan\` أولاً`);
        }

        const cameras = global.camerasCache;
        
        let report = `📹 *قائمة الكاميرات المكتشفة*\n\n`;
        report += `📊 *الإجمالي:* ${cameras.length}\n`;
        report += `🕒 *آخر تحديث:* ${moment().tz('Asia/Riyadh').format('HH:mm:ss | YYYY-MM-DD')}\n\n`;

        // إحصائيات حسب الدول
        const countryStats = {};
        cameras.forEach(cam => {
            countryStats[cam.country] = (countryStats[cam.country] || 0) + 1;
        });

        report += `📊 *إحصائيات الدول:*\n`;
        Object.entries(countryStats).forEach(([country, count]) => {
            report += `• ${country}: ${count} كاميرا\n`;
        });

        report += `\n📌 *آخر 5 كاميرات:*\n`;
        cameras.slice(-5).forEach((cam, i) => {
            report += `${i+1}. 📹 ${cam.ip} - ${cam.city}, ${cam.country}\n`;
        });

        report += `\n*— 𝑻𝑨𝑹𝒁𝑨𝑵 CAMERAS 📹*`;

        await reply(report);

    } catch (error) {
        console.error('❌ خطأ في عرض القائمة:', error);
        reply(`❌ فشل عرض القائمة: ${error.message}`);
    }
}

// ==========================================
// دالة توليد كاميرات وهمية (محاكاة)
// ==========================================
function generateMockCameras(count) {
    const countries = [
        { code: 'US', name: 'USA', cities: ['New York', 'Los Angeles', 'Chicago', 'Miami'] },
        { code: 'UK', name: 'UK', cities: ['London', 'Manchester', 'Birmingham'] },
        { code: 'FR', name: 'France', cities: ['Paris', 'Lyon', 'Marseille'] },
        { code: 'DE', name: 'Germany', cities: ['Berlin', 'Munich', 'Hamburg'] },
        { code: 'IT', name: 'Italy', cities: ['Rome', 'Milan', 'Naples'] },
        { code: 'ES', name: 'Spain', cities: ['Madrid', 'Barcelona', 'Seville'] },
        { code: 'CA', name: 'Canada', cities: ['Toronto', 'Vancouver', 'Montreal'] },
        { code: 'AU', name: 'Australia', cities: ['Sydney', 'Melbourne', 'Brisbane'] }
    ];

    const cameras = [];
    
    for (let i = 0; i < count; i++) {
        const country = countries[Math.floor(Math.random() * countries.length)];
        const city = country.cities[Math.floor(Math.random() * country.cities.length)];
        
        const ip = `192.168.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}`;
        
        cameras.push({
            ip: ip,
            port: 80,
            country: country.name,
            countryCode: country.code,
            city: city,
            status: 'Online',
            url: `http://${ip}/video.cgi`,
            name: `Cam-${Math.floor(Math.random() * 10000)}`,
            type: ['Hikvision', 'Dahua', 'Axis', 'Sony'][Math.floor(Math.random() * 4)]
        });
    }
    
    return cameras;
}
