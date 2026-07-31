const moment = require('moment-timezone');
const { jidNormalizedUser } = require('@whiskeysockets/baileys');

module.exports = {
    name: 'معلومات_قناة',
    aliases: ['قناة', 'فحص_قناة', 'channelinfo', 'channel'],
    category: 'قنوات',
    description: '📢 جلب معلومات وإحصائيات أي قناة واتساب عبر الرابط',
    
    async execute({ sock, msg, args, text, reply, from, sender, pushName, isFromMe, prefix, commandName }) {
        
        try {
            // التحقق من وجود الرابط
            if (!text || !text.includes('whatsapp.com/channel/')) {
                return reply(`⚠️ *يُرْجَى إِرْفَاقُ رَابِطِ القَنَاة.*\n\n📌 *مِثَال:*\n${prefix}قناة https://whatsapp.com/channel/0029VaXXXXX`);
            }

            // إرسال رد تفاعلي
            await sock.sendMessage(from, { 
                react: { text: '📢', key: msg.key } 
            });

            await reply('🔍 *جَارِي فَحْصُ سِجِلَّاتِ القَنَاةِ السِّرِّيَّة...*\n⏳ يرجى الانتظار قليلاً.');

            // استخراج كود الدعوة من الرابط
            let inviteCode = text.split('whatsapp.com/channel/')[1]?.split(' ')[0]?.trim() || '';
            
            // تنظيف الكود من أي رموز إضافية
            inviteCode = inviteCode.replace(/[^a-zA-Z0-9]/g, '');

            if (!inviteCode || inviteCode.length < 5) {
                return reply(`❌ *رابط القناة غير صحيح!*\n\n📌 تأكد من الرابط وحاول مرة أخرى.`);
            }

            // استخدام دالة Baileys لجلب معلومات النشرة (القناة)
            const channelData = await sock.newsletterMetadata('invite', inviteCode);

            if (!channelData) {
                return reply(`❌ *فشل جلب معلومات القناة!*\n\n📌 قد يكون الرابط خاطئاً أو القناة خاصة.`);
            }

            // استخراج البيانات المهمة مع معالجة القيم المفقودة
            const name = channelData.name || 'غَيْرُ مَعْرُوف';
            const subs = channelData.subscribers || 0;
            const state = channelData.state === 'ACTIVE' ? '🟢 نَشِطَة' : '🔴 مُقَيَّدَة';
            const creationTime = channelData.creation_time ? new Date(channelData.creation_time * 1000) : new Date();
            const creation = moment(creationTime).tz('Asia/Riyadh').format('YYYY-MM-DD | HH:mm:ss');
            const description = channelData.description || 'لَا يُوجَدُ وَصْف.';
            const channelId = channelData.id || 'غير معروف';
            const inviteLink = channelData.invite || `https://whatsapp.com/channel/${inviteCode}`;

            // حساب عدد الأيام منذ الإنشاء
            const daysOld = Math.floor((Date.now() - creationTime.getTime()) / (1000 * 60 * 60 * 24));

            // تنسيق الأعداد
            const formattedSubs = subs >= 1000 ? `${(subs / 1000).toFixed(1)} ألف` : subs.toString();

            // بناء التقرير
            const msg = `❖ ════ 📢 ﴿ هَوِيَّةُ القَنَاة ﴾ 📢 ════ ❖\n\n` +
                        `📛 *الِاسْم:* ${name}\n` +
                        `👥 *المُتَابِعُون:* ${formattedSubs} مُتَابِع\n` +
                        `📊 *الحَالَة:* ${state}\n` +
                        `📅 *تَارِيخُ التَّأْسِيس:* ${creation}\n` +
                        `📆 *العُمْر:* ${daysOld} يَوْم${daysOld > 1 ? 'اً' : ''}\n` +
                        `🆔 *المُعَرِّف (JID):* \n\`${channelId}\`\n` +
                        `🔗 *رابط الدعوة:*\n${inviteLink}\n\n` +
                        `📝 *الوَصْف:*\n${description}\n\n` +
                        `❖ ════════════════════════ ❖\n` +
                        `📢 *— TARZAN CHANNEL INFO 🚀*`;

            // إرسال صورة القناة إذا كانت متوفرة
            if (channelData.picture) {
                try {
                    const picUrl = `https://pps.whatsapp.net/v/t61.24694-24/${channelData.picture}`;
                    await sock.sendMessage(from, { 
                        image: { url: picUrl }, 
                        caption: msg,
                        contextInfo: {
                            mentionedJid: [sender]
                        }
                    }, { quoted: msg });
                } catch (e) {
                    // إذا فشل تحميل الصورة، أرسل النص فقط
                    await reply(msg);
                }
            } else {
                await reply(msg);
            }

            // إرسال نسخة للخاص
            const selfId = jidNormalizedUser(sock.user.id);
            await sock.sendMessage(selfId, {
                text: `📢 *تقرير القناة*\n\n${msg}\n\n🕒 ${moment().tz('Asia/Riyadh').format('HH:mm:ss | YYYY-MM-DD')}`
            });

        } catch (error) {
            console.error('❌ خطأ في فحص القناة:', error);
            
            // معالجة أنواع مختلفة من الأخطاء
            let errorMsg = '❌ *فشل فحص القناة.*';
            
            if (error.message?.includes('timeout')) {
                errorMsg = '⏰ *انتهى وقت الاتصال!* السيرفر مزدحم، حاول مرة أخرى.';
            } else if (error.message?.includes('404')) {
                errorMsg = '🔍 *القناة غير موجودة!* تأكد من الرابط.';
            } else if (error.message?.includes('private')) {
                errorMsg = '🔒 *القناة خاصة!* لا يمكن الوصول للمعلومات.';
            } else {
                errorMsg = `❌ *فشل فحص القناة.*\n📌 قد يكون الرابط خاطئاً أو القناة غير موجودة.`;
            }
            
            await reply(errorMsg);
        }
    }
};
