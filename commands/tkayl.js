const { downloadContentFromMessage } = require('@whiskeysockets/baileys');
const { createCanvas, loadImage } = require('canvas');

module.exports = {
    name: 'tweet',
    aliases: ['تغريدة', 'تويتر', 'غرد'],
    execute: async ({ sock, msg, text, reply, from, pushName, sender }) => {
        
        // 1. فحص وجود صورة (مرفقة مع الرسالة الحالية أو في الرسالة المقتبسة)
        const isImage = msg.message?.imageMessage || msg.message?.extendedTextMessage?.contextInfo?.quotedMessage?.imageMessage;
        
        // إذا لم يكن هناك نشيءولا صورة، نطلب من المستخدم إدخال شيء
        if (!text && !isImage) {
            return reply('❌ *يرجى كتابة نص أو إرفاق/اقتباس صورة للتغريد.*\n*مثال:* `.تغريدة أنا هنا` (أو قم بالرد على صورة)');
        }

        try {
            await sock.sendMessage(from, { react: { text: '🎨', key: msg.key } });

            const userName = pushName || 'Tarzan User';
            const userHandle = '@' + userName.replace(/\s+/g, '_').toLowerCase() + (Math.floor(Math.random() * 900) + 100);

            // جلب الصورة الشخصية للمستخدم
            let profilePicUrl;
            try {
                profilePicUrl = await sock.profilePictureUrl(sender, 'image');
            } catch (err) {
                // صورة افتراضية في حال لم يضع المستخدم صورة شخصية
                profilePicUrl = 'https://i.ibb.co/3Fh9Q6M/blank-profile-picture-973460-1280.png'; 
            }

            // 2. تحميل الصورة (إذا كانت مرفقة أو مقتبسة)
            let attachedImageBuffer = null;
            if (isImage) {
                // تحديد مصدر الصورة (الرسالة الحالية أو المقتبسة)
                const imageMessage = msg.message?.imageMessage 
                    ? msg.message.imageMessage 
                    : msg.message.extendedTextMessage.contextInfo.quotedMessage.imageMessage;
                
                const stream = await downloadContentFromMessage(imageMessage, 'image');
                let buffer = Buffer.from([]);
                for await(const chunk of stream) {
                    buffer = Buffer.concat([buffer, chunk]);
                }
                attachedImageBuffer = buffer;
            }

            // --- بداية إعداد الـ Canvas (اللوحة التي سنرسم عليها التغريدة) ---
            
            const width = 800;
            const padding = 40;
            let currentY = padding; // مؤشر للارتفاع الحالي أثناء الرسم
            
            // دالة وهمية لحساب الأسطر (لمعرفة الارتفاع المطلوب للكانفاس)
            const ctxTest = createCanvas(width, 100).getContext('2d');
            ctxTest.font = '32px Arial';
            
            const wrapText = (context, textToWrap, maxWidth) => {
                if (!textToWrap) return [];
                const words = textToWrap.split(' ');
                const lines = [];
                let currentLine = words[0];

                for (let i = 1; i < words.length; i++) {
                    const word = words[i];
                    const width = context.measureText(currentLine + " " + word).width;
                    if (width < maxWidth) {
                        currentLine += " " + word;
                    } else {
                        lines.push(currentLine);
                        currentLine = word;
                    }
                }
                lines.push(currentLine);
                return lines;
            };

            const textLines = wrapText(ctxTest, text, width - (padding * 2));
            const textHeight = textLines.length * 40; 

            // حساب الارتفاع الكلي المطلوب للصورة النهائية
            let totalHeight = padding + 80; // مساحة الهيدر (الصورة الشخصية والاسم)
            if (text) totalHeight += textHeight + 20; // إضافة مساحة النص
            
            let attachImgObj = null;
            if (attachedImageBuffer) {
                attachImgObj = await loadImage(attachedImageBuffer);
                // حساب أبعاد الصورة المرفقة لتناسب عرض التغريدة
                const imgRatio = attachImgObj.height / attachImgObj.width;
                const targetImgWidth = width - (padding * 2);
                const targetImgHeight = targetImgWidth * imgRatio;
                totalHeight += targetImgHeight + 30; // إضافة مساحة الصورة المرفقة
            }
            
            totalHeight += 80 + padding; // مساحة الفوتر (الإحصائيات والوقت)

            // 3. إنشاء الكانفاس بالحجم النهائي المطلوب
            const canvas = createCanvas(width, totalHeight);
            const ctx = canvas.getContext('2d');

            // رسم الخلفية (الوضع الليلي)
            ctx.fillStyle = '#000000'; 
            ctx.fillRect(0, 0, width, totalHeight);

            // --- رسم الهيدر (الصورة والاسم) ---
            const pfp = await loadImage(profilePicUrl);
            const avatarX = width - padding - 80;
            
            // جعل الصورة الشخصية دائرية
            ctx.save();
            ctx.beginPath();
            ctx.arc(avatarX + 40, currentY + 40, 40, 0, Math.PI * 2, true);
            ctx.closePath();
            ctx.clip();
            ctx.drawImage(pfp, avatarX, currentY, 80, 80);
            ctx.restore();

            // رسم الاسم (يمين)
            ctx.textAlign = 'right';
            ctx.fillStyle = '#FFFFFF';
            ctx.font = 'bold 32px Arial';
            const nameWidth = ctx.measureText(userName).width;
            ctx.fillText(userName, avatarX - 20, currentY + 35);
            
            // رسم علامة التوثيق 🥇
            ctx.fillStyle = '#1DA1F2';
            ctx.beginPath();
            ctx.arc(avatarX - 20 - nameWidth - 20, currentY + 25, 12, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = '#FFFFFF';
            ctx.font = 'bold 16px Arial';
            ctx.textAlign = 'center';
            ctx.fillText('✓', avatarX - 20 - nameWidth - 20, currentY + 31);

            // رسم اليوزر نيم
            ctx.textAlign = 'right';
            ctx.fillStyle = '#8899A6';
            ctx.font = '24px Arial';
            ctx.fillText(userHandle, avatarX - 20, currentY + 70);

            currentY += 110;

            // --- رسم النص ---
            if (text) {
                ctx.fillStyle = '#D9D9D9';
                ctx.font = '32px Arial';
                ctx.textAlign = 'right';
                for (const line of textLines) {
                    ctx.fillText(line, width - padding, currentY);
                    currentY += 40; // مسافة بين الأسطر
                }
                currentY += 10;
            }

            // --- رسم الصورة المرفقة/المقتبسة (في حال وجودها) ---
            if (attachImgObj) {
                const imgWidth = width - (padding * 2);
                const imgHeight = imgWidth * (attachImgObj.height / attachImgObj.width);
                const imgX = padding;
                const radius = 20; // جعل زوايا الصورة دائرية

                ctx.save();
                ctx.beginPath();
                ctx.moveTo(imgX + radius, currentY);
                ctx.lineTo(imgX + imgWidth - radius, currentY);
                ctx.quadraticCurveTo(imgX + imgWidth, currentY, imgX + imgWidth, currentY + radius);
                ctx.lineTo(imgX + imgWidth, currentY + imgHeight - radius);
                ctx.quadraticCurveTo(imgX + imgWidth, currentY + imgHeight, imgX + imgWidth - radius, currentY + imgHeight);
                ctx.lineTo(imgX + radius, currentY + imgHeight);
                ctx.quadraticCurveTo(imgX, currentY + imgHeight, imgX, currentY + imgHeight - radius);
                ctx.lineTo(imgX, currentY + radius);
                ctx.quadraticCurveTo(imgX, currentY, imgX + radius, currentY);
                ctx.closePath();
                ctx.clip();
                ctx.drawImage(attachImgObj, imgX, currentY, imgWidth, imgHeight);
                ctx.restore();

                currentY += imgHeight + 30;
            }

            // --- رسم الفوتر (خط فاصل + الإحصائيات) ---
            ctx.strokeStyle = '#38444D';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(padding, currentY);
            ctx.lineTo(width - padding, currentY);
            ctx.stroke();

            currentY += 35;

            const timeNow = new Date();
            const timeString = timeNow.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' }) + ' · ' + timeNow.toLocaleDateString('ar-EG', { year: 'numeric', month: 'short', day: 'numeric' });
            
            const retweets = (Math.random() * 10).toFixed(1) + 'K';
            const quotes = Math.floor(Math.random() * 900) + 10;
            const likes = (Math.random() * 50 + 5).toFixed(1) + 'K';

            ctx.fillStyle = '#8899A6';
            ctx.font = '22px Arial';
            ctx.textAlign = 'right';
            ctx.fillText(timeString, width - padding, currentY);

            ctx.textAlign = 'left';
            ctx.fillText(`🔁 ${retweets}    💬 ${quotes}    ❤️ ${likes}`, padding, currentY);

            // 4. استخراج الصورة وإرسالها
            const finalImageBuffer = canvas.toBuffer('image/png');

            await sock.sendMessage(from, { 
                image: finalImageBuffer, 
                caption: `🐦 *تـم نـشـر الـتـغـريـدة بـنـجـاح!*\n*— 𝑻𝑨𝑹𝒁𝑨𝑵 𝑽𝑰𝑷 👑*` 
            }, { quoted: msg });

            await sock.sendMessage(from, { react: { text: '✅', key: msg.key } });

        } catch (error) {
            console.error('❌ خطأ في أمر التغريدة:', error);
            await sock.sendMessage(from, { react: { text: '❌', key: msg.key } });
            reply('❌ *حدث خطأ أثناء تصميم التغريدة، تأكد من تثبيت مكتبة canvas (npm install canvas).*');
        }
    }
};
