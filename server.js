const express = require('express');
const path = require('path');
const fs = require('fs');
const https = require('https');
const sharp = require('sharp');
const archiver = require('archiver');
const { spawn, exec, execFile } = require('child_process');

let FFMPEG_BIN = 'ffmpeg';
try {
    const ffmpegStatic = require('ffmpeg-static');
    if (ffmpegStatic && typeof ffmpegStatic === 'string') {
        FFMPEG_BIN = ffmpegStatic.replace('app.asar' + path.sep, 'app.asar.unpacked' + path.sep);
    }
} catch (e) {
    // fallback al ejecutable en PATH si no estuviera el paquete
}

const db = require('./database');
const scanner = require('./scanner');
const mediaActions = require('./mediaActions');
const { CACHE_DIR, TRASH_DIR, THUMBNAIL_SIZES, thumbnailCachePath, faceCachePath, isPathUnderFolder } = require('./paths');
const { mimeFor } = require('./mediaTypes');
const { displayDimensions } = require('./exifUtils');
const { mapWithConcurrency } = require('./concurrency');

const app = express();
const PORT = process.env.PORT || 8080;

[CACHE_DIR, TRASH_DIR].forEach(dir => {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

// --- Seguridad ---
// El servidor original usaba cors() abierto a cualquier origen. Como este servidor
// puede leer y listar todas tus fotos, y además puede lanzar aplicaciones del sistema
// (abrir fotos con la app por defecto), eso significaba que CUALQUIER página web que
// visitaras mientras la app estuviera corriendo podía hacerle peticiones desde el
// navegador (un patrón de ataque conocido contra servidores locales). Como el propio
// frontend se sirve desde este mismo servidor, no hace falta CORS para que la app
// funcione: las peticiones de la app a sí misma siempre son "mismo origen". Este
// middleware sencillamente rechaza peticiones que cambian datos (todo menos GET/HEAD)
// si vienen con un header Origin que no coincide con este servidor.
function originGuard(req, res, next) {
    if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') return next();
    const origin = req.headers.origin;
    if (!origin) return next();
    try {
        if (new URL(origin).host === req.headers.host) return next();
    } catch (e) {
        // Origin mal formado: lo tratamos igual que un origen no permitido
    }
    return res.status(403).json({ error: 'Origen no permitido' });
}

app.use(originGuard);
app.use(express.json({ limit: '15mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// Streaming con soporte de Range (necesario para poder reproducir y buscar dentro
// de videos; sin esto el navegador tiene que descargar el archivo entero antes de
// poder reproducirlo, y no puede saltar a un punto concreto).
function streamFile(req, res, filePath, extraHeaders = {}) {
    try {
        const stat = fs.statSync(filePath);
        const contentType = mimeFor(path.extname(filePath));
        Object.entries(extraHeaders).forEach(([k, v]) => res.setHeader(k, v));
        res.setHeader('Content-Type', contentType);
        res.setHeader('Accept-Ranges', 'bytes');

        const range = req.headers.range;
        if (range) {
            const match = /bytes=(\d*)-(\d*)/.exec(range);
            let start = match && match[1] !== '' ? parseInt(match[1], 10) : 0;
            let end = match && match[2] !== '' ? parseInt(match[2], 10) : stat.size - 1;
            if (Number.isNaN(start) || start < 0) start = 0;
            if (Number.isNaN(end) || end >= stat.size) end = stat.size - 1;
            if (start > end || start >= stat.size) {
                res.status(416).setHeader('Content-Range', `bytes */${stat.size}`).end();
                return;
            }
            res.status(206);
            res.setHeader('Content-Range', `bytes ${start}-${end}/${stat.size}`);
            res.setHeader('Content-Length', end - start + 1);
            fs.createReadStream(filePath, { start, end }).pipe(res);
        } else {
            res.setHeader('Content-Length', stat.size);
            fs.createReadStream(filePath).pipe(res);
        }
    } catch (e) {
        if (!res.headersSent) {
            console.error('Error enviando archivo:', filePath, e.message);
            res.status(500).send('Error al enviar archivo');
        }
    }
}

// ============================== Config / Escaneo ==============================

app.get('/api/config', (req, res) => { res.json(db.config); });

app.post('/api/config', async (req, res) => {
    const { folders, clusterThreshold, faceRecognitionEnabled, trashRetentionDays, showHebrewDate, sortByHebrewDate, memoriesHebrewDate, scanOnStartup } = req.body || {};
    const patch = {};
    if (folders !== undefined) {
        if (!Array.isArray(folders)) return res.status(400).json({ error: 'folders debe ser un array' });
        patch.folders = folders.map(f => path.normalize(String(f).trim())).filter(f => f.length > 0);
    }
    if (clusterThreshold !== undefined) patch.clusterThreshold = clusterThreshold;
    if (faceRecognitionEnabled !== undefined) patch.faceRecognitionEnabled = faceRecognitionEnabled;
    if (trashRetentionDays !== undefined) patch.trashRetentionDays = trashRetentionDays;
    if (showHebrewDate !== undefined) patch.showHebrewDate = showHebrewDate;
    if (sortByHebrewDate !== undefined) patch.sortByHebrewDate = sortByHebrewDate;
    if (memoriesHebrewDate !== undefined) patch.memoriesHebrewDate = memoriesHebrewDate;
    if (scanOnStartup !== undefined) patch.scanOnStartup = scanOnStartup;
    await db.saveConfig(patch);
    res.json({ success: true, config: db.config });
});

app.post('/api/browse-folder', (req, res) => {
    // IMPORTANTE: se fuerza la salida de PowerShell a UTF-8 antes de escribir la ruta.
    // Sin esto, PowerShell emite en la página de códigos de la consola (no UTF-8) y las
    // rutas con caracteres no-ASCII (hebreo, árabe, tildes, etc.) llegaban a Node como
    // signos de pregunta "?" — por eso "Explorar" no servía con carpetas en hebreo.
    const psScript = '[Console]::OutputEncoding=[System.Text.Encoding]::UTF8; [System.Reflection.Assembly]::LoadWithPartialName("System.windows.forms") | Out-Null; $f = New-Object System.Windows.Forms.FolderBrowserDialog; $f.ShowNewFolderButton = $true; if ($f.ShowDialog() -eq "OK") { [Console]::Out.Write($f.SelectedPath) }';
    execFile('powershell.exe', ['-NoProfile', '-Command', psScript], { encoding: 'utf8' }, (error, stdout) => {
        if (error) {
            console.error('[server] Error al abrir el explorador de carpetas:', error.message);
            return res.status(500).json({ error: 'No se pudo abrir el explorador' });
        }
        const folderPath = (stdout || '').trim();
        res.json({ folderPath });
    });
});

app.get('/api/scan/status', (req, res) => {
    res.json({
        scanning: scanner.getIsScanning(),
        totalPhotos: db.photos.filter(p => !p.trashedAt).length,
        details: scanner.getScanState()
    });
});

app.post('/api/scan/start', (req, res) => {
    if (scanner.getIsScanning()) return res.json({ status: 'already_scanning' });
    scanner.startScan()
        .then(() => console.log('[server] Escaneo completado'))
        .catch(err => console.error('[server] Error en escaneo:', err));
    res.json({ status: 'started' });
});

// ============================== Fotos ==============================

app.get('/api/photos', (req, res) => {
    const { folder, personId, search, view, albumId } = req.query;
    let list = db.photos;

    if (view === 'trash') {
        list = list.filter(p => p.trashedAt);
    } else {
        list = list.filter(p => !p.trashedAt);
        if (view === 'favorites') list = list.filter(p => p.favorite);
        else if (view === 'videos') list = list.filter(p => p.isVideo);
    }

    if (albumId) {
        const album = db.getAlbum(albumId);
        const idSet = new Set(album ? album.photoIds : []);
        list = list.filter(p => idSet.has(p.id));
    }

    if (folder) list = list.filter(p => isPathUnderFolder(p.path, folder));

    if (personId) {
        const ids = new Set(db.faces.filter(f => f.clusterId === personId).map(f => f.photoId));
        list = list.filter(p => ids.has(p.id));
    }

    if (search) {
        const q = search.toLowerCase();
        const byPerson = new Set(db.faces.filter(f => f.name && f.name.toLowerCase().includes(q)).map(f => f.photoId));
        list = list.filter(p => p.filename.toLowerCase().includes(q) || p.path.toLowerCase().includes(q) || byPerson.has(p.id));
    }

    // Ordenar por fecha (más nuevo primero). Se calcula el timestamp UNA vez por foto en
    // vez de crear dos objetos Date en cada comparación: con decenas de miles de fotos, el
    // ordenamiento hace O(n log n) comparaciones, así que parsear la fecha ahí dentro
    // multiplicaba por ~log n el trabajo. Ahora es O(n) parseos + un sort numérico simple.
    const sortKey = view === 'trash' ? 'trashedAt' : 'dateTaken';
    list = list
        .map(p => ({ p, t: new Date(p[sortKey]).getTime() || 0 }))
        .sort((a, b) => b.t - a.t)
        .map(x => x.p);

    res.json(list);
});

app.get('/api/storage', async (req, res) => {
    const active = db.photos.filter(p => !p.trashedAt);
    const trashed = db.photos.filter(p => p.trashedAt);

    let disk = null;
    const firstFolder = db.config.folders[0];
    try {
        if (firstFolder && typeof fs.promises.statfs === 'function') {
            const info = await fs.promises.statfs(firstFolder);
            disk = { totalBytes: info.blocks * info.bsize, freeBytes: info.bfree * info.bsize };
        }
    } catch (e) {
        disk = null; // fs.statfs no disponible en este Node/SO, o la carpeta no existe todavía
    }

    res.json({
        totalPhotos: active.length,
        totalVideos: active.filter(p => p.isVideo).length,
        totalBytes: active.reduce((sum, p) => sum + (p.size || 0), 0),
        trashCount: trashed.length,
        trashBytes: trashed.reduce((sum, p) => sum + (p.size || 0), 0),
        disk,
        folders: db.config.folders.map(f => ({ path: f, exists: fs.existsSync(f) }))
    });
});

app.get('/api/photo/:id', (req, res) => {
    const photo = db.getPhotoById(req.params.id);
    if (!photo || !fs.existsSync(photo.path)) return res.status(404).json({ error: 'Foto no encontrada' });
    streamFile(req, res, photo.path);
});

app.post('/api/photo/:id/open', (req, res) => {
    const photo = db.getPhotoById(req.params.id);
    if (!photo || !fs.existsSync(photo.path)) return res.status(404).json({ error: 'Foto no encontrada' });

    let command, args;
    if (process.platform === 'win32') { command = 'explorer.exe'; args = [photo.path]; }
    else if (process.platform === 'darwin') { command = 'open'; args = [photo.path]; }
    else { command = 'xdg-open'; args = [photo.path]; }

    try {
        const child = spawn(command, args, { detached: true, stdio: 'ignore' });
        // Importante: sin este listener, si el comando no existe en el sistema
        // (por ejemplo, esta app corriendo en un SO sin xdg-open configurado), el
        // evento 'error' del proceso hijo queda sin manejar y Node lo trata como una
        // excepción no capturada que TUMBA TODO EL SERVIDOR, no solo esta petición.
        child.on('error', (err) => {
            console.error('No se pudo abrir el archivo con la aplicación del sistema:', err.message);
        });
        child.unref();
        res.json({ success: true });
    } catch (e) {
        console.error('Error al abrir archivo:', e.message);
        res.status(500).json({ error: 'No se pudo abrir el archivo' });
    }
});

// ============================== Miniaturas ==============================

const thumbInProgress = new Map();

async function generateThumbnail(photo, size) {
    const cachePath = thumbnailCachePath(photo.id, size);
    // .rotate() sin argumentos = auto-orientar según la etiqueta EXIF. Sin esto, las
    // fotos verticales de celular salen giradas 90° en la miniatura.
    const img = sharp(photo.path, { failOn: 'none' }).rotate();
    const metadata = await img.metadata();

    if (!photo.width || !photo.height) {
        const dims = displayDimensions(metadata.width, metadata.height, metadata.orientation);
        db.updatePhotoDimensions(photo.id, dims.width, dims.height);
    }

    await img
        .resize(size, size, { fit: 'inside', withoutEnlargement: true })
        .jpeg({ quality: size > 400 ? 85 : 80 })
        .toFile(cachePath);
    return cachePath;
}

async function generateVideoThumbnail(photo, size = 400) {
    const key = `video_${photo.id}`;
    if (thumbInProgress.has(key)) {
        try { await thumbInProgress.get(key); } catch (e) {}
        const cp = thumbnailCachePath(photo.id, size);
        return fs.existsSync(cp) ? cp : null;
    }

    const promise = (async () => {
        const tmpFramePath = path.join(CACHE_DIR, `tmp_vidframe_${photo.id}_${Date.now()}.jpg`);
        try {
            const seekSec = (photo.duration && photo.duration > 1.5) ? '00:00:01' : '00:00:00';
            await new Promise((resolve, reject) => {
                execFile(FFMPEG_BIN, ['-ss', seekSec, '-i', photo.path, '-vframes', '1', '-q:v', '2', tmpFramePath, '-y'], { windowsHide: true }, (err) => err ? reject(err) : resolve());
            });

            if (fs.existsSync(tmpFramePath)) {
                await Promise.all(THUMBNAIL_SIZES.map(sz =>
                    sharp(tmpFramePath)
                        .resize(sz, sz, { fit: 'inside', withoutEnlargement: true })
                        .jpeg({ quality: 82 })
                        .toFile(thumbnailCachePath(photo.id, sz))
                ));
                db.setVideoThumbGenerated(photo.id, true);
                try { fs.unlinkSync(tmpFramePath); } catch (e) {}
                return thumbnailCachePath(photo.id, size);
            }
        } catch (e1) {
            try {
                await new Promise((resolve, reject) => {
                    execFile(FFMPEG_BIN, ['-ss', '00:00:00', '-i', photo.path, '-vframes', '1', '-q:v', '2', tmpFramePath, '-y'], { windowsHide: true }, (err) => err ? reject(err) : resolve());
                });
                if (fs.existsSync(tmpFramePath)) {
                    await Promise.all(THUMBNAIL_SIZES.map(sz =>
                        sharp(tmpFramePath)
                            .resize(sz, sz, { fit: 'inside', withoutEnlargement: true })
                            .jpeg({ quality: 82 })
                            .toFile(thumbnailCachePath(photo.id, sz))
                    ));
                    db.setVideoThumbGenerated(photo.id, true);
                    try { fs.unlinkSync(tmpFramePath); } catch (e) {}
                    return thumbnailCachePath(photo.id, size);
                }
            } catch (e2) {
                console.warn(`[server] No se pudo generar miniatura para el video ${photo.filename}:`, e2.message);
            }
        }
        try { if (fs.existsSync(tmpFramePath)) fs.unlinkSync(tmpFramePath); } catch (e) {}
        return null;
    })();

    thumbInProgress.set(key, promise);
    try {
        return await promise;
    } finally {
        thumbInProgress.delete(key);
    }
}

app.get('/api/thumbnail', async (req, res) => {
    const { id } = req.query;
    if (!id) return res.status(400).send('ID requerido');

    let size = parseInt(req.query.size, 10);
    if (!THUMBNAIL_SIZES.includes(size)) size = 400; // lista blanca: evita tamaños arbitrarios vía query param

    const photo = db.getPhotoById(id);
    if (!photo || !fs.existsSync(photo.path)) return res.status(404).send('Foto no encontrada');

    const cachePath = thumbnailCachePath(id, size);
    if (fs.existsSync(cachePath)) {
        res.setHeader('Cache-Control', 'public, max-age=31536000');
        return streamFile(req, res, cachePath);
    }

    if (photo.isVideo) {
        const generatedPath = await generateVideoThumbnail(photo, size);
        if (generatedPath && fs.existsSync(generatedPath)) {
            res.setHeader('Cache-Control', 'public, max-age=31536000');
            return streamFile(req, res, generatedPath);
        }
        return res.status(404).send('Miniatura de video aún no generada');
    }

    const key = `${id}_${size}`;
    if (thumbInProgress.has(key)) {
        try { await thumbInProgress.get(key); } catch (e) {}
        if (fs.existsSync(cachePath)) {
            res.setHeader('Cache-Control', 'public, max-age=31536000');
            return streamFile(req, res, cachePath);
        }
        return streamFile(req, res, photo.path);
    }

    const promise = generateThumbnail(photo, size);
    thumbInProgress.set(key, promise);
    try {
        await promise;
        res.setHeader('Cache-Control', 'public, max-age=31536000');
        streamFile(req, res, cachePath);
    } catch (e) {
        console.error('Error generando miniatura:', photo.filename, e.message);
        streamFile(req, res, photo.path);
    } finally {
        thumbInProgress.delete(key);
    }
});

// Recibe una miniatura ya capturada por el navegador para un video (ver
// public/video-scanner.js: captura un frame con <video>+<canvas>, algo que sharp no
// puede hacer del lado del servidor sin depender de ffmpeg).
app.post('/api/thumbnail/:id', async (req, res) => {
    const photo = db.getPhotoById(req.params.id);
    if (!photo) return res.status(404).json({ error: 'Foto no encontrada' });

    const { imageBase64, duration, width, height } = req.body || {};

    if (typeof duration === 'number' && duration > 0) db.setPhotoDuration(photo.id, duration);
    if (width && height && (!photo.width || !photo.height)) db.updatePhotoDimensions(photo.id, width, height);

    if (!imageBase64 || typeof imageBase64 !== 'string') {
        // El navegador no pudo generar un frame (códec no soportado, etc.). Se marca
        // igual como "intentado" para no reintentarlo en bucle infinito; el video
        // se sigue viendo en la biblioteca, solo sin miniatura (ver createPhotoItemElement).
        db.setVideoThumbGenerated(photo.id, true);
        return res.json({ success: true, skipped: true });
    }

    try {
        const base64Data = imageBase64.replace(/^data:image\/\w+;base64,/, '');
        const buffer = Buffer.from(base64Data, 'base64');
        if (buffer.length > 5 * 1024 * 1024) return res.status(413).json({ error: 'Imagen demasiado grande' });

        await Promise.all(THUMBNAIL_SIZES.map(size =>
            sharp(buffer)
                .resize(size, size, { fit: 'inside', withoutEnlargement: true })
                .jpeg({ quality: 82 })
                .toFile(thumbnailCachePath(photo.id, size))
        ));

        db.setVideoThumbGenerated(photo.id, true);
        res.json({ success: true });
    } catch (e) {
        console.error('Error guardando miniatura de video:', e.message);
        res.status(500).json({ error: 'Error procesando miniatura' });
    }
});

app.get('/api/videos/unthumbed', (req, res) => {
    const limit = Math.min(200, parseInt(req.query.limit, 10) || 20);
    const pending = [];
    for (const p of db.photos) {
        if (pending.length >= limit) break;
        if (!p.trashedAt && p.isVideo && !p.videoThumbGenerated) pending.push({ id: p.id });
    }
    res.json({ videos: pending });
});

// ============================== Favoritos / Papelera / Álbumes (acciones) ==============================

app.post('/api/photos/batch', async (req, res) => {
    const { ids, action, albumId } = req.body || {};
    if (!Array.isArray(ids) || ids.length === 0) return res.status(400).json({ error: 'ids debe ser un array no vacío' });
    if (!action) return res.status(400).json({ error: 'action requerida' });

    try {
        switch (action) {
            case 'favorite':
                return res.json({ success: true, count: db.toggleFavorite(ids, true) });
            case 'unfavorite':
                return res.json({ success: true, count: db.toggleFavorite(ids, false) });
            case 'trash':
                return res.json({ success: true, ...(await mediaActions.trashPhotos(ids)) });
            case 'restore':
                return res.json({ success: true, ...(await mediaActions.restorePhotos(ids)) });
            case 'deleteForever':
                return res.json({ success: true, ...(await mediaActions.deletePhotosForever(ids)) });
            case 'addToAlbum': {
                if (!albumId) return res.status(400).json({ error: 'albumId requerido' });
                const album = db.addPhotosToAlbum(albumId, ids);
                if (!album) return res.status(404).json({ error: 'Álbum no encontrado' });
                return res.json({ success: true, album });
            }
            case 'removeFromAlbum': {
                if (!albumId) return res.status(400).json({ error: 'albumId requerido' });
                const album = db.removePhotosFromAlbum(albumId, ids);
                if (!album) return res.status(404).json({ error: 'Álbum no encontrado' });
                return res.json({ success: true, album });
            }
            case 'changeDate': {
                const { dateTaken } = req.body || {};
                if (!dateTaken) return res.status(400).json({ error: 'dateTaken requerida' });
                return res.json({ success: true, count: db.updatePhotoDates(ids, dateTaken) });
            }
            default:
                return res.status(400).json({ error: `Acción desconocida: ${action}` });
        }
    } catch (e) {
        console.error('Error en acción por lotes:', action, e.message);
        res.status(500).json({ error: 'Error al procesar la acción' });
    }
});

app.post('/api/photos/:id/date', (req, res) => {
    const { dateTaken } = req.body || {};
    if (!dateTaken) return res.status(400).json({ error: 'dateTaken requerida' });
    const success = db.updatePhotoDate(req.params.id, dateTaken);
    if (!success) return res.status(404).json({ error: 'Foto no encontrada' });
    res.json({ success: true });
});

app.post('/api/trash/empty', async (req, res) => {
    try {
        res.json({ success: true, ...(await mediaActions.emptyTrash()) });
    } catch (e) {
        console.error('Error vaciando la papelera:', e.message);
        res.status(500).json({ error: 'Error al vaciar la papelera' });
    }
});

app.get('/api/download/zip', async (req, res) => {
    const idsParam = req.query.ids;
    if (!idsParam) return res.status(400).json({ error: 'ids requerido' });
    const ids = String(idsParam).split(',').map(s => s.trim()).filter(Boolean);
    const photos = ids.map(id => db.getPhotoById(id)).filter(p => p && fs.existsSync(p.path));
    if (photos.length === 0) return res.status(404).json({ error: 'No se encontraron fotos' });

    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="fotos-${Date.now()}.zip"`);

    const archive = archiver('zip', { zlib: { level: 6 } });
    archive.on('error', (err) => {
        console.error('Error creando zip:', err.message);
        if (!res.headersSent) res.status(500).end();
    });
    archive.pipe(res);

    const usedNames = new Set();
    for (const photo of photos) {
        let name = photo.filename;
        let n = 1;
        while (usedNames.has(name)) {
            const ext = path.extname(photo.filename);
            name = `${path.basename(photo.filename, ext)} (${n})${ext}`;
            n++;
        }
        usedNames.add(name);
        archive.file(photo.path, { name });
    }
    await archive.finalize();
});

// ============================== Álbumes ==============================

app.get('/api/albums', (req, res) => {
    const list = db.albums.map(a => ({ ...a, photoCount: a.photoIds.length }));
    list.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
    res.json(list);
});

app.post('/api/albums', (req, res) => {
    const album = db.createAlbum(req.body && req.body.name);
    res.json({ success: true, album });
});

app.get('/api/albums/:id', (req, res) => {
    const album = db.getAlbum(req.params.id);
    if (!album) return res.status(404).json({ error: 'Álbum no encontrado' });
    res.json(album);
});

app.put('/api/albums/:id', async (req, res) => {
    let album = db.getAlbum(req.params.id);
    if (!album) return res.status(404).json({ error: 'Álbum no encontrado' });
    const { name, coverPhotoId } = req.body || {};
    if (name !== undefined) album = db.renameAlbum(req.params.id, name);
    if (coverPhotoId !== undefined) album = db.setAlbumCover(req.params.id, coverPhotoId);
    res.json({ success: true, album });
});

app.delete('/api/albums/:id', async (req, res) => {
    const existed = await db.deleteAlbum(req.params.id);
    if (!existed) return res.status(404).json({ error: 'Álbum no encontrado' });
    res.json({ success: true });
});

app.post('/api/albums/:id/photos', (req, res) => {
    const { photoIds } = req.body || {};
    if (!Array.isArray(photoIds)) return res.status(400).json({ error: 'photoIds debe ser un array' });
    const album = db.addPhotosToAlbum(req.params.id, photoIds);
    if (!album) return res.status(404).json({ error: 'Álbum no encontrado' });
    res.json({ success: true, album });
});

app.delete('/api/albums/:id/photos', (req, res) => {
    const { photoIds } = req.body || {};
    if (!Array.isArray(photoIds)) return res.status(400).json({ error: 'photoIds debe ser un array' });
    const album = db.removePhotosFromAlbum(req.params.id, photoIds);
    if (!album) return res.status(404).json({ error: 'Álbum no encontrado' });
    res.json({ success: true, album });
});

// ============================== Caras / Personas ==============================

app.get('/api/photos/unscanned', (req, res) => {
    const limit = Math.min(200, parseInt(req.query.limit, 10) || 50);
    const pending = [];
    let scannedCount = 0;
    let totalEligible = 0;

    for (const p of db.photos) {
        if (!p.trashedAt && !p.isVideo) {
            totalEligible++;
            if (p.facesScanned) {
                scannedCount++;
            } else if (pending.length < limit) {
                pending.push({ id: p.id });
            }
        }
    }

    res.json({
        photos: pending,
        totalEligible,
        scannedCount,
        unscannedCount: totalEligible - scannedCount,
        remainingAtLeast: pending.length >= limit
    });
});

app.get('/api/photos/:id/faces', (req, res) => {
    const photo = db.getPhotoById(req.params.id);
    if (!photo) return res.status(404).json({ error: 'Foto no encontrada' });
    res.json(db.getFacesForPhoto(photo.id));
});

app.post('/api/photos/:id/faces', (req, res) => {
    const photoId = req.params.id;
    const photo = db.getPhotoById(photoId);
    if (!photo) return res.status(404).json({ error: 'Foto no encontrada' });
    const { faces } = req.body || {};
    if (!Array.isArray(faces)) return res.status(400).json({ error: 'faces debe ser un array' });

    db.clearFacesForPhoto(photoId);
    faces.forEach((f, i) => {
        if (!f || !f.box || !Array.isArray(f.descriptor) || f.descriptor.length !== 128) return;
        db.addFace({
            id: `${photoId}_f${i}_${Date.now()}`,
            photoId,
            photoPath: photo.path,
            box: f.box,
            descriptor: f.descriptor,
            clusterId: null,
            name: null
        });
    });
    db.setPhotoFacesScanned(photoId, true);
    res.json({ success: true, facesRegistered: faces.length });
});

app.get('/api/people', (req, res) => {
    const groups = {};
    db.faces.forEach(f => {
        if (!f.clusterId) return;
        if (!groups[f.clusterId]) {
            groups[f.clusterId] = { id: f.clusterId, name: db.getClusterName(f.clusterId) || 'Sin nombre', facesCount: 0, coverFace: f };
        }
        groups[f.clusterId].facesCount++;
    });
    res.json(Object.values(groups).sort((a, b) => b.facesCount - a.facesCount));
});

app.post('/api/people/:id/name', async (req, res) => {
    const { name } = req.body || {};
    if (!name || !String(name).trim()) return res.status(400).json({ error: 'Nombre requerido' });
    await db.updateClusterName(req.params.id, String(name).trim());
    res.json({ success: true });
});

app.post('/api/people/merge', async (req, res) => {
    const { clusterIds } = req.body || {};
    if (!Array.isArray(clusterIds) || clusterIds.length < 2) {
        return res.status(400).json({ error: 'Se requieren al menos 2 clusterIds para agrupar' });
    }

    const matchingClusters = db.clusters.filter(c => clusterIds.includes(c.id));
    const faceCounts = {};
    db.faces.forEach(f => { if (f.clusterId) faceCounts[f.clusterId] = (faceCounts[f.clusterId] || 0) + 1; });

    const sortedClusters = [...matchingClusters].sort((a, b) => {
        const aHasName = a.name && a.name !== 'Sin nombre';
        const bHasName = b.name && b.name !== 'Sin nombre';
        if (aHasName && !bHasName) return -1;
        if (!aHasName && bHasName) return 1;
        return (faceCounts[b.id] || 0) - (faceCounts[a.id] || 0);
    });

    let targetClusterId = sortedClusters.length > 0 ? sortedClusters[0].id : clusterIds[0];
    let targetName = sortedClusters.length > 0 ? sortedClusters[0].name : 'Sin nombre';

    if (targetName === 'Sin nombre') {
        const namedFace = db.faces.find(f => clusterIds.includes(f.clusterId) && f.name && f.name !== 'Sin nombre');
        if (namedFace) targetName = namedFace.name;
    }

    if (targetName !== 'Sin nombre') {
        let dbTarget = db.clusters.find(c => c.id === targetClusterId);
        if (!dbTarget) db.clusters.push({ id: targetClusterId, name: targetName });
        else dbTarget.name = targetName;
    }

    db.faces.forEach(f => {
        if (clusterIds.includes(f.clusterId)) {
            f.clusterId = targetClusterId;
            f.name = targetName;
        }
    });

    db.clusters = db.clusters.filter(c => !clusterIds.includes(c.id) || c.id === targetClusterId);
    await db.saveAll();

    res.json({ success: true, targetClusterId, targetName });
});

app.get('/api/face-image/:faceId', async (req, res) => {
    const face = db.getFaceById(req.params.faceId);
    if (!face) return res.status(404).send('Cara no encontrada');
    const photo = db.getPhotoById(face.photoId);
    if (!photo || !fs.existsSync(photo.path)) return res.status(404).send('Foto original no encontrada');

    const cachePath = faceCachePath(face.id);
    if (fs.existsSync(cachePath)) {
        res.setHeader('Cache-Control', 'public, max-age=31536000');
        return streamFile(req, res, cachePath);
    }

    try {
        const metadata = await sharp(photo.path).metadata();
        const { width: w, height: h } = displayDimensions(metadata.width, metadata.height, metadata.orientation);
        if (!photo.width || !photo.height) db.updatePhotoDimensions(photo.id, w, h);

        const bx = Math.max(0, Math.floor(face.box.x * w));
        const by = Math.max(0, Math.floor(face.box.y * h));
        const bw = Math.min(w - bx, Math.floor(face.box.width * w));
        const bh = Math.min(h - by, Math.floor(face.box.height * h));

        const mx = Math.floor(bw * 0.25), my = Math.floor(bh * 0.25);
        const cx = Math.max(0, bx - mx), cy = Math.max(0, by - my);
        const cw = Math.min(w - cx, bw + mx * 2), ch = Math.min(h - cy, bh + my * 2);

        await sharp(photo.path)
            .rotate() // auto-orientar ANTES de recortar: face.box está normalizado en el
                      // espacio de la imagen ya orientada correctamente (así es como se
                      // detectó en el navegador), así que hay que recortar sobre esa misma
                      // orientación o el recorte queda desplazado en fotos verticales.
            .extract({ left: cx, top: cy, width: Math.max(1, cw), height: Math.max(1, ch) })
            .resize(120, 120)
            .jpeg({ quality: 88 })
            .toFile(cachePath);

        res.setHeader('Cache-Control', 'public, max-age=31536000');
        streamFile(req, res, cachePath);
    } catch (e) {
        console.error('Error recortando cara:', e.message);
        res.status(500).send('Error procesando recorte');
    }
});

app.post('/api/faces/cluster', async (req, res) => {
    try {
        const validFaces = db.faces.filter(f => Array.isArray(f.descriptor) && f.descriptor.length === 128);
        if (validFaces.length === 0) return res.json({ success: true, totalClusters: 0 });

        const eps = db.config.clusterThreshold !== undefined ? parseFloat(db.config.clusterThreshold) : 0.44;
        const epsSq = eps * eps;

        function distSq(d1, d2) {
            let s = 0;
            for (let i = 0; i < 128; i++) {
                const d = d1[i] - d2[i];
                s += d * d;
            }
            return s;
        }

        const n = validFaces.length;
        const faceNames = validFaces.map(face => {
            if (face.name) return face.name;
            if (face.clusterId) {
                const clusterName = db.getClusterName(face.clusterId);
                if (clusterName) return clusterName;
            }
            return null;
        });

        const clusters = [];
        // Se reutiliza este buffer en cada comparación cara-cluster en vez de crear un
        // Float32Array(128) nuevo cada vez: con miles de caras y cientos de clusters,
        // evita millones de asignaciones de memoria innecesarias (menos trabajo para
        // el recolector de basura durante el cálculo).
        const centroidScratch = new Float32Array(128);

        for (let i = 0; i < n; i++) {
            const face = validFaces[i];
            const desc = face.descriptor;
            const photoId = face.photoId;
            const faceName = faceNames[i];

            let bestClusterIdx = -1;
            let minDistance = Infinity;

            for (let c = 0; c < clusters.length; c++) {
                const cluster = clusters[c];
                if (cluster.photoIds.has(photoId)) continue;
                if (faceName && cluster.name && faceName.trim().toLowerCase() !== cluster.name.trim().toLowerCase()) continue;

                for (let k = 0; k < 128; k++) centroidScratch[k] = cluster.descriptorSum[k] / cluster.count;

                const d = distSq(desc, centroidScratch);
                if (d < minDistance) { minDistance = d; bestClusterIdx = c; }
            }

            if (bestClusterIdx !== -1 && minDistance < epsSq) {
                const cluster = clusters[bestClusterIdx];
                for (let k = 0; k < 128; k++) cluster.descriptorSum[k] += desc[k];
                cluster.count++;
                cluster.photoIds.add(photoId);
                cluster.faceIndices.push(i);
                if (faceName && !cluster.name) cluster.name = faceName;
            } else {
                clusters.push({
                    descriptorSum: Array.from(desc),
                    count: 1,
                    photoIds: new Set([photoId]),
                    faceIndices: [i],
                    name: faceName || null
                });
            }

            // Este cálculo es O(caras × personas). Con bibliotecas grandes puede tardar
            // segundos; sin este respiro periódico, el servidor entero dejaría de
            // responder a CUALQUIER otra petición (miniaturas, navegación...) mientras
            // dura, que es exactamente el tipo de "se traba" que hay que evitar.
            if (i % 250 === 0) await new Promise(resolve => setImmediate(resolve));
        }

        const claimedClusterIds = new Set();
        const clusterMap = new Map();
        let clusterCounter = 0;

        for (let c = 0; c < clusters.length; c++) {
            const cluster = clusters[c];
            const componentIndices = cluster.faceIndices;

            const clusterCounts = {};
            for (const idx of componentIndices) {
                const prevClusterId = validFaces[idx].clusterId;
                if (prevClusterId) clusterCounts[prevClusterId] = (clusterCounts[prevClusterId] || 0) + 1;
            }

            const sortedPrevClusters = Object.entries(clusterCounts).sort((a, b) => b[1] - a[1]);
            let finalClusterId = null;
            for (const [cId] of sortedPrevClusters) {
                if (!claimedClusterIds.has(cId)) { finalClusterId = cId; break; }
            }

            let clusterName = cluster.name;
            if (finalClusterId) {
                claimedClusterIds.add(finalClusterId);
                if (clusterName) {
                    let dbCluster = db.clusters.find(cl => cl.id === finalClusterId);
                    if (!dbCluster) db.clusters.push({ id: finalClusterId, name: clusterName });
                    else dbCluster.name = clusterName;
                } else {
                    clusterName = db.getClusterName(finalClusterId);
                }
            } else {
                clusterCounter++;
                finalClusterId = `person_${Date.now()}_${Math.random().toString(36).substring(2, 7)}_${clusterCounter}`;
                claimedClusterIds.add(finalClusterId);
                if (clusterName) db.clusters.push({ id: finalClusterId, name: clusterName });
            }

            for (const idx of componentIndices) clusterMap.set(idx, { clusterId: finalClusterId, name: clusterName });

            if (c % 250 === 0) await new Promise(resolve => setImmediate(resolve));
        }

        for (let i = 0; i < n; i++) {
            const face = validFaces[i];
            const info = clusterMap.get(i);
            if (info) { face.clusterId = info.clusterId; face.name = info.name; }
        }

        await db.saveAll();

        const activeClusterIds = new Set(Array.from(clusterMap.values()).map(info => info.clusterId));
        res.json({ success: true, totalClusters: activeClusterIds.size });
    } catch (e) {
        console.error('Error en clustering de caras:', e.message);
        res.status(500).json({ error: 'Error al agrupar caras' });
    }
});

// --- Auto-updater variables and routes ---
let updateStatus = { status: 'idle', progress: 0, error: null };

function downloadFile(url, destPath, onProgress, onSuccess, onError) {
    const parsedUrl = new URL(url);
    const options = {
        hostname: parsedUrl.hostname,
        path: parsedUrl.pathname + parsedUrl.search,
        method: 'GET',
        headers: {
            'User-Agent': 'Local-Photos-App',
            'Accept': 'application/octet-stream'
        },
        rejectUnauthorized: false // Techloq bypass
    };

    const request = https.get(options, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
            return downloadFile(res.headers.location, destPath, onProgress, onSuccess, onError);
        }
        if (res.statusCode !== 200) {
            return onError(new Error(`GitHub server returned status code ${res.statusCode}`));
        }

        const totalBytes = parseInt(res.headers['content-length'], 10) || 0;
        let downloadedBytes = 0;
        const fileStream = fs.createWriteStream(destPath);
        
        res.pipe(fileStream);

        res.on('data', (chunk) => {
            downloadedBytes += chunk.length;
            if (totalBytes > 0 && onProgress) {
                onProgress(downloadedBytes / totalBytes);
            }
        });

        fileStream.on('finish', () => {
            fileStream.close();
            onSuccess();
        });

        fileStream.on('error', (err) => {
            fs.unlink(destPath, () => {});
            onError(err);
        });
    });

    request.on('error', onError);
    request.end();
}

function isNewerVersion(latest, current) {
    if (!latest || !current) return false;
    const l = latest.split('.').map(n => parseInt(n, 10) || 0);
    const c = current.split('.').map(n => parseInt(n, 10) || 0);
    for (let i = 0; i < Math.max(l.length, c.length); i++) {
        const lNum = l[i] || 0;
        const cNum = c[i] || 0;
        if (lNum > cNum) return true;
        if (lNum < cNum) return false;
    }
    return false;
}

app.get('/api/check-update', (req, res) => {
    let currentVersion = '2.2.0';
    try {
        const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, 'package.json'), 'utf8'));
        if (pkg && pkg.version) currentVersion = pkg.version;
    } catch (e) {}

    const options = {
        hostname: 'api.github.com',
        path: '/repos/CHKI541/Local-Photos/releases/latest',
        method: 'GET',
        headers: {
            'User-Agent': 'Local-Photos-App',
            'Accept': 'application/vnd.github.v3+json'
        },
        rejectUnauthorized: false // Techloq bypass
    };

    const request = https.get(options, (response) => {
        let data = '';
        response.on('data', chunk => { data += chunk; });
        response.on('end', () => {
            if (response.statusCode === 200) {
                try {
                    const release = JSON.parse(data);
                    const rawTag = release.tag_name || '';
                    const latestVersion = rawTag.replace(/^v/, '');
                    const hasUpdate = isNewerVersion(latestVersion, currentVersion);
                    
                    let downloadUrl = null;
                    if (release.assets && Array.isArray(release.assets)) {
                        const exeAsset = release.assets.find(a => a.name && a.name.toLowerCase().endsWith('.exe'));
                        if (exeAsset) {
                            downloadUrl = exeAsset.browser_download_url;
                        }
                    }

                    return res.json({
                        success: true,
                        currentVersion,
                        latestVersion: latestVersion || currentVersion,
                        hasUpdate,
                        downloadUrl,
                        releaseUrl: release.html_url || 'https://github.com/CHKI541/Local-Photos/releases',
                        name: release.name || rawTag
                    });
                } catch (err) {
                    return res.status(500).json({ error: 'Error procesando respuesta de GitHub' });
                }
            } else if (response.statusCode === 404) {
                return res.json({
                    success: true,
                    currentVersion,
                    latestVersion: currentVersion,
                    hasUpdate: false,
                    noReleases: true
                });
            } else {
                return res.status(500).json({ error: `GitHub API respondió con código ${response.statusCode}` });
            }
        });
    });

    request.on('error', (err) => {
        console.error('[server] Error consultando actualizaciones en GitHub:', err.message);
        res.status(500).json({ error: err.message });
    });

    request.end();
});

app.get('/api/update/status', (req, res) => {
    res.json(updateStatus);
});

app.post('/api/update/start', (req, res) => {
    const { downloadUrl } = req.body || {};
    if (!downloadUrl) {
        return res.status(400).json({ error: 'Falta la URL de descarga' });
    }

    if (updateStatus.status === 'downloading') {
        return res.json({ success: true, message: 'Descarga ya en curso' });
    }

    updateStatus = { status: 'downloading', progress: 0, error: null };
    
    const os = require('os');
    const tempDest = path.join(os.tmpdir(), `LocalPhotosSetup_vLatest.exe`);

    console.log(`[server] Iniciando descarga de actualización desde: ${downloadUrl}`);
    console.log(`[server] Guardando en destino temporal: ${tempDest}`);

    downloadFile(downloadUrl, tempDest,
        (progress) => {
            updateStatus.progress = Math.round(progress * 100);
        },
        () => {
            console.log('[server] Descarga completada con éxito. Listo para instalar.');
            updateStatus.status = 'ready';
            updateStatus.progress = 100;

            setTimeout(() => {
                try {
                    console.log('[server] Ejecutando instalador y cerrando aplicación...');
                    const child = spawn(tempDest, [], {
                        detached: true,
                        stdio: 'ignore'
                    });
                    child.unref();

                    let electronApp = null;
                    try {
                        const electron = require('electron');
                        if (electron && electron.app) {
                            electronApp = electron.app;
                        }
                    } catch (e) {}

                    if (electronApp) {
                        electronApp.quit();
                    } else {
                        process.exit(0);
                    }
                } catch (err) {
                    console.error('[server] Error al ejecutar instalador:', err.message);
                    updateStatus.status = 'error';
                    updateStatus.error = err.message;
                }
            }, 1500);
        },
        (err) => {
            console.error('[server] Error descargando archivo:', err.message);
            updateStatus.status = 'error';
            updateStatus.error = err.message;
        }
    );

    res.json({ success: true, message: 'Descarga de actualización iniciada' });
});

// ============================== Tareas de fondo ==============================

async function populateMissingDimensions() {
    const pending = db.photos.filter(p => !p.isVideo && (!p.width || !p.height) && fs.existsSync(p.path));
    if (pending.length === 0) return;

    console.log(`[server] Completando dimensiones faltantes de ${pending.length} foto(s)...`);
    let count = 0;
    await mapWithConcurrency(pending, 6, async (photo) => {
        const metadata = await sharp(photo.path).metadata();
        const { width, height } = displayDimensions(metadata.width, metadata.height, metadata.orientation);
        db.updatePhotoDimensions(photo.id, width, height);
        count++;
    });
    console.log(`[server] Completado: dimensiones de ${count} foto(s) actualizadas.`);
}

app.listen(PORT, () => {
    console.log('======================================================');
    console.log('   Servidor LocalPhotos corriendo con éxito!');
    console.log(`   Accede en tu navegador: http://localhost:${PORT}`);
    console.log('======================================================');

    populateMissingDimensions().catch(err => console.error('[server] Error poblando dimensiones:', err.message));

    mediaActions.purgeExpiredTrash().catch(err => console.error('[server] Error purgando la papelera:', err.message));
    setInterval(() => {
        mediaActions.purgeExpiredTrash().catch(err => console.error('[server] Error purgando la papelera:', err.message));
    }, 24 * 60 * 60 * 1000);

    // Escaneo al abrir: SOLO si el usuario lo activó explícitamente (scanOnStartup).
    // Por defecto está apagado, así la app abre al instante usando el índice ya
    // guardado en db.json, sin volver a recorrer las carpetas cada vez. Las fotos
    // nuevas se suman con el botón "Guardar y escanear" o activando esta opción.
    if (db.config.scanOnStartup && db.config.folders.length > 0 && !scanner.getIsScanning()) {
        console.log('[server] scanOnStartup activo: iniciando escaneo automático...');
        scanner.startScan().catch(err => console.error('[server] Error en escaneo automático:', err.message));
    } else {
        console.log('[server] Escaneo al abrir desactivado (scanOnStartup=false): usando el índice guardado.');
    }
});
