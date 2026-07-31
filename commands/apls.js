const { createCanvas, loadImage, registerFont } = require('canvas');
const moment = require('moment-timezone');
const fs = require('fs');
const path = require('path');

module.exports = {
    name: 'receipt',
    aliases: ['حواله', 'حوالة', 'سند', 'صرف', 'إيصال'],
    description: '🧾 إنشاء سند حوالة مالية احترافي - إيصال مصرفي فخم',
    
    async execute({ sock, msg, args, text, reply, from, sender, pushName, isFromMe, prefix, commandName }) {
        
        try {
            // معالجة الإدخال
            const input = args.join(' ');
            const details = input.split('|').map(item => item.trim());

            if (details.length < 3) {
                return reply(`🧾 *نظام الحوالات المالية*\n\n📌 *الاستخدام:*\n${prefix}حواله الاسم | الهاتف | المبلغ\n\n📝 *مثال:*\n${prefix}حواله طارق الواقدي | 7737996293 | 50000\n\n📌 *أمثلة إضافية:*\n${prefix}حواله أحمد محمد | 501234567 | 100000\n${prefix}حواله علي حسن | 987654321 | 75000`);
            }

            // استخراج البيانات
            const name = details[0] || 'مستلم غير معروف';
            const phone = details[1] || 'غير محدد';
            const rawAmount = details[2].replace(/[^\d]/g, '') || '0';
            const amount = parseInt(rawAmount).toLocaleString('en-US') + ' ريال';
            
            // معلومات السند
            const receiptNumber = 'WQ-' + String(Math.floor(Math.random() * 90000 + 10000)).padStart(5, '0');
            const transferNumber = 'TRN-' + String(Math.floor(Math.random() * 90000000 + 10000000)).padStart(8, '0');
            const date = moment().tz('Asia/Riyadh').format('DD/MM/YYYY');
            const time = moment().tz('Asia/Riyadh').format('HH:mm:ss');

            await sock.sendMessage(from, { 
                react: { text: '🧾', key: msg.key } 
            });

            await reply('⏳ *جاري إنشاء السند المالي...*\n🖨️ *معالجة البيانات وتنسيق الإيصال*');

            // إنشاء السند
            const imageBuffer = await createReceipt({
                name,
                phone,
                amount,
                receiptNumber,
                transferNumber,
                date,
                time
            });

            // إنشاء التقرير
            const caption = `
🧾 *سند حوالة مالية*
━━━━━━━━━━━━━━━━━━━━━━

📌 *رقم السند:* ${receiptNumber}
🔖 *رقم الحوالة:* ${transferNumber}
👤 *المستفيد:* ${name}
📱 *الهاتف:* ${phone}
💰 *المبلغ:* ${amount}
📅 *التاريخ:* ${date}
🕒 *الوقت:* ${time}

━━━━━━━━━━━━━━━━━━━━━━
✅ *تم إصدار السند بنجاح*
*— 𝑻𝑨𝑹𝒁𝑨𝑵 EXCHANGE 🏦*
`.trim();

            // إرسال الصورة مع التقرير
            await sock.sendMessage(from, { 
                image: imageBuffer, 
                caption: caption 
            }, { quoted: msg });

            await sock.sendMessage(from, { 
                react: { text: '✅', key: msg.key } 
            });

        } catch (error) {
            console.error('❌ خطأ في إنشاء السند:', error);
            await sock.sendMessage(from, { 
                react: { text: '❌', key: msg.key } 
            });
            reply(`❌ *حدث خطأ في النظام المالي*\n📌 السبب: ${error.message || 'خطأ غير معروف'}`);
        }
    }
};

