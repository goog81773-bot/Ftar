const axios = require('axios');

// مخزن مؤقت لحفظ بيانات الإيميلات النشطة لكل مستخدم
// البنية: [sender] -> { user, domain, full, lastMsgId, sock, timestamp }
if (!global.tempMailCache) {
    global.tempMailCache = new Map();
}

// منع تكرار تفعيل المؤقت (Interval) عند إعادة تحميل الملف أو الأوامر
if (global.tempMailInterval) {
    clearInterval(global.tempMailInterval);
}

// تشغيل نظام رادار المراقبة التلقائي في الخلفية (كل 10 ثوانٍ)
global.tempMailInterval = setInterval(async () => {
    const now = Date.now();
    
    for (const [sender, data] of global.tempMailCache.entries()) {
        // حماية السيرفر: حذف الإيميلات التلقائي بعد 20 دقيقة من إنشائها
        if (now - data.timestamp > 20 * 60 * 1000) {
            try {
                await data.sock.sendMessage(sender, { 
                    text: `⚠️ *[ تنبيه رادار البريد ]*\n\nانتهت صلاحية بريدك المؤقت (\`${data.full}\`) وتم إيقاف المراقبة تلقائياً لحماية خصوصيتك وتخفيف الضغط.` 
                });
            } catch (e) {}
            global.tempMailCache.delete(sender);
            continue;
        }

        try {
            // الاستعلام عن صندوق الوارد لهذا الإيميل
            const res = await axios.get(`https://www.1secmail.com/api/v1/?action=getMessages&login=${data.user}&domain=${data.domain}`, { timeout: 8000 });
            const messages = res.data;

            if (messages && messages.length > 0) {
                const latestMsg = messages[0];
                
                // إذا كانت هناك رسالة جديدة لم نرسلها من قبل
                if (data.lastMsgId === null || latestMsg.id > data.lastMsgId) {
                    
                    // قراءة تفاصيل الرسالة الجديدة بالكامل
                    const msgDetail = await axios.get(`https://www.1secmail.com/api/v1/?action=readMessage&login=${data.user}&domain=${data.domain}&id=${latestMsg.id}`, { timeout: 8000 });
                    const { from, subject, date, textBody } = msgDetail.data;

                    // تحديث آخر معرف رسالة تم قراءتها لمنع التكرار
                    data.lastMsgId = latestMsg.id;
                    global.tempMailCache.set(sender, data);

                    // صياغة تقرير وصول الرسالة الملكي والتلقائي
                    const mailAlert = `📬 *[ رَادَارُ البَرِيدِ التِّلْقَائِيِّ ]* 📬\n\n` +
                                      `📥 *وصلت رسالة جديدة لبريدك:* \n\`${data.full}\`\n\n` +
                                      `━━━━━━━━━━━━━━━━━━━━━━\n` +
                                      `👤 *المرسل:* ${from}\n` +
                                      `📑 *الموضوع:* ${subject || 'بدون موضوع'}\n` +
                                      `📅 *الوقت:* ${date}\n` +
                                      `━━━━━━━━━━━━━━━━━━━━━━\n\n` +
                                      `💬 *المحتوى والكود:* \n\n${textBody.trim()}\n\n` +
                                      `*— تَمَّ جَلْبُ البَيَانَاتِ بِتَشْفِيرٍ آمِنٍ تِلْقَائِيَّاً 🛡️*`;

                    // إرسال الإشعار التلقائي للمستخدم مباشرة
                    await data.sock.sendMessage(sender, { text: mailAlert });
                }
            }
        } catch (error) {
            // تجاهل أخطاء الشبكة المؤقتة لضمان استقرار السيرفر وعدم توقف الرادار
        }
    }
}, 10 * 1000); // الفحص التلقائي يجري كل 10 ثوانٍ

module.exports = {
    name: 'ايميل',
    aliases: ['بريد', 'tempmail', 'رادار'],
    execute: async ({ reply, sender, sock, text }) => {
        // إذا أراد المستخدم إيقاف الرادار يدوياً
        if (text === 'ايقاف' || text === 'إيقاف' || text === 'stop') {
            if (global.tempMailCache.has(sender)) {
                const data = global.tempMailCache.get(sender);
                global.tempMailCache.delete(sender);
                return reply(`✅ *تم إيقاف رادار المراقبة وحذف البريد:* \n\`${data.full}\` *بنجاح.*`);
            } else {
                return reply('⚠️ *ليس لديك بريد نشط حالياً لتقوم بإيقافه.*');
            }
        }

        try {
            // توليد عنوان بريد عشوائي فخم
            const res = await axios.get('https://www.1secmail.com/api/v1/?action=genAddrs&count=1');
            const mail = res.data[0];
            const [user, domain] = mail.split('@');

            // تسجيل البريد الجديد وتفعيل المراقبة عليه
            global.tempMailCache.set(sender, {
                user,
                domain,
                full: mail,
                lastMsgId: null,
                sock: sock,
                timestamp: Date.now()
            });

            const welcomeReport = `📧 *[ بَرِيدُ طَرْزَانَ الـ VIP التِّلْقَائِيُّ ]* 📧\n\n` +
                                  `📌 *بريدك الجديد هو:* \n\`${mail}\`\n\n` +
                                  `⚡ *حالة الرادار:* 【 🟢 نَشِطٌ وَيُرَاقِبُ 】\n\n` +
                                  `⚙️ *كيف يعمل؟* \n` +
                                  `انسخ الإيميل وسجل به في أي موقع، وبمجرد وصول كود التفعيل أو رسالة التأكيد، سيقوم البوت بإرسالها لك هنا تلقائياً بدون تدخل منك!\n\n` +
                                  `❌ *للإلغاء يدوياً اكتب:* \n*.ايميل ايقاف*\n\n` +
                                  `*— المراقبة الذاتية تعمل الآن لـ 20 دقيقة 🛡️*`;

            await reply(welcomeReport);

        } catch (error) {
            reply('❌ *حدث خطأ أثناء الاتصال بالخادم الذكي لتوليد البريد.*');
        }
    }
};
