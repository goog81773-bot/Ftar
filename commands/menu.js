const axios = require('axios');

module.exports = {
    name: 'قرآن',
    aliases: ['ايه', 'آية', 'راحه', 'quran'],
    execute: async ({ reply, sock, from, msg }) => {
        await sock.sendMessage(from, { react: { text: '🕌', key: msg.key } });
        
        try {
            // استدعاء آية عشوائية من API موثوق ومجاني
            const response = await axios.get('[https://api.alquran.cloud/v1/ayah/](https://api.alquran.cloud/v1/ayah/)' + Math.floor(Math.random() * 6236) + '/ar.alafasy');
            const data = response.data?.data;
            
            if (!data) throw new Error("API Error");

            const quranText = `🕌 *[ صَدَقَ اللهُ الْعَظِيمُ ]* 🕌\n\n` +
                              `📖 *الآية:* \n「 ${data.text} 」\n\n` +
                              `📌 *السورة:* ${data.surah.name} (آية ${data.numberInSurah})\n` +
                              `🎙️ *بصوت القارئ:* مشاري بن راشد العفاسي\n\n` +
                              `*— أرح سمعك وقلبك 🤍*`;

            // إرسال النص مع المقطع الصوتي للآية مباشرة لتجربة غامرة
            await sock.sendMessage(from, { text: quranText }, { quoted: msg });
            if (data.audio) {
                await sock.sendMessage(from, { 
                    audio: { url: data.audio }, 
                    mimetype: 'audio/mpeg', 
                    ptt: true 
                }, { quoted: msg });
            }
        } catch (e) {
            reply('❌ *حدث خطأ أثناء الاتصال بمصحف طرزان الرقمي. يرجى المحاولة لاحقاً.*');
        }
    }
};