// ==========================================
// دالة إنشاء السند
// ==========================================
async function createReceipt(data) {
    try {
        // أبعاد السند
        const width = 1000;
        const height = 750;
        
        const canvas = createCanvas(width, height);
        const ctx = canvas.getContext('2d');

        // 1. الخلفية
        const gradient = ctx.createLinearGradient(0, 0, width, height);
        gradient.addColorStop(0, '#ffffff');
        gradient.addColorStop(0.5, '#f8f9fa');
        gradient.addColorStop(1, '#ffffff');
        
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, width, height);

        // 2. الإطار الخارجي الفخم
        // إطار أول (ذهبي)
        ctx.strokeStyle = '#c9a84c';
        ctx.lineWidth = 4;
        ctx.strokeRect(15, 15, width - 30, height - 30);
        
        // إطار ثاني (أزرق كحلي)
        ctx.strokeStyle = '#1a3a5c';
        ctx.lineWidth = 2;
        ctx.strokeRect(25, 25, width - 50, height - 50);
        
        // إطار ثالث (رمادي فاتح)
        ctx.strokeStyle = '#bdc3c7';
        ctx.lineWidth = 1;
        ctx.setLineDash([5, 5]);
        ctx.strokeRect(35, 35, width - 70, height - 70);
        ctx.setLineDash([]);

        // 3. الترويسة
        const headerGrad = ctx.createLinearGradient(0, 0, width, 0);
        headerGrad.addColorStop(0, '#1a3a5c');
        headerGrad.addColorStop(0.5, '#2c3e50');
        headerGrad.addColorStop(1, '#1a3a5c');
        
        ctx.fillStyle = headerGrad;
        ctx.fillRect(35, 35, width - 70, 100);

        // نص الترويسة
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 40px Arial';
        ctx.fillText('شركة الواقدي للصرافة', width / 2, 65);
        
        ctx.fillStyle = '#ecf0f1';
        ctx.font = '18px Arial';
        ctx.fillText('Al-Waqdi Exchange & Remittances', width / 2, 105);

        // 4. شعار الشركة (رمز)
        ctx.fillStyle = '#c9a84c';
        ctx.font = '30px Arial';
        ctx.fillText('✦', 60, 75);
        ctx.fillText('✦', width - 60, 75);

        // 5. عنوان السند
        ctx.fillStyle = '#c0392b';
        ctx.font = 'bold 32px Arial';
        ctx.fillText('سند صرف حوالة مالية', width / 2, 175);

        // خط تحت العنوان
        ctx.strokeStyle = '#c9a84c';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(300, 190);
        ctx.lineTo(700, 190);
        ctx.stroke();

        // 6. الجدول
        const tableY = 220;
        const rowH = 55;
        const col1X = 50;
        const col2X = 300;
        const col3X = 550;
        const col4X = 750;
        
        // ألوان الجدول
        const headerColor = '#2c3e50';
        const headerTextColor = '#ffffff';
        const rowColor1 = '#ffffff';
        const rowColor2 = '#f8f9fa';
        const borderColor = '#bdc3c7';

        // بيانات الجدول
        const rows = [
            ['رقم السند', receiptNumber, 'التاريخ', date],
            ['رقم الحوالة', transferNumber, 'الوقت', time],
            ['اسم المستفيد', name, 'الهاتف', phone],
            ['المبلغ', amount, 'العملة', 'ريال سعودي']
        ];

        // رسم الجدول
        rows.forEach((row, index) => {
            const y = tableY + (index * rowH);
            const isHeader = index === 0;
            
            // خلفية الصف
            ctx.fillStyle = index % 2 === 0 ? rowColor1 : rowColor2;
            ctx.fillRect(col1X, y, 200, rowH);
            ctx.fillRect(col2X, y, 250, rowH);
            ctx.fillRect(col3X, y, 200, rowH);
            ctx.fillRect(col4X, y, 200, rowH);

            // حدود الخلايا
            ctx.strokeStyle = borderColor;
            ctx.lineWidth = 1;
            
            // رسم حدود كل خلية
            [col1X, col2X, col3X, col4X].forEach(x => {
                ctx.strokeRect(x, y, 
                    x === col1X ? 200 : x === col2X ? 250 : x === col3X ? 200 : 200, 
                    rowH
                );
            });

            // كتابة النصوص
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            
            const texts = [
                { text: row[0], x: col1X + 100, color: isHeader ? headerTextColor : '#2c3e50', bold: true },
                { text: row[1], x: col2X + 125, color: isHeader ? headerTextColor : '#000000', bold: false },
                { text: row[2], x: col3X + 100, color: isHeader ? headerTextColor : '#2c3e50', bold: true },
                { text: row[3], x: col4X + 100, color: isHeader ? headerTextColor : (index === 3 ? '#27ae60' : '#000000'), bold: index === 3 }
            ];

            // تلوين خلفية الصف الأول
            if (isHeader) {
                ctx.fillStyle = headerColor;
                ctx.fillRect(col1X, y, 200, rowH);
                ctx.fillRect(col2X, y, 250, rowH);
                ctx.fillRect(col3X, y, 200, rowH);
                ctx.fillRect(col4X, y, 200, rowH);
            }

            texts.forEach(t => {
                ctx.fillStyle = t.color;
                ctx.font = (t.bold ? 'bold ' : '') + (index === 3 && !isHeader ? '26px' : '20px') + ' Arial';
                ctx.fillText(t.text, t.x, y + rowH / 2);
            });
        });

        // 7. التوقيعات
        const signY = 510;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        
        // توقيع المستلم
        ctx.fillStyle = '#2c3e50';
        ctx.font = 'bold 20px Arial';
        ctx.fillText('توقيع المستلم', 220, signY);
        
        ctx.strokeStyle = '#bdc3c7';
        ctx.lineWidth = 1;
        ctx.setLineDash([5, 5]);
        ctx.beginPath();
        ctx.moveTo(100, signY + 35);
        ctx.lineTo(340, signY + 35);
        ctx.stroke();
        ctx.setLineDash([]);

        // توقيع المدير
        ctx.fillStyle = '#2c3e50';
        ctx.font = 'bold 20px Arial';
        ctx.fillText('توقيع المدير العام', 780, signY);
        
        ctx.strokeStyle = '#bdc3c7';
        ctx.lineWidth = 1;
        ctx.setLineDash([5, 5]);
        ctx.beginPath();
        ctx.moveTo(660, signY + 35);
        ctx.lineTo(900, signY + 35);
        ctx.stroke();
        ctx.setLineDash([]);

        // 8. الختم الدائري الفخم
        ctx.save();
        ctx.translate(width / 2, 600);
        ctx.rotate(-0.1);
        
        const stampColor = 'rgba(192, 57, 43, 0.85)';
        ctx.strokeStyle = stampColor;
        ctx.fillStyle = stampColor;
        
        // الدوائر
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(0, 0, 90, 0, Math.PI * 2);
        ctx.stroke();
        
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(0, 0, 80, 0, Math.PI * 2);
        ctx.stroke();
        
        ctx.beginPath();
        ctx.arc(0, 0, 55, 0, Math.PI * 2);
        ctx.stroke();

        // النص الدائري
        const stampText = "★ AL-WAQDI EXCHANGE ★";
        const radius = 72;
        ctx.font = 'bold 14px Arial';
        for (let i = 0; i < stampText.length; i++) {
            ctx.save();
            const angle = (i / stampText.length) * Math.PI * 2 - Math.PI / 2;
            ctx.rotate(angle);
            ctx.fillText(stampText[i], 0, -radius);
            ctx.restore();
        }

        // النص المركزي
        ctx.font = 'bold 28px Arial';
        ctx.fillStyle = '#c0392b';
        ctx.fillText('طرزان', 0, -8);
        ctx.font = 'bold 20px Arial';
        ctx.fillText('الواقدي', 0, 25);
        
        ctx.font = 'bold 16px Arial';
        ctx.fillStyle = '#2c3e50';
        ctx.fillText('معتمد', 0, -45);
        ctx.fillStyle = '#27ae60';
        ctx.fillText('✓ PAID', 0, 50);

        // نجوم
        ctx.font = '16px Arial';
        ctx.fillStyle = '#c9a84c';
        ctx.fillText('✦', -55, 0);
        ctx.fillText('✦', 55, 0);

        ctx.restore();

        // 9. تذييل الصفحة
        ctx.fillStyle = '#7f8c8d';
        ctx.font = '14px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('هذا السند معتمد من شركة الواقدي للصرافة - جميع الحقوق محفوظة © 2024', width / 2, 720);
        ctx.fillStyle = '#bdc3c7';
        ctx.fillText(`صدر في ${date} - ${time}`, width / 2, 740);

        // إرجاع الصورة
        return canvas.toBuffer('image/png');

    } catch (error) {
        console.error('❌ خطأ في إنشاء السند:', error);
        throw error;
    }
}
