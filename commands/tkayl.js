const axios = require('axios');
const fs = require('fs');

module.exports = {
    name: 'tweet',
    aliases: ['تغريدة', 'تويتر', 'غرد'],
    
    execute: async ({ sock, msg, text, reply, from, pushName, sender }) => {

        try {

            //━━━━━━━━━━━━━━━
            // التحقق من النص
            //━━━━━━━━━━━━━━━
            if (!text && !msg.message?.imageMessage && !msg.message?.extendedTextMessage?.contextInfo?.quotedMessage?.imageMessage) {
                return reply(`❌ *اكتب نص التغريدة أو أرسل صورة مع الأمر.*\n\n📌 مثال:\n*.تغريدة أنا الملك*\nأو\nرد على صورة واكتب:\n*.تغريدة أقوى تغريدة 🔥*`);
            }

            //━━━━━━━━━━━━━━━
            // تحديد النص
            //━━━━━━━━━━━━━━━
            let tweetText = text || '';

            // قص النص إذا تجاوز 500 حرف
            if (tweetText.length > 500) {
                tweetText = tweetText.slice(0, 500);
            }

            //━━━━━━━━━━━━━━━
            // رياكشن البداية
            //━━━━━━━━━━━━━━━
            await sock.sendMessage(from, {
                react: {
                    text: '🐦',
                    key: msg.key
                }
            });

            //━━━━━━━━━━━━━━━
            // معلومات المستخدم
            //━━━━━━━━━━━━━━━
            const displayName = pushName || 'Tarzan User';

            const username = displayName
                .replace(/[^a-zA-Z0-9]/g, '')
                .toLowerCase()
                .slice(0, 12) + Math.floor(Math.random() * 999);

            //━━━━━━━━━━━━━━━
            // صورة البروفايل
            //━━━━━━━━━━━━━━━
            let profilePic;

            try {
                profilePic = await sock.profilePictureUrl(sender, 'image');
            } catch {
                profilePic = 'https://i.ibb.co/3Fh9Q6M/blank-profile-picture-973460-1280.png';
            }

            //━━━━━━━━━━━━━━━
            // استخراج الصورة إذا موجودة
            //━━━━━━━━━━━━━━━
            let imageBuffer = null;

            const quoted = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;

            // إذا الصورة مرسلة مباشرة
            if (msg.message?.imageMessage) {

                const stream = await sock.downloadMediaMessage(
                    msg,
                    'buffer',
                    {},
                    {
                        logger: console,
                        reuploadRequest: sock.updateMediaMessage
                    }
                );

                imageBuffer = stream;
            }

            // إذا المستخدم رد على صورة
            else if (quoted?.imageMessage) {

                const quotedMsg = {
                    key: msg.message.extendedTextMessage.contextInfo.stanzaId,
                    message: quoted
                };

                const stream = await sock.downloadMediaMessage(
                    quotedMsg,
                    'buffer',
                    {},
                    {
                        logger: console,
                        reuploadRequest: sock.updateMediaMessage
                    }
                );

                imageBuffer = stream;
            }

            //━━━━━━━━━━━━━━━
            // API التغريدة
            //━━━━━━━━━━━━━━━

            let apiUrl =
                `https://some-random-api.com/canvas/misc/tweet` +
                `?avatar=${encodeURIComponent(profilePic)}` +
                `&displayname=${encodeURIComponent(displayName)}` +
                `&username=${encodeURIComponent(username)}` +
                `&comment=${encodeURIComponent(tweetText)}`;

            //━━━━━━━━━━━━━━━
            // إنشاء التغريدة
            //━━━━━━━━━━━━━━━
            const response = await axios.get(apiUrl, {
                responseType: 'arraybuffer'
            });

            const tweetImage = Buffer.from(response.data);

            //━━━━━━━━━━━━━━━
            // إرسال النتيجة
            //━━━━━━━━━━━━━━━

            if (imageBuffer) {

                await sock.sendMessage(from, {
                    image: imageBuffer,
                    caption:
`🐦 *تـغـريـدة جـديـدة*

✍️ *${displayName}*
📎 @${username}

${tweetText || 'بدون نص'}

━━━━━━━━━━━━━━━
👑 𝑻𝑨𝑹𝒁𝑨𝑵 𝑽𝑰𝑷`,
                    mentions: [sender]
                }, {
                    quoted: msg
                });

            } else {

                await sock.sendMessage(from, {
                    image: tweetImage,
                    caption:
`🐦 *تـم إنـشـاء الـتـغـريـدة بـنـجـاح*

👤 ${displayName}
📎 @${username}

━━━━━━━━━━━━━━━
👑 𝑻𝑨𝑹𝒁𝑨𝑵 𝑽𝑰𝑷`
                }, {
                    quoted: msg
                });
            }

            //━━━━━━━━━━━━━━━
            // رياكشن النجاح
            //━━━━━━━━━━━━━━━
            await sock.sendMessage(from, {
                react: {
                    text: '✅',
                    key: msg.key
                }
            });

        } catch (err) {

            console.error('❌ Tweet Error:', err);

            await sock.sendMessage(from, {
                react: {
                    text: '❌',
                    key: msg.key
                }
            });

            reply(
`❌ *فشل إنشاء التغريدة*

📌 الأسباب المحتملة:
• النص طويل جدًا
• الصورة غير مدعومة
• API متوقف مؤقتًا

🔄 حاول مرة أخرى`
            );
        }
    }
};
