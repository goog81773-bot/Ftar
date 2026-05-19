const { downloadMediaMessage } = require('@whiskeysockets/baileys');
const { Client } = require("basic-ftp");
const { Readable } = require('stream');

module.exports = {
    name: 'هدية',
    aliases: ['مفاجأة', 'gift', 'حب'],
    execute: async ({ sock, msg, reply, from, args }) => {
        
        const input = args.join(' ');
        if (!input || !input.includes('|')) {
            return reply('❌ *الاستخدام الخاطئ!*\n\n*الطريقة الصحيحة:*\nرد على صورة أو فيديو واكتب:\n.هدية [النص] | [كلمة السر]\n\n*مثال:*\n.هدية أحبك | 2026');
        }

        const [textPart, passwordPart] = input.split('|');
        const textToDisplay = textPart.trim().replace(/\n/g, '<br>');
        const password = passwordPart.trim();

        const isMedia = msg.message?.imageMessage || msg.message?.videoMessage;
        const quotedMsg = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
        const isQuotedMedia = quotedMsg?.imageMessage || quotedMsg?.videoMessage;

        if (!isMedia && !isQuotedMedia) {
            return reply('❌ *يرجى إرسال الصورة أو الرد عليها بالأمر لتغليفها كهدية.*');
        }

        try {
            await sock.sendMessage(from, { react: { text: '⚙️', key: msg.key } });
            reply('⏳ *جاري برمجة صفحة الهدية ورفعها على سيرفر طرزان، يرجى الانتظار...*');

            // تحميل الميديا
            const messageToDownload = isMedia ? msg : { message: quotedMsg };
            const mediaBuffer = await downloadMediaMessage(messageToDownload, 'buffer', {}, { logger: console });
            const base64Media = mediaBuffer.toString('base64');
            
            const isVideo = messageToDownload.message?.videoMessage || quotedMsg?.videoMessage;
            const mimeType = isVideo ? 'video/mp4' : 'image/jpeg';
            
            // وسم الـ HTML
            const mediaHtmlTag = isVideo 
                ? `<video controls autoplay loop style="width: 100%; max-height: 400px; object-fit: cover; border-radius: 20px; box-shadow: 0 15px 35px rgba(0, 0, 0, 0.6), 0 0 20px rgba(255, 77, 109, 0.3); border: 3px solid rgba(255, 179, 198, 0.3);"><source src="data:${mimeType};base64,${base64Media}" type="${mimeType}"></video>`
                : `<img src="data:${mimeType};base64,${base64Media}" alt="Romantic Gift" style="width: 100%; max-height: 400px; object-fit: cover; border-radius: 20px; box-shadow: 0 15px 35px rgba(0, 0, 0, 0.6), 0 0 20px rgba(255, 77, 109, 0.3); border: 3px solid rgba(255, 179, 198, 0.3);">`;

            // بناء الـ HTML الرومانسي مع شاشة القفل والزخارف المتفجرة
            const htmlContent = `<!DOCTYPE html><html lang="ar" dir="rtl"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>🎁 مفاجأة لك</title><link href="https://fonts.googleapis.com/css2?family=Tajawal:wght@500;700;800&display=swap" rel="stylesheet"><style>*{box-sizing:border-box;margin:0;padding:0}body{font-family:'Tajawal',sans-serif;background:radial-gradient(circle at center, #590d22 0%, #1a040b 100%);color:#fff;display:flex;justify-content:center;align-items:center;min-height:100vh;text-align:center;overflow:hidden}.container{background:rgba(255,179,198,.05);backdrop-filter:blur(15px);-webkit-backdrop-filter:blur(15px);padding:40px 25px;border-radius:30px;box-shadow:0 20px 50px rgba(0,0,0,.5),inset 0 0 0 1px rgba(255,179,198,.2);width:90%;max-width:420px;transition:all .6s cubic-bezier(0.68,-0.55,0.265,1.55);position:relative;z-index:10}.icon-lock{font-size:70px;margin-bottom:15px;animation:floatLock 3s ease-in-out infinite;filter:drop-shadow(0 0 15px rgba(255,77,109,.6))}@keyframes floatLock{0%,100%{transform:translateY(0) scale(1)}50%{transform:translateY(-15px) scale(1.05)}}h1{color:#ffb3c6;font-size:26px;font-weight:800;margin-bottom:10px;text-shadow:0 2px 10px rgba(255,77,109,.4)}p{color:#ffccd5;font-size:15px;margin-bottom:30px;line-height:1.6}input{width:85%;padding:16px;border-radius:15px;border:2px solid rgba(255,77,109,.4);background:rgba(0,0,0,.2);color:#fff;font-size:20px;text-align:center;outline:0;margin-bottom:25px;font-family:'Tajawal',sans-serif;transition:.3s;letter-spacing:2px}input:focus{border-color:#ff4d6d;box-shadow:0 0 15px rgba(255,77,109,.3);background:rgba(0,0,0,.4)}input::placeholder{color:rgba(255,255,255,.4);letter-spacing:0;font-size:16px}button{background:linear-gradient(135deg, #ff4d6d 0%, #c9184a 100%);color:#fff;border:0;padding:16px 30px;border-radius:15px;font-size:18px;font-weight:700;cursor:pointer;transition:.3s;font-family:'Tajawal',sans-serif;width:85%;box-shadow:0 10px 20px rgba(201,24,74,.4)}button:hover{transform:translateY(-3px);box-shadow:0 15px 25px rgba(201,24,74,.6)}.shake{animation:shake .5s cubic-bezier(.36,.07,.19,.97) both}@keyframes shake{10%,90%{transform:translate3d(-2px,0,0)}20%,80%{transform:translate3d(4px,0,0)}30%,50%,70%{transform:translate3d(-8px,0,0)}40%,60%{transform:translate3d(8px,0,0)}}#gift-screen{display:none;opacity:0;transform:scale(0.8);background:0 0;border:0;box-shadow:none;width:100%;max-width:450px;padding:20px}.gift-text{font-size:22px;font-weight:700;color:#fff;line-height:1.6;margin-top:20px;text-shadow:0 2px 5px rgba(0,0,0,.8);background:rgba(89,13,34,.6);padding:20px;border-radius:20px;backdrop-filter:blur(10px);border:1px solid rgba(255,179,198,.2);box-shadow:0 10px 20px rgba(0,0,0,.3)}.love-box{display:inline-flex;align-items:center;justify-content:center;gap:10px;margin-top:25px;padding:12px 30px;background:linear-gradient(135deg,rgba(255,77,109,.2) 0%,rgba(201,24,74,.4) 100%);border:1px solid #ff4d6d;border-radius:50px;font-size:24px;font-weight:800;color:#ffb3c6;box-shadow:0 0 20px rgba(255,77,109,.4);animation:heartbeat 1.5s ease-in-out infinite}.love-box span{color:#fff;text-shadow:0 0 10px rgba(255,255,255,.5)}@keyframes heartbeat{0%,28%,70%{transform:scale(1);box-shadow:0 0 20px rgba(255,77,109,.4)}14%,42%{transform:scale(1.1);box-shadow:0 0 30px rgba(255,77,109,.6)}}.particle{position:absolute;pointer-events:none;z-index:9999;font-size:20px;will-change:transform,opacity}</style></head><body><div class="container" id="lock-screen"><div class="icon-lock">🔐❤️</div><h1>هدية مغلفة بالحب</h1><p>هذا الرابط يحمل بداخله مفاجأة خاصة جداً، يرجى إدخال كلمة السر لفتحها.</p><input type="password" id="passInput" placeholder="كلمة السر..." onkeypress="handleEnter(event)"><br><button onclick="checkPassword()">افتح الهدية ✨</button><p id="error-msg" style="color:#ff4d6d;margin-top:20px;display:none;font-weight:700;text-shadow:0 0 5px rgba(255,0,0,.5);">❌ كلمة السر خاطئة، حاول مرة أخرى!</p></div><div class="container" id="gift-screen"><div class="media-container">${mediaHtmlTag}</div><div class="gift-text">${textToDisplay}</div><div class="love-box">🎁 <span>احبك 🥺</span></div></div><script>const correctPass="${password}";function handleEnter(e){if(e.key==='Enter')checkPassword()}function checkPassword(){const input=document.getElementById('passInput').value;const lockScreen=document.getElementById('lock-screen');const errorMsg=document.getElementById('error-msg');const giftScreen=document.getElementById('gift-screen');if(input===correctPass){lockScreen.style.transform='scale(0.8)';lockScreen.style.opacity='0';setTimeout(()=>{lockScreen.style.display='none';giftScreen.style.display='block';requestAnimationFrame(()=>{giftScreen.style.transition='all 0.8s cubic-bezier(0.175, 0.885, 0.32, 1.275)';giftScreen.style.transform='scale(1)';giftScreen.style.opacity='1'});document.body.style.background='radial-gradient(circle at center, #800f2f 0%, #2b0013 100%)';explodeDecorations()},400)}else{errorMsg.style.display='block';lockScreen.classList.remove('shake');setTimeout(()=>lockScreen.classList.add('shake'),10);document.getElementById('passInput').value=''}}function explodeDecorations(){const symbols=['❤️','💖','✨','🌸','🎀','💌','🌹'];for(let i=0;i<70;i++)createParticle(symbols[Math.floor(Math.random()*symbols.length)])}function createParticle(symbol){const particle=document.createElement('div');particle.innerText=symbol;particle.classList.add('particle');document.body.appendChild(particle);const startX=window.innerWidth/2;const startY=window.innerHeight/2;const angle=Math.random()*Math.PI*2;const velocity=100+Math.random()*400;const destX=startX+Math.cos(angle)*velocity;const destY=startY+Math.sin(angle)*velocity-200;const scale=.5+Math.random()*1.5;const rotation=Math.random()*360;particle.style.left=startX+'px';particle.style.top=startY+'px';particle.style.transform='translate(-50%, -50%) scale(0)';const animation=particle.animate([{transform:'translate(-50%, -50%) scale(0) rotate(0deg)',opacity:1},{transform:'translate(calc(-50% + '+(destX-startX)+'px), calc(-50% + '+(destY-startY)+'px)) scale('+scale+') rotate('+rotation+'deg)',opacity:1,offset:.6},{transform:'translate(calc(-50% + '+(destX-startX)+'px), calc(-50% + '+(destY-startY+300)+'px)) scale('+scale+') rotate('+(rotation+90)+'deg)',opacity:0}],{duration:2000+Math.random()*1500,easing:'cubic-bezier(0.25, 1, 0.5, 1)',fill:'forwards'});animation.onfinish=()=>{particle.remove()}}</script></body></html>`;

            const htmlBuffer = Buffer.from(htmlContent, 'utf-8');

            await sock.sendMessage(from, { react: { text: '🌐', key: msg.key } });

            // -----------------------------------------
            // عملية الاتصال بالسيرفر والرفع عبر FTP
            // -----------------------------------------
            const ftpClient = new Client();
            
            // توليد اسم عشوائي للصفحة
            const uniqueId = Math.floor(Math.random() * 900000) + 100000;
            const fileName = `gift_${uniqueId}.html`;

            // بيانات الاتصال باستضافتك
            await ftpClient.access({
                host: "ftpupload.net",
                user: "ezyro_41968850",
                password: "48a1b6473a0ca",
                secure: false // الاستضافات المجانية غالباً لا تدعم SSL للـ FTP
            });

            const sourceStream = Readable.from(htmlBuffer);

            // مجلد الموقع الافتراضي
            await ftpClient.cd("htdocs");
            
            // رفع الملف
            await ftpClient.uploadFrom(sourceStream, fileName);
            ftpClient.close(); // إنهاء الاتصال فور الانتهاء

            // الرابط المباشر
            const finalLink = `http://tarzan.liveblog365.com/${fileName}`;

            const captionMsg = `🎀 *تم تجهيز هديتك المشفرة بنجاح!*\n\nارسل هذا الرابط السري لمن تحب:\n🔗 ${finalLink}\n\n🔐 *كلمة السر لفتح المفاجأة:* ${password}\n\n👑 *بواسطة طرزان بوت*`;

            await sock.sendMessage(from, { text: captionMsg }, { quoted: msg });
            await sock.sendMessage(from, { react: { text: '✅', key: msg.key } });

        } catch (error) {
            console.error('❌ خطأ في أمر الهدية الرومانسية:', error);
            await sock.sendMessage(from, { react: { text: '❌', key: msg.key } });
            reply('❌ *حدث خطأ أثناء رفع الهدية على السيرفر.*');
        }
    }
};
