// ============================================================
// face-scanner.js — Reconocimiento facial en segundo plano.
//
// Corre ENTERAMENTE en el navegador con face-api.js (modelos servidos
// desde public/models/, sin ningún servicio externo): ninguna foto ni
// dato biométrico sale de esta PC. Va procesando las fotos de a una,
// cediendo el control entre cada una para no competir con la interfaz,
// y respeta el interruptor "Reconocimiento facial" de Configuración.
//
// Esta pieza estaba referenciada en index.html en la versión anterior
// de la app pero el archivo no existía, así que la sección "Personas"
// nunca llegaba a tener datos. Este archivo la completa.
// ============================================================

const FACE_MODELS_URL = 'models';
const FACE_BATCH_SIZE = 40;
const YIELD_MS = 120;

let faceApiReady = false;
let faceApiLoadAttempted = false;
let faceScannerStarted = false;

async function ensureFaceApiLoaded() {
    if (faceApiReady) return true;
    if (faceApiLoadAttempted) return faceApiReady;
    faceApiLoadAttempted = true;

    if (typeof faceapi === 'undefined') {
        console.warn('[face-scanner] face-api.js no está disponible. El reconocimiento facial se mantendrá desactivado.');
        return false;
    }

    try {
        await Promise.all([
            faceapi.nets.tinyFaceDetector.loadFromUri(FACE_MODELS_URL),
            faceapi.nets.faceLandmark68Net.loadFromUri(FACE_MODELS_URL),
            faceapi.nets.faceRecognitionNet.loadFromUri(FACE_MODELS_URL)
        ]);
        faceApiReady = true;
        console.log('[face-scanner] Modelos cargados. El reconocimiento facial corre localmente en tu navegador.');
        return true;
    } catch (e) {
        console.warn('[face-scanner] No se pudieron cargar los modelos de reconocimiento facial:', e.message);
        return false;
    }
}

function loadImageElement(url) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error('No se pudo cargar la imagen'));
        img.src = url;
    });
}

// Usa la miniatura (no el original) para detectar caras: es mucho más rápido y
// liviano, ya está cacheada por el servidor, y alcanza sobra de resolución para
// generar un descriptor facial confiable.
async function detectFacesForPhoto(photoId) {
    const img = await loadImageElement(`/api/thumbnail?id=${photoId}&size=400`);
    if (!img.naturalWidth || !img.naturalHeight) return [];

    const detections = await faceapi
        .detectAllFaces(img, new faceapi.TinyFaceDetectorOptions({ inputSize: 320, scoreThreshold: 0.5 }))
        .withFaceLandmarks()
        .withFaceDescriptors();

    // Filtro de calidad: se descartan las caras demasiado chicas (< 40px en la
    // miniatura de 400px). Las caras minúsculas generan descriptores "ruidosos" que
    // ensucian el agrupamiento y crean personas falsas de una sola foto.
    return detections
        .filter(d => d.detection.box.width >= 40 && d.detection.box.height >= 40)
        .map(d => ({
            box: {
                x: Math.max(0, d.detection.box.x / img.naturalWidth),
                y: Math.max(0, d.detection.box.y / img.naturalHeight),
                width: Math.min(1, d.detection.box.width / img.naturalWidth),
                height: Math.min(1, d.detection.box.height / img.naturalHeight)
            },
            descriptor: Array.from(d.descriptor)
        }));
}

async function processOnePhoto(photoId) {
    try {
        const faces = await detectFacesForPhoto(photoId);
        await API.post(`/api/photos/${photoId}/faces`, { faces });
        return faces.length;
    } catch (e) {
        console.warn(`[face-scanner] No se pudo analizar la foto ${photoId}, se omite:`, e.message);
        // Aun si falla, se marca como "ya escaneada" para no reintentarla en bucle infinito.
        try { await API.post(`/api/photos/${photoId}/faces`, { faces: [] }); } catch (e2) { /* se reintentará más adelante */ }
        return 0;
    }
}

async function faceScannerLoop() {
    while (true) {
        try {
            const config = await API.get('/api/config');
            if (config.faceRecognitionEnabled === false) {
                window.scanStatus.faceScanning = false;
                await sleep(10000);
                continue;
            }

            const ready = await ensureFaceApiLoaded();
            if (!ready) {
                window.scanStatus.faceScanning = false;
                await sleep(30000);
                continue;
            }

            const unscannedRes = await API.get(`/api/photos/unscanned?limit=${FACE_BATCH_SIZE}`);
            const photos = unscannedRes.photos || [];
            const totalEligible = unscannedRes.totalEligible || 0;
            const scannedCount = unscannedRes.scannedCount || 0;

            if (!photos || photos.length === 0) {
                window.scanStatus.faceScanning = false;
                window.scanStatus.faceScannedCount = scannedCount;
                window.scanStatus.faceTotalCount = totalEligible;
                if (typeof updateFacesIndicator === 'function') updateFacesIndicator();
                await sleep(15000);
                continue;
            }

            window.scanStatus.faceScanning = true;
            window.scanStatus.faceTotalCount = totalEligible;
            window.scanStatus.faceScannedCount = scannedCount;
            if (typeof updateFacesIndicator === 'function') updateFacesIndicator();

            let facesFoundThisBatch = 0;
            for (const p of photos) {
                facesFoundThisBatch += await processOnePhoto(p.id);
                window.scanStatus.faceScannedCount++;
                if (typeof updateFacesIndicator === 'function') updateFacesIndicator();
                await sleep(document.hidden ? YIELD_MS * 4 : YIELD_MS);
            }

            // Reagrupar SOLO si este lote realmente aportó caras nuevas. Antes se
            // reagrupaba cada 25 fotos Y al final de cada lote, aun cuando el lote no
            // tuviera ninguna cara (paisajes, capturas de pantalla, etc.). Como el
            // reagrupado es O(caras × personas), en bibliotecas grandes eso repetía un
            // cálculo caro cientos de veces sin aportar nada. Así, "Personas" se sigue
            // actualizando a medida que aparecen caras, pero sin trabajo desperdiciado.
            if (facesFoundThisBatch > 0) {
                try { await API.post('/api/faces/cluster', {}); } catch (e) { /* no crítico */ }
            }
        } catch (e) {
            console.warn('[face-scanner] Error en el ciclo de reconocimiento facial:', e.message);
            await sleep(10000);
        }
    }
}

document.addEventListener('DOMContentLoaded', () => {
    if (faceScannerStarted) return;
    faceScannerStarted = true;
    // Arranca en segundo plano unos segundos después de cargar, para no competir
    // con la carga inicial de la interfaz y las miniaturas visibles.
    setTimeout(() => { faceScannerLoop(); }, 3000);
});
