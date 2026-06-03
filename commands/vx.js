module.exports = {
    name: 'مزيف',
    aliases: ['كذب', 'fake'],
    category: 'تسلية وتفاعل',
    description: 'يصنع اقتباساً مزيفاً صامتاً تماماً لأي رقم مع النص الذي تحدده، حصرياً في الدردشة الخاصة.',
    
    execute: async ({ sock, msg, args, reply, from }) => {
        try {
            // 1. [الفلتر الأمني] - التحقق من أن الأمر يتم تشغيله في الخاص وليس في المجموعات
            const isGroup = from.endsWith('@g.us');
            if (isGroup) {
                return reply('⚠️ ╟ *عُذْراً يا فخم، هَذَا الأَمْرُ مُتَاحٌ فَقَطْ فِي المُحَادَثَاتِ الخَاصَّةِ (عَلَى الخَاص) لِحِمَايَةِ الخُصُوصِيَّةِ وَمَنْعِ المَشَاكِل.*');
            }

            const input = args.join(' ').trim();

            if (!input) {
                return reply(
                    `⚠️ *طريقة الاستخدام على الخاص:*\n` +
                    `» \`.مزيف [الرقم] [النص الوهمي]\`\n\n` +
                    `💡 *مثال:* \`.مزيف 966500000000 هلا عبود كيف حالك\``
                );
            }

            // تقسيم المدخلات لاستخراج الرقم والنص الوهمي عبر أول مسافة
            const firstSpaceIndex = input.indexOf(' ');
            if (firstSpaceIndex === -1) {
                return reply('⚠️ *يُرجى كتابة النص الوهمي بعد الرقم!*');
            }

            const rawNumber = input.substring(0, firstSpaceIndex).trim();
            const fakeText = input.substring(firstSpaceIndex + 1).trim();

            // تنظيف رقم الهاتف ليتوافق مع نظام واتساب
            const cleanNumber = rawNumber.replace(/\D/g, '');
            if (cleanNumber.length < 8) {
                return reply('❌ *تأكد من كتابة الرقم بشكل صحيح مع رمز الدولة (مثال: 966500000000).*');
            }

            const targetJid = `${cleanNumber}@s.whatsapp.net`;

            // تفاعل صامت وسريع يوضح استلام الأمر وبدء التزييف
            await sock.sendMessage(from, { react: { text: '🤫', key: msg.key } });

            // 2. [بناء كائن الرسالة الوهمية]
            // يتوافق بالكامل مع بروتوكول واتساب ليظهر كرسالة أصلية واردة من الضحية في الخاص
            const fakeMessageObj = {
                key: {
                    remoteJid: from,
                    fromMe: false, // لتبدو قادمة من الطرف الآخر وليست منك
                    id: 'FAKE' + Math.random().toString(36).substring(2, 10).toUpperCase(), // معرف وهمي فريد
                    participant: targetJid // JID الخاص بصاحب الرقم المستهدف
                },
                message: {
                    conversation: fakeText // النص الوهمي الذي يظهر داخل فقاعة الضحية
                }
            };

            // 3. [إرسال الرسالة الصامتة تماماً]
            // نستخدم الحرف المخفي '\u200E' ليكون الرد غير مرئي، فيظهر الاقتباس فقط على الشاشة
            await sock.sendMessage(from, { 
                text: '\u200E' 
            }, { 
                quoted: fakeMessageObj 
            });

        } catch (error) {
            console.error('❌ خطأ في أمر صنع الرسالة المزيفة الصامتة في الخاص:', error);
            reply('❌ *حدث خطأ فني أثناء تزييف الرسالة.*');
        }
    }
};
