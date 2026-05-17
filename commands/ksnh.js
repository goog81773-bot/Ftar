module.exports = {
    name: 'معلومات_قناة',
    aliases: ['قناة', 'فحص_قناة', 'channelinfo'],
    category: 'قنوات',
    description: 'يَجْلِبُ مَعْلُومَاتِ وَإِحْصَائِيَّاتِ أَيِّ قَنَاةِ وَاتْسَاب عَبْرَ الرَّابِط.',
    execute: async ({ reply, sock, text }) => {
        // التحقق من وجود الرابط
        if (!text || !text.includes('whatsapp.com/channel/')) {
            return reply(`⚠️ ╟ *يُرْجَى إِرْفَاقُ رَابِطِ القَنَاة.*\n📌 ╟ مِثَال: *.قناة https://whatsapp.com/channel/0029Va...*`);
        }

        try {
            await reply('🔍 ╟ *جَارِي فَحْصُ سِجِلَّاتِ القَنَاةِ السِّرِّيَّة...*');

            // استخراج كود الدعوة من الرابط
            const inviteCode = text.split('whatsapp.com/channel/')[1].split(' ')[0].trim();

            // استخدام دالة Baileys لجلب معلومات النشرة (القناة)
            const channelData = await sock.newsletterMetadata('invite', inviteCode);

            // استخراج البيانات المهمة
            const name = channelData.name || 'غَيْرُ مَعْرُوف';
            const subs = channelData.subscribers || 'مَخْفِي';
            const state = channelData.state === 'ACTIVE' ? 'نَشِطَة 🟢' : 'مُقَيَّدَة 🔴';
            const creation = new Date(channelData.creation_time * 1000).toLocaleDateString('ar-SA');
            const description = channelData.description || 'لَا يُوجَدُ وَصْف.';

            const msg = `❖ ════ 📢 ﴿ هَوِيَّةُ القَنَاة ﴾ 📢 ════ ❖\n\n` +
                        `📛 ╟ *الِاسْم:* ${name}\n` +
                        `👥 ╟ *المُتَابِعُون:* ${subs.toLocaleString()} مُتَابِع\n` +
                        `📊 ╟ *الحَالَة:* ${state}\n` +
                        `📅 ╟ *تَارِيخُ التَّأْسِيس:* ${creation}\n` +
                        `🆔 ╟ *المُعَرِّف (JID):* \n\`${channelData.id}\`\n\n` +
                        `📝 ╟ *الوَصْف:*\n${description}\n\n` +
                        `❖ ════════════════════════ ❖`;

            // إرسال صورة القناة إذا كانت متوفرة
            if (channelData.picture) {
                const picUrl = `https://pps.whatsapp.net/v/t61.24694-24/${channelData.picture}`;
                await sock.sendMessage(msg.key.remoteJid, { image: { url: picUrl }, caption: msg });
            } else {
                await reply(msg);
            }

        } catch (e) {
            console.error(e);
            reply(`❌ ╟ *فَشِلَ فَحْصُ القَنَاة. قَدْ يَكُونُ الرَّابِطُ خَاطِئاً أَوْ القَنَاةُ خَاصَّة.*`);
        }
    }
};
