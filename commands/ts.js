const { downloadMediaMessage } = require('@whiskeysockets/baileys');
const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');
const pino = require('pino');

// 🧠 [ذاكرة البوت المؤقتة]: لحفظ صور كل شخص بشكل منفصل حتى لا تتداخل صور الأعضاء
const pdfSessions = new Map();

module.exports = {
    name: 'كتاب', // الأمر النهائي لإصدار الكتاب
    aliases: ['ضف', 'الغاء_الكتاب'], // أوامر فرعية مرتبطة بنفس الملف
    execute: async ({ sock, msg, reply, commandName, text, from, sender }) => {
        
        // 1️⃣ أمر إضافة صورة لمسودة الكتاب
        if (commandName === 'ضف') {
            const isQuotedImage = msg.message.extendedTextMessage?.contextInfo?.quotedMessage?.imageMessage;
            
            if (!isQuotedImage) {
                return reply('🖼️ *يرجى الرد على الصورة التي تريد إضافتها بكلمة (.ضف)*');
            }

            try {
                // تحميل الصورة بجودة عالية
                const mediaMsg = { message: msg.message.extendedTextMessage.contextInfo.quotedMessage };
                const buffer = await downloadMediaMessage(mediaMsg, 'buffer', {}, { logger: pino({ level: 'silent' }) });
                
                // جلب مسودة المستخدم الحالية أو إنشاء واحدة جديدة
                let userImages = pdfSessions.get(sender) || [];
                
                // حماية الرام: حد أقصى 50 صفحة للكتاب الواحد
                if (userImages.length >= 50) {
                    return reply('⚠️ *عذراً، الحد الأقصى للكتاب الواحد هو 50 صورة لتجنب الضغط على السيرفر.*');
                }
                
                userImages.push(buffer);
                pdfSessions.set(sender, userImages);
                
                await reply(`✅ *تم الحفظ في مسودتك!*\n📊 *عدد صفحات الكتاب حتى الآن:* ${userImages.length}\n\n📌 لإضافة المزيد، رد على صورة أخرى بـ \`.ضف\`\n🖨️ لطباعة وإصدار الكتاب، أرسل: \`.كتاب [اسم الكتاب الذي تريده]\``);
            } catch (error) {
                console.error(error);
                reply('❌ *فشل تحميل الصورة، حاول مرة أخرى.*');
            }
            return;
        }

        // 2️⃣ أمر إلغاء وتفريغ المسودة
        if (commandName === 'الغاء_الكتاب') {
            if (pdfSessions.has(sender)) {
                pdfSessions.delete(sender);
                return reply('🗑️ *تم حذف جميع الصور من مسودتك بنجاح.*');
            } else {
                return reply('⚠️ *ليس لديك أي مسودة نشطة حالياً.*');
            }
        }

        // 3️⃣ أمر إصدار وتجميع الـ PDF
        if (commandName === 'كتاب') {
            const userImages = pdfSessions.get(sender);
            
            if (!userImages || userImages.length === 0) {
                return reply('⚠️ *مسودتك فارغة!*\nيجب عليك إضافة الصور أولاً عن طريق الرد عليها بـ \`.ضف\`');
            }
            
            await sock.sendMessage(from, { react: { text: '🖨️', key: msg.key } });
            await reply('⏳ *جاري معالجة الصور وتجليد الكتاب (PDF)...*');
            
            try {
                // تحديد اسم الكتاب (إذا لم يكتب المستخدم اسماً، نعطيه اسماً تلقائياً)
                const bookName = text ? text : `Document_${Date.now()}`;
                const fileName = `${bookName}.pdf`;
                const filePath = path.join(__dirname, fileName);
                
                // إنشاء مستند PDF
                const doc = new PDFDocument({ autoFirstPage: false });
                const writeStream = fs.createWriteStream(filePath);
                doc.pipe(writeStream);
                
                // إضافة الصور كصفحات
                for (const imgBuffer of userImages) {
                    doc.addPage();
                    // ضبط أبعاد الصورة لتتناسب مع مقاس صفحة الـ PDF القياسية (A4) مع هوامش
                    doc.image(imgBuffer, 20, 20, { 
                        fit: [doc.page.width - 40, doc.page.height - 40],
                        align: 'center',
                        valign: 'center'
                    });
                }
                
                doc.end();
                
                // بعد الانتهاء من صناعة الملف، نقوم بإرساله
                writeStream.on('finish', async () => {
                    await sock.sendMessage(from, { 
                        document: fs.readFileSync(filePath), 
                        mimetype: 'application/pdf', 
                        fileName: fileName,
                        caption: `📚 *تم الانتهاء من صنع الكتاب بنجاح!*\n\n📑 *اسم الكتاب:* ${bookName}\n📊 *عدد الصفحات:* ${userImages.length}\n\n*— 𝑻𝑨𝑹𝒁𝑨𝑵 𝑽𝑰𝑷 ⚔️*`
                    }, { quoted: msg });
                    
                    // تنظيف السيرفر من الملفات المؤقتة
                    fs.unlinkSync(filePath);
                    pdfSessions.delete(sender);
                });
                
            } catch (err) {
                console.error('خطأ في صانع PDF:', err);
                reply('❌ *حدث خطأ أثناء معالجة المستند.*');
            }
        }
    }
};
