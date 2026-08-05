// ============================================================
// video-scanner.js — Genera miniaturas y duración para los videos.
//
// sharp (usado en el servidor para las fotos) no decodifica video, y
// añadir ffmpeg como dependencia infla mucho la instalación. En vez de
// eso, este script usa el propio decodificador de video del navegador:
// carga el video en un <video> oculto, busca un fotograma representativo
// y lo captura a un <canvas>, y sube ese frame al servidor para que se
// guarde en la misma caché de miniaturas que ya usan las fotos.
// ============================================================

const VIDEO_BATCH_SIZE = 15;
const VIDEO_YIELD_MS = 350;
const VIDEO_LOAD_TIMEOUT_MS = 12000;
const VIDEO_MAX_CAPTURE_DIM = 800;

let videoScannerStarted = false;

function captureVideoThumbnail(photoId) {
    return new Promise((resolve, reject) => {
        const video = document.createElement('video');
        video.muted = true;
        video.playsInline = true;
        video.preload = 'metadata';
        video.src = `/api/photo/${photoId}`;

        let settled = false;
        const timeoutId = setTimeout(() => {
            finish(() => reject(new Error('Tiempo de espera agotado cargando el video')));
        }, VIDEO_LOAD_TIMEOUT_MS);

        function cleanup() {
            clearTimeout(timeoutId);
            video.removeAttribute('src');
            try { video.load(); } catch (e) { /* no crítico */ }
        }

        function finish(action) {
            if (settled) return;
            settled = true;
            cleanup();
            action();
        }

        video.addEventListener('loadedmetadata', () => {
            if (settled) return;
            const dur = video.duration;
            const seekTime = isFinite(dur) && dur > 0.3 ? Math.min(dur * 0.1, dur - 0.1) : 0;
            try {
                video.currentTime = Math.max(0, seekTime);
            } catch (e) {
                finish(() => reject(e));
            }
        });

        video.addEventListener('seeked', () => {
            finish(() => {
                try {
                    let w = video.videoWidth, h = video.videoHeight;
                    if (!w || !h) { reject(new Error('El video no tiene dimensiones válidas')); return; }
                    if (w > VIDEO_MAX_CAPTURE_DIM || h > VIDEO_MAX_CAPTURE_DIM) {
                        const scale = VIDEO_MAX_CAPTURE_DIM / Math.max(w, h);
                        w = Math.round(w * scale);
                        h = Math.round(h * scale);
                    }
                    const canvas = document.createElement('canvas');
                    canvas.width = w;
                    canvas.height = h;
                    canvas.getContext('2d').drawImage(video, 0, 0, w, h);
                    resolve({
                        dataUrl: canvas.toDataURL('image/jpeg', 0.85),
                        duration: video.duration,
                        width: video.videoWidth,
                        height: video.videoHeight
                    });
                } catch (e) {
                    reject(e);
                }
            });
        });

        video.addEventListener('error', () => {
            finish(() => reject(new Error('El navegador no pudo decodificar este video')));
        });
    });
}

async function processOneVideo(photoId) {
    try {
        const { dataUrl, duration, width, height } = await captureVideoThumbnail(photoId);
        await API.post(`/api/thumbnail/${photoId}`, { imageBase64: dataUrl, duration, width, height });
    } catch (e) {
        console.warn(`[video-scanner] No se pudo generar miniatura para el video ${photoId}, se omite:`, e.message);
        // Se marca igual como "intentado": el video se sigue viendo en la biblioteca
        // (con un ícono genérico) y siempre se puede abrir con la app del sistema.
        try { await API.post(`/api/thumbnail/${photoId}`, {}); } catch (e2) { /* se reintentará más adelante */ }
    }
}

// Actualiza en el lugar solo las miniaturas puntuales que acaban de generarse,
// sin tocar el resto de la cuadrícula. Antes esto se resolvía llamando a
// refreshActiveView(), que reconstruye TODA la vista desde cero — eso reiniciaba
// el scroll a cero y mostraba de nuevo el spinner de carga cada vez que
// terminaba un lote, justo mientras el usuario podía estar mirando o
// desplazándose por sus fotos. Esta versión no mueve ni un píxel lo que ya
// está en pantalla; solo hace que la miniatura puntual "aparezca" cuando está lista.
function patchVideoThumbnailsInPlace(photoIds) {
    photoIds.forEach(id => {
        document.querySelectorAll(`.photo-item[data-id="${id}"]`).forEach(item => {
            const img = item.querySelector('img');
            if (!img) return;
            img.style.display = '';
            img.src = `/api/thumbnail?id=${id}&size=400&_r=${Date.now()}`;
            const fallbackIcon = item.querySelector('.video-no-thumb-icon');
            if (fallbackIcon) fallbackIcon.remove();
        });
    });
}

async function videoScannerLoop() {
    while (true) {
        try {
            const { videos } = await API.get(`/api/videos/unthumbed?limit=${VIDEO_BATCH_SIZE}`);
            if (!videos || videos.length === 0) {
                await sleep(20000);
                continue;
            }

            const processedIds = [];
            for (const v of videos) {
                await processOneVideo(v.id);
                processedIds.push(v.id);
                await sleep(document.hidden ? VIDEO_YIELD_MS * 4 : VIDEO_YIELD_MS);
            }

            patchVideoThumbnailsInPlace(processedIds);
        } catch (e) {
            console.warn('[video-scanner] Error en el ciclo de miniaturas de video:', e.message);
            await sleep(15000);
        }
    }
}

document.addEventListener('DOMContentLoaded', () => {
    if (videoScannerStarted) return;
    videoScannerStarted = true;
    setTimeout(() => { videoScannerLoop(); }, 4000);
});
