const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const { downloadMediaMessage } = require('@whiskeysockets/baileys');

module.exports = {
    name: 'صوت',
    aliases: ['مقطع', 'toaudio', 'mp3'],
    execute: async ({ sock, msg, reply, from }) => {
        // 1. التقاط الفيديو سواء كان مرسلاً مباشرة أو تم الرد عليه
        const quotedMsg = msg.message.extendedTextMessage?.contextInfo?.quotedMessage;
        const videoMessage = quotedMsg?.videoMessage || msg.message.videoMessage;

        if (!videoMessage) {
            return reply('⚠️ *عذراً يا فخم، يرجى الرد على فيديو لتحويله إلى مقطع صوتي.*');
        }

        // 2. إرسال حالة التفاعل (جاري الكتابة/التسجيل)
        await sock.sendPresenceUpdate('recording', from);
        reply('⏳ *جاري سحب الصوت باحترافية...*');

        try {
            // 3. تحميل الفيديو إلى الذاكرة
            const messageToDownload = quotedMsg ? { message: quotedMsg } : msg;
            const buffer = await downloadMediaMessage(messageToDownload, 'buffer', {}, { logger: console });

            // 4. إنشاء مجلد مؤقت آمن إذا لم يكن موجوداً
            const tempDir = path.join(__dirname, '../temp_media');
            if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });

            const inputPath = path.join(tempDir, `vid_${Date.now()}.mp4`);
            const outputPath = path.join(tempDir, `aud_${Date.now()}.mp3`);

            // حفظ الفيديو مؤقتاً
            fs.writeFileSync(inputPath, buffer);

            // 5. محاولة التحويل العميق باستخدام FFmpeg
            exec(`ffmpeg -i "${inputPath}" -vn -acodec libmp3lame -q:a 2 "${outputPath}"`, async (error) => {
                if (error) {
                    console.log('⚠️ [ملاحظة سيرفر]: FFmpeg غير مثبت، جاري استخدام المعالج البديل (VIP Fallback).');
                    
                    // المعالج البديل الجبار: إجبار واتساب على قراءة الفيديو كملف صوتي!
                    await sock.sendMessage(from, {
                        audio: buffer,
                        mimetype: 'audio/mp4',
                        ptt: false // ضعها true إذا أردته أن يظهر كـ "بصمة صوتية" (Voice Note)
                    }, { quoted: msg });

                } else {
                    // النجاح في التحويل الأصلي
                    const audioBuffer = fs.readFileSync(outputPath);
                    await sock.sendMessage(from, {
                        audio: audioBuffer,
                        mimetype: 'audio/mpeg'
                    }, { quoted: msg });
                }

                // 6. التنظيف الذكي (تدمير الملفات المؤقتة لمنع امتلاء السيرفر)
                if (fs.existsSync(inputPath)) fs.unlinkSync(inputPath);
                if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
            });

        } catch (error) {
            console.error('❌ خطأ في أمر الصوت:', error);
            reply('❌ *حدث خطأ غير متوقع أثناء معالجة الميديا.*');
        }
    }
};
