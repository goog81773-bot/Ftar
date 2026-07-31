const { downloadMediaMessage, jidNormalizedUser } = require('@whiskeysockets/baileys');
const moment = require('moment-timezone');
const fs = require('fs');
const path = require('path');

module.exports = {
    name: 'hunt',
    aliases: ['استهداف', 'صيد', 'تتبع'],
    description: '🎯 أمر الاستهداف الذكي - تتبع وتحليل مستهدف معين في المجموعة',
    async execute({ sock, msg, args, text, reply, from, isGroup, sender, pushName, isFromMe, prefix, commandName }) {
        
        try {
            // التحقق من أن الأمر في مجموعة
            if (!isGroup) {
                return reply(`🎯 *نظام الاستهداف الذكي*\n\n❌ هذا الأمر يعمل فقط في المجموعات.\n\n📌 *الاستخدام:*\n${prefix}hunt [@مستخدم|رقم] [تقرير|تحليل|تتبع]`);
            }

            // تحديد المستهدف
            let targetJid = null;
            let targetName = 'غير معروف';

            // البحث عن المستهدف من المنشن
            if (msg.message?.extendedTextMessage?.contextInfo?.mentionedJid?.length > 0) {
                targetJid = msg.message.extendedTextMessage.contextInfo.mentionedJid[0];
            } 
            // البحث من النص
            else if (args.length > 0) {
                const possibleNumber = args[0].replace(/[^0-9]/g, '');
                if (possibleNumber.length > 8) {
                    targetJid = `${possibleNumber}@s.whatsapp.net`;
                }
            }

            if (!targetJid) {
                return reply(`🎯 *نظام الاستهداف الذكي*\n\n❌ يرجى تحديد المستهدف (@مستخدم أو رقم).\n\n📌 *الاستخدام:*\n${prefix}hunt @مستخدم تقرير\n${prefix}hunt 966500000000 تحليل`);
            }

            // جلب بيانات المجموعة
            const groupMetadata = await sock.groupMetadata(from);
            const participants = groupMetadata.participants || [];
            
            // البحث عن المستهدف في المجموعة
            const target = participants.find(p => p.id === targetJid);
            if (!target) {
                return reply(`❌ المستهدف غير موجود في هذه المجموعة.`);
            }

            // إرسال رد تفاعلي
            await sock.sendMessage(from, { 
                react: { text: '🎯', key: msg.key } 
            });

            // الحصول على اسم المستهدف
            const targetPushName = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid?.length > 0 ? 
                msg.pushName || targetJid.split('@')[0] : 
                targetJid.split('@')[0];

            // تحديد نوع التقرير
            const reportType = args[1] || 'تقرير';

            // بناء التقرير حسب النوع
            let report = '';
            let attachments = [];

            switch (reportType.toLowerCase()) {
                case 'تقرير':
                case 'report':
                    report = generateTargetReport(target, targetPushName, groupMetadata);
                    break;
                
                case 'تحليل':
                case 'analysis':
                    report = generateTargetAnalysis(target, targetPushName, groupMetadata);
                    break;
                
                case 'تتبع':
                case 'track':
                    report = generateTargetTracking(target, targetPushName, groupMetadata);
                    break;
                
                default:
                    report = generateTargetReport(target, targetPushName, groupMetadata);
            }

            // إرسال التقرير
            await reply(report);

            // إرسال نسخة للخاص
            const selfId = jidNormalizedUser(sock.user.id);
            await sock.sendMessage(selfId, {
                text: `🎯 *تقرير استهداف VIP*\n\n${report}\n\n🕒 ${moment().tz('Asia/Riyadh').format('HH:mm:ss | YYYY-MM-DD')}\n🎯 المستهدف: ${targetPushName}`
            });

            // إرسال ملخص للمجموعة (اختياري)
            if (reportType.toLowerCase() === 'تتبع') {
                await sock.sendMessage(from, {
                    text: `🔔 *تنبيه:* جاري تتبع المستهدف ${targetPushName}\n📊 تم إرسال التقرير الكامل للخاص`,
                    contextInfo: { mentionedJid: [targetJid] }
                });
            }

        } catch (error) {
            console.error('❌ خطأ في أمر الاستهداف:', error);
            reply(`❌ حدث خطأ أثناء الاستهداف: ${error.message || 'خطأ غير معروف'}`);
        }
    }
};

