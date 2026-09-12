/* ============================================================================
   Vercel Serverless Function — api/proxy.js
   
   Proxy para links .m3u8 con autenticación por Query String.
   Maneja tanto el manifiesto como los segmentos .ts y sub-manifiestos.
   
   Cuando hls.js pide un segmento, también pasa por este proxy que
   añade los parámetros de autenticación originales a cada petición.
============================================================================ */

const https = require('https');
const http  = require('http');

module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin',  '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Range');

    if (req.method === 'OPTIONS') { res.status(200).end(); return; }

    const targetUrl = req.query.url;
    if (!targetUrl) { res.status(400).send('Falta url'); return; }

    try {
        const parsedUrl  = new URL(targetUrl);
        const authParams = parsedUrl.search; /* ?hash=...&validto=... */
        const baseOrigin = parsedUrl.origin;
        const basePath   = parsedUrl.pathname.substring(0, parsedUrl.pathname.lastIndexOf('/') + 1);
        const isM3u8     = parsedUrl.pathname.endsWith('.m3u8');

        if (isM3u8) {
            /* ── MANIFIESTO: reescribir URLs de segmentos ── */
            const manifest = await fetchData(targetUrl, false);
            const text     = manifest.body.toString('utf8');

            if (!text.includes('#EXTM3U')) {
                res.status(502).send('No es HLS válido: ' + text.substring(0, 200));
                return;
            }

            const lines    = text.split('\n');
            const rewritten = lines.map(line => {
                const t = line.trim();
                if (!t || t.startsWith('#')) return line;

                let segUrl;
                if (t.startsWith('http://') || t.startsWith('https://')) {
                    segUrl = t;
                } else if (t.startsWith('/')) {
                    segUrl = baseOrigin + t;
                } else {
                    segUrl = baseOrigin + basePath + t;
                }

                /* Añadir auth params si no los tiene */
                if (authParams && authParams.length > 1) {
                    const sep = segUrl.includes('?') ? '&' : '?';
                    const alreadyHasAuth = parsedUrl.searchParams.keys().next().value &&
                        segUrl.includes(parsedUrl.searchParams.keys().next().value);
                    if (!alreadyHasAuth) {
                        segUrl = segUrl + sep + authParams.substring(1);
                    }
                }

                /* Sub-manifiestos también pasan por el proxy */
                if (segUrl.includes('.m3u8')) {
                    return `/api/proxy?url=${encodeURIComponent(segUrl)}`;
                }

                /* Segmentos .ts también pasan por el proxy para auth */
                return `/api/proxy?url=${encodeURIComponent(segUrl)}`;
            });

            res.setHeader('Content-Type',  'application/vnd.apple.mpegurl');
            res.setHeader('Cache-Control', 'no-cache');
            res.status(200).send(rewritten.join('\n'));

        } else {
            /* ── SEGMENTO .ts u otro: hacer pipe directo ── */
            const result = await fetchData(targetUrl, true);

            /* Pasar headers relevantes */
            const ct = result.headers['content-type'] || 'video/mp2t';
            res.setHeader('Content-Type',  ct);
            res.setHeader('Cache-Control', 'public, max-age=3600');
            if (result.headers['content-length']) {
                res.setHeader('Content-Length', result.headers['content-length']);
            }
            res.status(200).send(result.body);
        }

    } catch (err) {
        console.error('Proxy error:', err.message);
        res.status(502).send('Error proxy: ' + err.message);
    }
};

/* Descarga datos de una URL — retorna { body, headers } */
function fetchData(targetUrl, isBinary) {
    return new Promise((resolve, reject) => {
        const parsed  = new URL(targetUrl);
        const lib     = parsed.protocol === 'https:' ? https : http;
        const options = {
            hostname: parsed.hostname,
            path:     parsed.pathname + parsed.search,
            method:   'GET',
            headers: {
                'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15',
                'Accept':     '*/*',
                'Referer':    parsed.origin + '/',
                'Origin':     parsed.origin
            }
        };

        const reqHttp = lib.request(options, resHttp => {
            /* Seguir redirecciones */
            if (resHttp.statusCode >= 300 && resHttp.statusCode < 400 && resHttp.headers.location) {
                return fetchData(resHttp.headers.location, isBinary).then(resolve).catch(reject);
            }
            if (resHttp.statusCode !== 200) {
                return reject(new Error(`HTTP ${resHttp.statusCode} desde ${parsed.hostname}`));
            }

            const chunks = [];
            resHttp.on('data', chunk => chunks.push(chunk));
            resHttp.on('end', () => resolve({
                body:    Buffer.concat(chunks),
                headers: resHttp.headers
            }));
        });

        reqHttp.on('error', reject);
        reqHttp.setTimeout(15000, () => { reqHttp.destroy(); reject(new Error('Timeout')); });
        reqHttp.end();
    });
}
