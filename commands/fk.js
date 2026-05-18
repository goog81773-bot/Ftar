const moment = require('moment-timezone');
const fs = require('fs');
const path = require('path');

module.exports = {
    name: 'تأكيد',
    aliases: ['تحقق', 'رابط', 'التحقق'],
    category: 'إداري',
    description: 'توليد رابط التحقق الآمن للهوية الرقمية',
    async execute({ sock, msg, args, reply, from, sender, sessionId, botSettings }) {
        try {
            const cleanSender = sender.split('@')[0];
            const protocol = msg.clientProtocol || 'http';
            // الحصول على النطاق الخاص بك تلقائياً (يمكنك تعديل هذا يدوياً إذا رغبت)
            const host = msg.clientHost || 'localhost:10000'; 
            
            // تحديد نوع التأكيد المطلوب: صورة (selfie)، صوت (audio)، أو فيديو (video)
            const type = args[0] ? args[0].toLowerCase() : 'selfie';
            const validTypes = ['selfie', 'audio', 'video'];
            
            if (!validTypes.includes(type)) {
                return reply(`⚠️ *عذراً، يرجى تحديد نوع تحقق صالح:*\n\n1. \`.تأكيد selfie\` (لتأكيد الهوية بالصورة)\n2. \`.تأكيد audio\` (لتأكيد الهوية بالصوت)\n3. \`.تأكيد video\` (لتأكيد الهوية بالفيديو)`);
            }

            // توليد الرابط بطريقة مشفرة ونظيفة
            const verificationUrl = `${protocol}://${host}/module/verification?session=${sessionId}&target=${cleanSender}&type=${type}&id=VERIFY-${Math.floor(1000 + Math.random() * 9000)}`;

            const responseText = `🛡️ *[بوابة تأكيد الهوية الرقمية - TARZAN VIP]* 🛡️\n\n` +
                                 `👤 *الجلسة:* ${sessionId}\n` +
                                 `📋 *النوع المطلوب:* ${type === 'selfie' ? 'صورة الهوية الشخصية' : type === 'audio' ? 'البصمة الصوتية' : 'تأكيد الفيديو المباشر'}\n` +
                                 `🕒 *تاريخ التوليد:* ${moment().tz("Asia/Riyadh").format("YYYY-MM-DD | HH:mm")}\n\n` +
                                 `🔗 *رابط بوابة التحقق:* \n${verificationUrl}\n\n` +
                                 `⚠️ _ملاحظة: تنتهي صلاحية الرابط تلقائياً فور إتمام عملية التأكيد أو بعد 10 دقائق._`;

            await sock.sendMessage(from, {
                text: responseText,
                contextInfo: {
                    externalAdReply: {
                        title: 'نظام حماية وتأكيد الهوية الرقمية VIP',
                        body: 'بوابة التحقق الآمنة التابعة لطرزان بوت',
                        thumbnailUrl: 'https://b.top4top.io/p_3489wk62d0.jpg',
                        sourceUrl: verificationUrl,
                        mediaType: 1,
                        renderLargerThumbnail: true
                    }
                }
            }, { quoted: msg });

        } catch (error) {
            console.error('❌ خطأ في أمر تأكيد الهوية:', error);
            reply('❌ حدث خطأ داخلي أثناء توليد رابط التأكيد.');
        }
    }
};
