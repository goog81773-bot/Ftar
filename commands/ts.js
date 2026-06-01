const { downloadMediaMessage } = require('@whiskeysockets/baileys');
const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');
const pino = require('pino');

// 🧠 [ذاكرة البوت المؤقتة]: تخزن الآن نوع الصفحة (صورة أو نص) مع المحتوى
const pdfSessions = new Map();

module.exports = {
    name: 'كتاب', 
    aliases: ['ضف', 'الغاء_الكتاب'], 
    execute: async ({ sock, msg, reply, commandName, text, from, sender }) => {
        
        // ==========================================
        // 1️⃣ أمر إضافة (صورة أو نص) لمسودة الكتاب
        // ==========================================
        if (commandName === 'ضف') {
            const isQuotedImage = msg.message.extendedTextMessage?.contextInfo?.quotedMessage?.imageMessage;
            
            // جلب النص المردود عليه، أو النص المكتوب مباشرة بعد أمر .ضف
            const quotedText = msg.message.extendedTextMessage?.contextInfo?.quotedMessage?.conversation || 
                               msg.message.extendedTextMessage?.contextInfo?.quotedMessage?.extendedTextMessage?.text;
            const textToAdd = text || quotedText;

            if (!isQuotedImage && !textToAdd) {
                return reply('📑 *يرجى الرد على (صورة) أو (نص)، أو كتابة نص بعد كلمة .ضف لإضافته للكتاب.*');
            }

            try {
                // جلب مسودة المستخدم الحالية أو إنشاء واحدة جديدة
                let userPages = pdfSessions.get(sender) || [];
                
                // حماية الرام: حد أقصى 50 صفحة للكتاب الواحد
                if (userPages.length >= 50) {
                    return reply('⚠️ *عذراً، الحد الأقصى للكتاب الواحد هو 50 صفحة لتجنب الضغط على السيرفر.*');
                }

                if (isQuotedImage) {
                    // معالجة إضافة الصورة
                    const mediaMsg = { message: msg.message.extendedTextMessage.contextInfo.quotedMessage };
                    const buffer = await downloadMediaMessage(mediaMsg, 'buffer', {}, { logger: pino({ level: 'silent' }) });
                    
                    userPages.push({ type: 'image', content: buffer });
                    await reply(`🖼️ *تمت إضافة صفحة (صورة) لمسودتك.*\n📊 *إجمالي الصفحات:* ${userPages.length}`);

                } else if (textToAdd) {
                    // معالجة إضافة النص
                    userPages.push({ type: 'text', content: textToAdd });
                    await reply(`📝 *تمت إضافة صفحة (نصية) لمسودتك.*\n📊 *إجمالي الصفحات:* ${userPages.length}`);
                }
                
                pdfSessions.set(sender, userPages);
                
            } catch (error) {
                console.error(error);
                reply('❌ *فشل إضافة المحتوى، حاول مرة أخرى.*');
            }
            return;
        }

        // ==========================================
        // 2️⃣ أمر إلغاء وتفريغ المسودة
        // ==========================================
        if (commandName === 'الغاء_الكتاب') {
            if (pdfSessions.has(sender)) {
                pdfSessions.delete(sender);
                return reply('🗑️ *تم إتلاف المسودة وحذف جميع الصفحات بنجاح.*');
            } else {
                return reply('⚠️ *ليس لديك أي مسودة نشطة حالياً.*');
            }
        }

        // ==========================================
        // 3️⃣ أمر إصدار وتجميع الـ PDF (التنسيق الفخم)
        // ==========================================
        if (commandName === 'كتاب') {
            const userPages = pdfSessions.get(sender);
            
            if (!userPages || userPages.length === 0) {
                return reply('⚠️ *مسودتك فارغة!*\nأضف نصوصاً أو صوراً عبر أمر \`.ضف\` أولاً.');
            }
            
            await sock.sendMessage(from, { react: { text: '🖨️', key: msg.key } });
            await reply('⏳ *جاري تنسيق الصفحات وتجليد الكتاب بطابع VIP...*');
            
            try {
                const bookName = text ? text : `Document_${Date.now()}`;
                const fileName = `${bookName}.pdf`;
                const filePath = path.join(__dirname, fileName);
                
                // إنشاء مستند PDF
                const doc = new PDFDocument({ autoFirstPage: false });
                const writeStream = fs.createWriteStream(filePath);
                doc.pipe(writeStream);
                
                // تصميم الصفحات بناءً على نوعها (صورة أو نص)
                for (let i = 0; i < userPages.length; i++) {
                    const page = userPages[i];
                    doc.addPage();

                    if (page.type === 'image') {
                        // 🖼️ تنسيق صفحة الصورة (توسيط كامل)
                        doc.image(page.content, 20, 20, { 
                            fit: [doc.page.width - 40, doc.page.height - 40],
                            align: 'center',
                            valign: 'center'
                        });
                    } 
                    else if (page.type === 'text') {
                        // 📝 تنسيق صفحة النص (إطار فخم وتنسيق أكاديمي)
                        
                        // 1. رسم إطار ذهبي فخم حول الصفحة
                        doc.lineWidth(2);
                        doc.rect(30, 30, doc.page.width - 60, doc.page.height - 60).stroke('#C5A059'); 
                        
                        // 2. إطار داخلي رفيع لمزيد من الفخامة
                        doc.lineWidth(0.5);
                        doc.rect(35, 35, doc.page.width - 70, doc.page.height - 70).stroke('#C5A059');

                        // 3. كتابة رقم الصفحة في الأعلى
                        doc.fontSize(10).fillColor('#888888').text(`الصفحة ${i + 1}`, 0, 45, { align: 'center' });
                        
                        // 4. كتابة النص بهوامش مريحة للعين ومحاذاة لليمين
                        // ملاحظة: لدعم اللغة العربية بشكل مثالي، يستحسن وضع ملف خط (مثل arial.ttf) في السيرفر
                        doc.fontSize(14).fillColor('#222222').text(page.content, 50, 80, {
                            align: 'right',
                            width: doc.page.width - 100,
                            lineGap: 8,
                            features: ['rtla'] // تفعيل خواص الكتابة من اليمين لليسار
                        });

                        // 5. تذييل الصفحة (حقوق البوت)
                        doc.fontSize(10).fillColor('#CCCCCC').text('صُنع بواسطة 𝑻𝑨𝑹𝒁𝑨𝑵 𝑽𝑰𝑷', 0, doc.page.height - 55, { align: 'center' });
                    }
                }
                
                doc.end();
                
                // بعد الانتهاء من صناعة الملف، نقوم بإرساله
                writeStream.on('finish', async () => {
                    await sock.sendMessage(from, { 
                        document: fs.readFileSync(filePath), 
                        mimetype: 'application/pdf', 
                        fileName: fileName,
                        caption: `📚 *تم إصدار الكتاب بنجاح!*\n\n📑 *العنوان:* ${bookName}\n📊 *عدد الصفحات:* ${userPages.length}\n✨ *النوع:* (نصوص + صور مصقولة)\n\n*— 𝑻𝑨𝑹𝒁𝑨𝑵 𝑽𝑰𝑷 ⚔️*`
                    }, { quoted: msg });
                    
                    // تنظيف السيرفر
                    fs.unlinkSync(filePath);
                    pdfSessions.delete(sender);
                });
                
            } catch (err) {
                console.error('خطأ في صانع PDF:', err);
                reply('❌ *حدث خطأ أثناء معالجة المستند وتنسيق الصفحات.*');
            }
        }
    }
};
