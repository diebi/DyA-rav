/* ============================================================================
   Vercel Serverless Function — api/watch.js
   
   Genera el HTML completo del reproductor con todos los meta tags
   hardcodeados del lado del servidor.
   
   Rave lee el HTML antes de ejecutar JavaScript — por eso necesitamos
   que og:video, og:type y el schema VideoObject estén en el HTML estático.
   Esta función hace exactamente eso para CUALQUIER video sin crear
   archivos individuales.
   
   URL: /watch?titulo=Nombre&url=https://video.mp4&back=/
============================================================================ */

module.exports = (req, res) => {
    const { titulo = '', url = '', back = '/' } = req.query;

    const tituloDecoded = decodeURIComponent(titulo);
    const urlDecoded    = decodeURIComponent(url);
    const backDecoded   = decodeURIComponent(back);
    const host          = req.headers.host || 'dy-a-rav.vercel.app';
    const pageUrl       = `https://${host}/watch?titulo=${titulo}&url=${url}&back=${back}`;
    const isM3u8        = urlDecoded.includes('.m3u8');
    const mime          = isM3u8 ? 'application/x-mpegURL' : 'video/mp4';
    const thumb         = 'https://images.unsplash.com/photo-1489599849927-2ee91cede3ba?w=640&q=80';

    if (!urlDecoded) {
        res.status(400).send('URL de video requerida');
        return;
    }

    const schema = JSON.stringify([{
        "@type":        "VideoObject",
        "@context":     "http://schema.org",
        "name":         tituloDecoded,
        "description":  tituloDecoded + " — D y A",
        "contentUrl":   urlDecoded,
        "embedUrl":     urlDecoded,
        "thumbnailUrl": thumb,
        "url":          pageUrl,
        "uploadDate":   new Date().toISOString().split('T')[0],
        "isFamilyFriendly": true,
        "videoQuality": "HD"
    }]);

    const safeUrl = urlDecoded.replace(/"/g, '&quot;');
    const safeTitle = tituloDecoded.replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

    const html = `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${safeTitle} — D y A ❤</title>
<meta property="og:site_name"        content="D y A">
<meta property="og:type"             content="video.movie">
<meta property="og:title"            content="${safeTitle}">
<meta property="og:description"      content="${safeTitle} — D y A ❤">
<meta property="og:image"            content="${thumb}">
<meta property="og:url"              content="${pageUrl}">
<meta property="og:video"            content="${safeUrl}">
<meta property="og:video:url"        content="${safeUrl}">
<meta property="og:video:secure_url" content="${safeUrl}">
<meta property="og:video:type"       content="${mime}">
<meta property="og:video:width"      content="1280">
<meta property="og:video:height"     content="720">
<meta name="twitter:card"            content="player">
<meta name="twitter:player"          content="${pageUrl}">
<meta name="twitter:player:width"    content="1280">
<meta name="twitter:player:height"   content="720">
<script type="application/ld+json">${schema}</script>
<link rel="preload" href="${safeUrl}" as="fetch" crossorigin="anonymous">
<style>
*{margin:0;padding:0;box-sizing:border-box}
:root{--fondo:#09070f;--tarjeta:#14111c;--oro:#d4a373;--dorado:#f3e9dc;--texto:#e0dbec;--sub:#a49cb3}
html,body{background:var(--fondo);color:var(--texto);font-family:system-ui,sans-serif;min-height:100vh}
.top-bar{display:flex;align-items:center;gap:14px;padding:14px 18px;border-bottom:1px solid rgba(212,163,115,0.12);background:var(--tarjeta)}
.back-btn{color:var(--sub);text-decoration:none;font-size:.88rem;border:1px solid rgba(212,163,115,0.3);padding:6px 14px;border-radius:6px}
.back-btn:hover{color:var(--oro);border-color:var(--oro)}
.brand{font-family:Georgia,serif;color:var(--oro);font-size:1.15rem;text-decoration:none}
.vtitle{font-family:Georgia,serif;font-size:1.35rem;color:var(--dorado);padding:16px 18px 8px}
.player-wrap{background:#000;width:100%;aspect-ratio:16/9}
video{width:100%;height:100%;display:block;background:#000}
.info{padding:14px 18px;background:var(--tarjeta);border-top:1px solid rgba(212,163,115,0.12)}
.tip{font-size:.78rem;color:#7c3aed;margin-bottom:12px;font-style:italic}
.btn-rave{display:inline-flex;align-items:center;gap:8px;background:linear-gradient(135deg,#1a0a2e,#2d1458);border:1px solid #7c3aed;color:#c4b5fd;padding:10px 20px;border-radius:8px;cursor:pointer;font-size:.9rem;font-weight:700;border:none;transition:all .3s}
.btn-rave:hover{background:linear-gradient(135deg,#2d1458,#4c1d95);box-shadow:0 0 16px rgba(124,58,237,.5)}
.hearts{position:fixed;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:0;overflow:hidden}
.heart{position:absolute;color:#581825;opacity:.15;animation:up 15s linear infinite;bottom:-50px}
@keyframes up{0%{transform:translateY(0);opacity:0}10%{opacity:.25}100%{transform:translateY(-105vh) translateX(50px) rotate(360deg);opacity:0}}
</style>
</head>
<body>
<div class="hearts" id="h"></div>
<div class="top-bar" style="position:relative;z-index:1">
  <a class="back-btn" href="${backDecoded}">← Volver</a>
  <a class="brand" href="/">D y A ❤</a>
</div>
<div class="vtitle" style="position:relative;z-index:1">${safeTitle}</div>
<div class="player-wrap" style="position:relative;z-index:1">
  <video id="v" controls playsinline preload="auto" crossorigin="anonymous"
         poster="${thumb}"${isM3u8 ? '' : ` src="${safeUrl}"`}>
    ${isM3u8 ? '' : `<source src="${safeUrl}" type="video/mp4">`}
  </video>
</div>
<div class="info" style="position:relative;z-index:1">
  <p class="tip">💡 Abre esta página desde Rave app — detectará el video y abrirá la sala privada automáticamente</p>
  <button class="btn-rave" onclick="copyUrl()">🎬 Copiar URL para Rave</button>
</div>
<script>
(function(){var c=document.getElementById('h'),s=['❤','❣','♥','♡'];for(var i=0;i<15;i++){var e=document.createElement('span');e.className='heart';e.innerText=s[Math.floor(Math.random()*4)];e.style.left=Math.random()*100+'%';e.style.animationDelay=Math.random()*14+'s';e.style.fontSize=(Math.random()*10+12)+'px';c.appendChild(e);}})();
var isM3u8=${isM3u8};
var VU="${safeUrl}";
if(isM3u8){var s=document.createElement('script');s.src='https://cdn.jsdelivr.net/npm/hls.js@latest';s.onload=function(){var v=document.getElementById('v');if(typeof Hls!=='undefined'&&Hls.isSupported()){var h=new Hls();h.loadSource(VU);h.attachMedia(v);}else if(v.canPlayType('application/vnd.apple.mpegurl')){v.src=VU;}};document.head.appendChild(s);}
function copyUrl(){var u=window.location.href;if(navigator.clipboard&&navigator.clipboard.writeText){navigator.clipboard.writeText(u).then(function(){alert('✅ URL copiada\nPégala en Rave para abrir sala privada');});}else{prompt('Copia esta URL:',u);}}
</script>
</body>
</html>`;

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-store');
    res.status(200).send(html);
};
