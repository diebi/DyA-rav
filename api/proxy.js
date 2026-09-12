/* ============================================================================
   Vercel Serverless Function — api/proxy.js
   
   Proxy inteligente para links .m3u8 con autenticación por Query String.
   
   PROBLEMA QUE RESUELVE:
   Links tipo 1 tienen el token en el query string:
   https://cdn.server.com/video.m3u8?validfrom=...&validto=...&hash=...
   
   Rave y hls.js no reenvían esos parámetros al pedir los segmentos internos
   del manifiesto, por lo que fallan con 403.
   
   SOLUCIÓN:
   Este proxy:
   1. Descarga el manifiesto .m3u8 original con todos sus parámetros
   2. Reescribe cada URL de segmento dentro del manifiesto añadiéndole
      los mismos parámetros de autenticación
   3. Devuelve el manifiesto modificado a Rave/hls.js
   4. Rave/hls.js piden los segmentos con las URLs ya completas → funciona
   
   USO: /api/proxy?url=https://cdn.server.com/video.m3u8?hash=...&validto=...
============================================================================ */

const https = require('https');
const http  = require('http');
const url   = require('url');

module.exports = async (req, res) => {

    /* CORS — permitir que el browser de Rave acceda */
    res.setHeader('Access-Control-Allow-Origin',  '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Range');

    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }

    const targetUrl = req.query.url;
    if (!targetUrl) {
        res.status(400).send('Falta el parámetro url');
        return;
    }

    try {
        const parsedUrl    = new URL(targetUrl);
        const authParams   = parsedUrl.search; /* ej: ?hash=xxx&validto=yyy */
        const baseOrigin   = parsedUrl.origin;  /* ej: https://cdn.server.com */
        const basePath     = parsedUrl.pathname.substring(0, parsedUrl.pathname.lastIndexOf('/') + 1);

        /* Descargar el manifiesto original */
        const manifest = await fetchText(targetUrl);

        /* Verificar si es un manifiesto HLS válido */
        if (!manifest.includes('#EXTM3U')) {
            res.status(502).send('No es un manifiesto HLS válido');
            return;
        }

        /* Reescribir el manifiesto:
           Para cada línea que sea una URL de segmento o sub-manifiesto,
           añadimos los parámetros de autenticación originales. */
        const lines    = manifest.split('\n');
        const rewritten = lines.map(line => {
            const trimmed = line.trim();

            /* Saltar líneas vacías y comentarios que no son URIs */
            if (!trimmed || trimmed.startsWith('#')) return line;

            /* Es una URL de segmento o sub-manifiesto */
            let segUrl;

            if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
                /* URL absoluta — añadir params si no los tiene ya */
                segUrl = trimmed;
                if (!segUrl.includes(parsedUrl.searchParams.keys().next().value)) {
                    const sep = segUrl.includes('?') ? '&' : '?';
                    segUrl = segUrl + sep + authParams.substring(1);
                }
            } else if (trimmed.startsWith('/')) {
                /* URL relativa a la raíz */
                segUrl = baseOrigin + trimmed;
                const sep = segUrl.includes('?') ? '&' : '?';
                segUrl = segUrl + sep + authParams.substring(1);
            } else {
                /* URL relativa al directorio actual */
                segUrl = baseOrigin + basePath + trimmed;
                const sep = segUrl.includes('?') ? '&' : '?';
                segUrl = segUrl + sep + authParams.substring(1);
            }

            /* Si es un sub-manifiesto .m3u8, apuntarlo también a nuestro proxy */
            if (segUrl.includes('.m3u8')) {
                return `/api/proxy?url=${encodeURIComponent(segUrl)}`;
            }

            return segUrl;
        });

        const result = rewritten.join('\n');

        res.setHeader('Content-Type',  'application/vnd.apple.mpegurl');
        res.setHeader('Cache-Control', 'no-cache');
        res.status(200).send(result);

    } catch (err) {
        console.error('Proxy error:', err.message);
        res.status(502).send('Error al procesar el manifiesto: ' + err.message);
    }
};

/* Helper: descarga texto de una URL */
function fetchText(targetUrl) {
    return new Promise((resolve, reject) => {
        const parsed  = new URL(targetUrl);
        const lib     = parsed.protocol === 'https:' ? https : http;
        const options = {
            hostname: parsed.hostname,
            path:     parsed.pathname + parsed.search,
            method:   'GET',
            headers: {
                'User-Agent': 'Mozilla/5.0 (compatible; RavePlayer/1.0)',
                'Accept':     '*/*',
                'Referer':    parsed.origin + '/'
            }
        };

        const reqHttp = lib.request(options, resHttp => {
            /* Seguir redirecciones */
            if (resHttp.statusCode >= 300 && resHttp.statusCode < 400 && resHttp.headers.location) {
                return fetchText(resHttp.headers.location).then(resolve).catch(reject);
            }
            if (resHttp.statusCode !== 200) {
                return reject(new Error(`HTTP ${resHttp.statusCode}`));
            }
            let data = '';
            resHttp.setEncoding('utf8');
            resHttp.on('data', chunk => data += chunk);
            resHttp.on('end',  ()    => resolve(data));
        });

        reqHttp.on('error', reject);
        reqHttp.setTimeout(10000, () => { reqHttp.destroy(); reject(new Error('Timeout')); });
        reqHttp.end();
    });
}
