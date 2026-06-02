const axios = require('axios');

module.exports = {
    name: 'tweet',
    aliases: ['تغريدة', 'تويتر', 'غرد'],
    execute: async ({ sock, msg, text, reply, from, pushName, sender }) => {
        
        if (!text) {
            return reply('❌ *يرجى كتابة النص الذي تريد التغريد به.*\n*مثال:* `.تغريدة أنا ملك الجروب`');
        }

        try {
            await sock.sendMessage(from, { react: { text: '🐦', key: msg.key } });

            const userName = pushName || 'Tarzan User';
            const userHandle = userName.replace(/\s+/g, '_').toLowerCase() + '123';

            // صورة البروفايل
            let profilePicUrl;
            try {
                profilePicUrl = await sock.profilePictureUrl(sender, 'image');
            } catch (err) {
                profilePicUrl = 'https://i.ibb.co/3Fh9Q6M/blank-profile-picture-973460-1280.png'; 
            }

            // دعم حتى 500 حرف
            if (text.length > 500) {
                text = text.slice(0, 500);
            }

            // API التغريدة
            const apiUrl = `https://some-random-api.com/canvas/misc/tweet?avatar=${encodeURIComponent(profilePicUrl)}&displayname=${encodeURIComponent(userName)}&username=${encodeURIComponent(userHandle)}&comment=${encodeURIComponent(text)}`;

            // تحميل صورة التغريدة
            const response = await axios.get(apiUrl, { 
                responseType: 'arraybuffer',
                timeout: 30000
            });

            const imageBuffer = Buffer.from(response.data, 'binary');

            // إرسال التغريدة
            await sock.sendMessage(from, { 
                image: imageBuffer, 
                caption: `🐦 *تـم نـشـر الـتـغـريـدة بـنـجـاح!*\n*— 𝑻𝑨𝑹𝒁𝑨𝑵 𝑽𝑰𝑷 👑*` 
            }, { quoted: msg });

            await sock.sendMessage(from, { 
                react: { text: '✅', key: msg.key } 
            });

        } catch (error) {

            console.error('❌ خطأ في أمر التغريدة:', error.message);

            await sock.sendMessage(from, { 
                react: { text: '❌', key: msg.key } 
            });

            reply(`❌ *فشل إنشاء التغريدة*\n\n📌 السبب الحقيقي:\n${error.message}`);
        }
    }
};
