const axios = require('axios');
const moment = require('moment-timezone');

// ==========================================
// نظام الإيميلات المؤقتة المتقدم
// ==========================================

// مخزن مؤقت لحفظ بيانات الإيميلات النشطة لكل مستخدم
// البنية: [sender] -> { user, domain, full, lastMsgId, sock, timestamp }
if (!global.tempMailCache) {
    global.tempMailCache = new Map();
}

// منع تكرار تفعيل المؤقت (Interval) عند إعادة تحميل الملف أو الأوامر
if (global.tempMailInterval) {
    clearInterval(global.tempMailInterval);
}

// ==========================================
// تشغيل نظام رادار المراقبة التلقائي في الخلفية (كل 10 ثوانٍ)
// ==========================================
global.tempMailInterval = setInterval(async () => {
    const now = Date.now();
    
    for (const [sender, data] of global.tempMailCache.entries()) {
        try {
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

            // الاستعلام عن صندوق الوارد لهذا الإيميل
            const res = await axios.get(`https://www.1secmail.com/api/v1/?action=getMessages&login=${data.user}&domain=${data.domain}`, { 
                timeout: 8000 
            });
            
            const messages = res.data;

            if (messages && messages.length > 0) {
                const latestMsg = messages[0];
                
                // إذا كانت هناك رسالة جديدة لم نرسلها من قبل
                if (data.lastMsgId === null || latestMsg.id > data.lastMsgId) {
                    
                    // قراءة تفاصيل الرسالة الجديدة بالكامل
                    const msgDetail = await axios.get(`https://www.1secmail.com/api/v1/?action=readMessage&login=${data.user}&domain=${data.domain}&id=${latestMsg.id}`, { 
                        timeout: 8000 
                    });
                    
                    const { from, subject, date, textBody, htmlBody } = msgDetail.data;

                    // تحديث آخر معرف رسالة تم قراءتها لمنع التكرار
                    data.lastMsgId = latestMsg.id;
                    global.tempMailCache.set(sender, data);

                    // تنظيف المحتوى
                    let cleanText = textBody || htmlBody || '';
                    cleanText = cleanText.replace(/<[^>]*>/g, '').trim();
                    cleanText = cleanText.substring(0, 3000);

                    // صياغة تقرير وصول الرسالة الملكي والتلقائي
                    const mailAlert = `📬 *[ رَادَارُ البَرِيدِ التِّلْقَائِيِّ ]* 📬\n\n` +
                                      `📥 *وصلت رسالة جديدة لبريدك:* \n\`${data.full}\`\n\n` +
                                      `━━━━━━━━━━━━━━━━━━━━━━\n` +
                                      `👤 *المرسل:* ${from || 'غير معروف'}\n` +
                                      `📑 *الموضوع:* ${subject || 'بدون موضوع'}\n` +
                                      `📅 *الوقت:* ${date || moment().tz('Asia/Riyadh').format('HH:mm:ss | YYYY-MM-DD')}\n` +
                                      `━━━━━━━━━━━━━━━━━━━━━━\n\n` +
                                      `💬 *المحتوى:* \n\n${cleanText || 'لا يوجد محتوى نصي'}\n\n` +
                                      `*— تَمَّ جَلْبُ البَيَانَاتِ بِتَشْفِيرٍ آمِنٍ تِلْقَائِيَّاً 🛡️*`;

                    // إرسال الإشعار التلقائي للمستخدم مباشرة
                    await data.sock.sendMessage(sender, { text: mailAlert });
                }
            }
        } catch (error) {
            // تجاهل أخطاء الشبكة المؤقتة لضمان استقرار السيرفر وعدم توقف الرادار
            if (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT') {
                continue;
            }
            console.error('❌ خطأ في رادار البريد:', error.message);
        }
    }
}, 10 * 1000); // الفحص التلقائي يجري كل 10 ثوانٍ

// ==========================================
// الأمر الرئيسي
// ==========================================
module.exports = {
    name: 'ايميل',
    aliases: ['بريد', 'tempmail', 'رادار', 'email'],
    description: '📧 نظام البريد المؤقت - إنشاء بريد ومراقبة تلقائية للرسائل',
    execute: async ({ sock, msg, args, text, reply, from, sender, pushName, isFromMe, prefix, commandName }) => {
        
        try {
            // إذا أراد المستخدم إيقاف الرادار يدوياً
            if (text && (text === 'ايقاف' || text === 'إيقاف' || text === 'stop' || text === 'حذف')) {
                if (global.tempMailCache.has(sender)) {
                    const data = global.tempMailCache.get(sender);
                    global.tempMailCache.delete(sender);
                    return reply(`✅ *تم إيقاف رادار المراقبة وحذف البريد:* \n\`${data.full}\` *بنجاح.*`);
                } else {
                    return reply('⚠️ *ليس لديك بريد نشط حالياً لتقوم بإيقافه.*');
                }
            }

            // إذا أراد المستخدم عرض حالة البريد
            if (text && (text === 'حالة' || text === 'status' || text === 'info')) {
                if (global.tempMailCache.has(sender)) {
                    const data = global.tempMailCache.get(sender);
                    const remaining = Math.max(0, 20 - Math.floor((Date.now() - data.timestamp) / 60000));
                    return reply(`📧 *حالة بريدك المؤقت*\n\n📌 *البريد:* \`${data.full}\`\n⏱️ *الوقت المتبقي:* ${remaining} دقيقة\n📊 *الحالة:* ${data.lastMsgId ? '🟢 نشط (استقبل رسائل)' : '🟡 في انتظار الرسائل'}\n\n📌 لإيقاف الرادار: \`${prefix}ايميل ايقاف\``);
                } else {
                    return reply('⚠️ *ليس لديك بريد نشط حالياً.*');
                }
            }

            // توليد عنوان بريد عشوائي فخم
            const res = await axios.get('https://www.1secmail.com/api/v1/?action=genAddrs&count=1', {
                timeout: 10000
            });
            
            if (!res.data || !res.data[0]) {
                throw new Error('فشل توليد البريد');
            }

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
                                  `📌 *الأوامر المتاحة:*\n` +
                                  `• \`${prefix}ايميل\` - إنشاء بريد جديد\n` +
                                  `• \`${prefix}ايميل حالة\` - عرض حالة البريد\n` +
                                  `• \`${prefix}ايميل ايقاف\` - إيقاف الرادار وحذف البريد\n\n` +
                                  `*— المراقبة الذاتية تعمل الآن لـ 20 دقيقة 🛡️*`;

            await reply(welcomeReport);

        } catch (error) {
            console.error('❌ خطأ في أمر البريد:', error.message);
            
            if (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT') {
                reply('❌ *تعذر الاتصال بالخادم الذكي لتوليد البريد. السيرفر مزدحم، حاول بعد ثوانٍ.*');
            } else {
                reply(`❌ *حدث خطأ أثناء توليد البريد:* ${error.message || 'خطأ غير معروف'}`);
            }
        }
    }
};