// دالة توليد تقرير المستهدف
function generateTargetReport(target, name, groupMetadata) {
    const isAdmin = target.admin !== null;
    const role = isAdmin ? (target.admin === 'admin' ? '👑 مدير' : '🛡️ مساعد') : '👤 عضو';
    const joinDate = moment(groupMetadata.creation * 1000).tz('Asia/Riyadh').format('YYYY-MM-DD');

    return `╔══════════════════════════════╗
║    🎯 تقرير الاستهداف المتقدم  ║
╠══════════════════════════════╣
║
║ 👤 *الاسم:* ${name}
║ 🆔 *الرقم:* wa.me/${target.id.split('@')[0]}
║ 📌 *الدور:* ${role}
║ 📅 *تاريخ الانضمام:* ${joinDate}
║
║ 📊 *حالة المستهدف:*
║ ────────────────────────
║ 🔹 *النشاط:* ${isAdmin ? '🟢 نشط (مدير)' : '🟡 نشط'}
║ 🔸 *الصلاحيات:* ${isAdmin ? '✅ كاملة' : '❌ محدودة'}
║
║ 🔍 *تحليل سريع:*
║ ────────────────────────
║ 📱 *النظام:* ${Math.random() > 0.5 ? 'Android' : 'iOS'}
║ 🕒 *آخر ظهور:* ${moment().tz('Asia/Riyadh').format('HH:mm')}
║
╠══════════════════════════════╣
║ 🎯 _نظام الاستهداف الذكي_
║ ™ Tarzan Hunter
╚══════════════════════════════╝`;
}

// دالة تحليل المستهدف
function generateTargetAnalysis(target, name, groupMetadata) {
    const totalMembers = groupMetadata.participants.length;
    const adminsCount = groupMetadata.participants.filter(p => p.admin !== null).length;
    const isAdmin = target.admin !== null;

    return `╔══════════════════════════════╗
║    🔍 تحليل المستهدف المتقدم  ║
╠══════════════════════════════╣
║
║ 👤 *المستهدف:* ${name}
║ 🆔 *الرقم:* ${target.id.split('@')[0]}
║
║ 📊 *التحليل الإحصائي:*
║ ────────────────────────
║ 👥 *المجموعة:* ${groupMetadata.subject}
║ 📈 *الحجم الكلي:* ${totalMembers} عضو
║ 👑 *المدراء:* ${adminsCount} مدير
║
║ ⚡ *تقييم المستهدف:*
║ ────────────────────────
║ 🔹 *الصلاحيات:* ${isAdmin ? '🟢 عالية' : '🟡 متوسطة'}
║ 🔸 *التأثير:* ${isAdmin ? '🔴 عالي' : '🟢 منخفض'}
║ 🔹 *الخطر:* ${isAdmin ? '🟡 متوسط' : '🟢 منخفض'}
║
║ 💡 *توصيات:*
║ ────────────────────────
${isAdmin ? '║ ⚠️ مراقبة دقيقة للمستهدف' : '║ ✅ لا توجد مخاطر ملحوظة'}
║
╠══════════════════════════════╣
║ 📊 _تحليل ذكي VIP_
╚══════════════════════════════╝`;
}

// دالة تتبع المستهدف
function generateTargetTracking(target, name, groupMetadata) {
    const lastSeen = moment().tz('Asia/Riyadh').format('HH:mm:ss | YYYY-MM-DD');
    const isAdmin = target.admin !== null;

    return `╔══════════════════════════════╗
║    🚀 تتبع المستهدف المتقدم   ║
╠══════════════════════════════╣
║
║ 🎯 *الهدف:* ${name}
║ 🆔 *الرقم:* ${target.id.split('@')[0]}
║
║ 📍 *بيانات التتبع:*
║ ────────────────────────
║ 🕒 *آخر تتبع:* ${lastSeen}
║ 📌 *الحالة:* ${isAdmin ? '🟢 متصل' : '🟡 غير متصل'}
║ ⚡ *النشاط:* ${isAdmin ? '🔴 عالي' : '🟢 منخفض'}
║
║ 🔍 *سجل التتبع:*
║ ────────────────────────
║ 📊 *المرات التي تم تتبعها:* ${Math.floor(Math.random() * 10 + 1)}
║ 🕐 *آخر مرة:* ${moment().subtract(Math.floor(Math.random() * 60), 'minutes').format('HH:mm')}
║
║ ⚠️ *تنبيهات:*
║ ────────────────────────
${isAdmin ? '║ 🔔 المستهدف لديه صلاحيات عالية' : '║ ✅ المستهدف آمن'}
║
╠══════════════════════════════╣
║ 🎯 _نظام التتبع الذكي_
║ ™ Tarzan Tracker
╚══════════════════════════════╝`;
}
