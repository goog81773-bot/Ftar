const axios = require('axios');
module.exports = {
    name: 'هوية',
    aliases: ['شخصية', 'fakeuser'],
    execute: async ({ reply }) => {
        try {
            const res = await axios.get('[https://randomuser.me/api/](https://randomuser.me/api/)');
            const u = res.data.results[0];
            const text = `👤 *[ مُوَلِّدُ الهُوِيَّاتِ الوَهْمِيَّةِ ]* 👤\n\n📛 *الاسم:* ${u.name.first} ${u.name.last}\n🌍 *الدولة:* ${u.location.country}\n📧 *الإيميل:* ${u.email}\n🎂 *العمر:* ${u.dob.age}\n📱 *الهاتف:* ${u.phone}\n\n*— بَيَانَاتٌ لِلتَّسْلِيَةِ فَقَطْ 🛡️*`;
            await reply(text);
        } catch { reply('❌ *خطأ في توليد الهوية.*'); }
    }
}
