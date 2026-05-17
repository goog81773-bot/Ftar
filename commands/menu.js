const axios = require('axios');

module.exports = {
    name: 'قرآن',
    aliases: ['ايه', 'آية', 'راحه', 'quran'],
    category: 'إسلاميات',
    description: 'يرسل آية قرآنية عشوائية بصوت العفاسي مع التفسير الميسر.',
    execute: async ({ reply, sock, from, msg }) => {
        // تفاعل البوت مع الرسالة برمز الكعبة أو المسجد
        await sock.sendMessage(from, { react: { text: '🕋', key: msg.key } });
        
        try {
            await reply('⏳ ╟ *جَارِي جَلْبُ رَاحَةِ القَلْب...*');

            // عدد آيات القرآن 6236، أضفنا +1 لكي لا يظهر الرقم 0 الذي يسبب خطأ
            const randomAyahNumber = Math.floor(Math.random() * 6236) + 1;
            
            // جلب الصوت (العفاسي) والتفسير (الميسر) في نفس اللحظة لزيادة السرعة
            const [audioRes, tafsirRes] = await Promise.all([
                axios.get(`https://api.alquran.cloud/v1/ayah/${randomAyahNumber}/ar.alafasy`),
                axios.get(`https://api.alquran.cloud/v1/ayah/${randomAyahNumber}/ar.muyassar`)
            ]);

            const audioData = audioRes.data.data;
            const tafsirData = tafsirRes.data.data;

            if (!audioData || !tafsirData) throw new Error("API Error");

            // صياغة الرسالة بتنسيق ملكي ومريح للعين
            const quranText = 
                `❖ ════ 🕋 ﴿ نُورٌ عَلَى نُور ﴾ 🕋 ════ ❖\n\n` +
                `📖 ╟ *الآيَة:*\n﴿ ${audioData.text} ﴾\n\n` +
                `💡 ╟ *التَّفْسِير (المُيَسَّر):*\n${tafsirData.text}\n\n` +
                `📌 ╟ *السُّورَة:* ${audioData.surah.name} - آيَة [${audioData.numberInSurah}]\n` +
                `🎙️ ╟ *القَارِئ:* مِشَارِي بن رَاشِد العَفَاسِي\n\n` +
                `❖ ════════════════════════ ❖`;

            // إرسال النص والتفسير
            await reply(quranText);

            // إرسال المقطع الصوتي كـ (فويس نوت PTT)
            if (audioData.audio) {
                await sock.sendMessage(from, { 
                    audio: { url: audioData.audio }, 
                    mimetype: 'audio/mpeg', 
                    ptt: true 
                }, { quoted: msg });
            }

        } catch (error) {
            console.error('[Quran Error]:', error.message);
            reply('❌ ╟ *عُذْراً، حَدَثَ خَطَأٌ فِي الِاتِّصَالِ بِقَاعِدَةِ البَيَانَاتِ القُرْآنِيَّة، حَاوِلْ مُجَدَّداً.*');
        }
    }
};
