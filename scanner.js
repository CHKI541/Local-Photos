const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');
const crypto = require('crypto');
const exifParser = require('exif-parser');
const db = require('./database');
const { APP_DATA_DIR, isPathUnderFolder } = require('./paths');
const { SUPPORTED_EXTENSIONS, isVideoExt } = require('./mediaTypes');
const { mapWithConcurrency } = require('./concurrency');
const { displayDimensions } = require('./exifUtils');

const EXCLUDED_DIR_NAMES = new Set([
    'node_modules', '$recycle.bin', 'system volume information', 'appdata',
    'program files', 'program files (x86)', 'programdata', 'windows',
    '.git', '$windows.~bt', '$windows.~ws'
]);

// Cuántos archivos se procesan (stat + lectura EXIF) en paralelo. Los reads de disco
// son I/O asíncrono real en Node (no bloquean el hilo principal), así que procesar
// varios a la vez aprovecha mucho mejor un SSD moderno que hacerlo uno por uno.
const CONCURRENCY = 6;

function generateId(filePath) {
    return crypto.createHash('md5').update(filePath).digest('hex');
}

function isValidDate(d) {
    return d instanceof Date && !isNaN(d.getTime()) && d.getFullYear() > 1990 && d.getFullYear() < 2035;
}

function extractDateFromFilename(filename) {
    // Valida y arma la fecha a partir de sus componentes (evita duplicar el chequeo).
    const build = (y, mo, d) => {
        const year = parseInt(y, 10);
        const month = parseInt(mo, 10) - 1;
        const day = parseInt(d, 10);
        if (year >= 1990 && year <= 2035 && month >= 0 && month <= 11 && day >= 1 && day <= 31) {
            return new Date(year, month, day, 12, 0, 0);
        }
        return null;
    };

    // 1) Fecha con separadores: 2022-08-03, 2022_08_03, 2022.08.03
    let m = filename.match(/(19\d{2}|20[0-3]\d)[._-](\d{2})[._-](\d{2})/);
    if (m) { const d = build(m[1], m[2], m[3]); if (d) return d; }

    // 2) Fecha compacta de 8 dígitos (YYYYMMDD) delimitada por cualquier cosa que
    //    NO sea otro dígito. Cubre los nombres más comunes de cámara/teléfono:
    //    IMG_20220803_120000, 20220803_120000 (Android), PXL_20220803_... (Pixel),
    //    IMG-20220803-WA0001 (WhatsApp), Screenshot_20220803-..., etc.
    //    Se usa lookbehind/lookahead de "no-dígito" en vez de \b porque el guion
    //    bajo ES un carácter de palabra: en "_20220803" no hay \b antes del 2, así
    //    que el patrón anterior fallaba justo con estos nombres tan habituales y la
    //    foto terminaba fechada por la fecha de modificación del archivo (mal orden
    //    en la línea de tiempo y en Recuerdos).
    m = filename.match(/(?<![0-9])(19\d{2}|20[0-3]\d)(\d{2})(\d{2})(?![0-9])/);
    if (m) { const d = build(m[1], m[2], m[3]); if (d) return d; }

    return null;
}

function buildCameraInfo(tags) {
    const camera = {};
    if (tags.Make) camera.make = String(tags.Make).trim();
    if (tags.Model) camera.model = String(tags.Model).trim();
    if (tags.FNumber) camera.fNumber = tags.FNumber;
    if (tags.ExposureTime) camera.exposureTime = tags.ExposureTime;
    if (tags.ISO) camera.iso = tags.ISO;
    if (tags.FocalLength) camera.focalLength = tags.FocalLength;
    if (tags.LensModel) camera.lens = String(tags.LensModel).trim();
    return Object.keys(camera).length > 0 ? camera : undefined;
}

// Extrae metadatos completos (EXIF, fecha, GPS, dimensiones). Es la parte "cara" del
// escaneo; solo se llama para archivos nuevos o modificados (ver processFile).
async function extractMetadata(filePath, stat) {
    const ext = path.extname(filePath).toLowerCase();
    const filename = path.basename(filePath);
    const isVideo = isVideoExt(ext);

    let finalDate = null;
    let latitude = null;
    let longitude = null;
    let width = null;
    let height = null;
    let camera = undefined;

    if (!isVideo && (ext === '.jpg' || ext === '.jpeg')) {
        let fileHandle = null;
        try {
            fileHandle = await fs.open(filePath, 'r');
            const buffer = Buffer.alloc(131072); // 128KB alcanza para el EXIF salvo casos muy raros
            const { bytesRead } = await fileHandle.read(buffer, 0, 131072, 0);
            const partialBuffer = buffer.subarray(0, bytesRead);

            const parser = exifParser.create(partialBuffer);
            const result = parser.parse();

            if (result.imageSize) {
                const swapped = displayDimensions(result.imageSize.width, result.imageSize.height, result.tags && result.tags.Orientation);
                width = swapped.width;
                height = swapped.height;
            }

            if (result.tags) {
                if (result.tags.DateTimeOriginal) {
                    const exifDate = new Date(result.tags.DateTimeOriginal * 1000);
                    if (isValidDate(exifDate)) finalDate = exifDate;
                } else if (result.tags.CreateDate) {
                    const exifDate = new Date(result.tags.CreateDate * 1000);
                    if (isValidDate(exifDate)) finalDate = exifDate;
                }

                if (result.tags.GPSLatitude && result.tags.GPSLongitude) {
                    latitude = result.tags.GPSLatitude;
                    longitude = result.tags.GPSLongitude;
                }

                camera = buildCameraInfo(result.tags);
            }
        } catch (e) {
            // EXIF dañado o ausente: no es un error real, seguimos con otras fuentes de fecha
        } finally {
            if (fileHandle) {
                try { await fileHandle.close(); } catch (e) {}
            }
        }
    }

    if (!finalDate) {
        const fileDate = extractDateFromFilename(filename);
        if (fileDate && isValidDate(fileDate)) finalDate = fileDate;
    }

    if (!finalDate) {
        let statDate = stat.mtime;
        if (stat.birthtime && stat.birthtime < statDate && isValidDate(stat.birthtime)) {
            statDate = stat.birthtime;
        }
        finalDate = isValidDate(statDate) ? statDate : new Date();
    }

    return {
        id: generateId(filePath),
        path: filePath,
        filename,
        dateTaken: finalDate.toISOString(),
        latitude,
        longitude,
        size: stat.size,
        mtimeMs: stat.mtimeMs,
        facesScanned: false,
        width,
        height,
        isVideo,
        duration: null,
        camera
    };
}

async function collectFiles(rootDir) {
    const results = [];
    async function recurse(currentDir) {
        const dirName = path.basename(currentDir).toLowerCase();
        if (dirName.startsWith('.') || EXCLUDED_DIR_NAMES.has(dirName)) return;

        let items;
        try {
            items = await fs.readdir(currentDir, { withFileTypes: true });
        } catch (e) {
            return; // carpeta sin permisos u otro error: se ignora y se sigue
        }

        for (const item of items) {
            const fullPath = path.join(currentDir, item.name);
            if (item.isDirectory()) {
                await recurse(fullPath);
            } else if (item.isFile()) {
                const ext = path.extname(item.name).toLowerCase();
                if (SUPPORTED_EXTENSIONS.has(ext)) {
                    results.push(fullPath);
                }
            }
        }
    }
    await recurse(rootDir);
    return results;
}

let isScanning = false;
let scanState = {
    currentAction: 'idle', // 'idle' | 'listing' | 'processing' | 'cleaning'
    currentFolder: '',
    totalFiles: 0,
    filesProcessed: 0,
    filesUnchanged: 0
};

async function startScan() {
    if (isScanning) return { status: 'already_scanning' };
    isScanning = true;

    scanState.currentAction = 'listing';
    scanState.currentFolder = '';
    scanState.totalFiles = 0;
    scanState.filesProcessed = 0;
    scanState.filesUnchanged = 0;

    console.log('[scanner] Iniciando escaneo...');

    try {
        const folders = db.config.folders;
        let newCount = 0;
        let updateCount = 0;
        let fileIndex = 0;
        let unchangedCount = 0;

        // Fase 1: listar archivos de todas las carpetas (rápido, solo directorios).
        // Se hace antes de procesar para poder mostrar un progreso global real
        // ("2.400 / 50.000") en vez de solo el de la carpeta actual.
        const allFiles = [];
        for (const folder of folders) {
            if (!fsSync.existsSync(folder)) {
                console.log(`[scanner] La carpeta no existe, se omite: ${folder}`);
                continue;
            }
            scanState.currentFolder = folder;
            const found = await collectFiles(folder);
            found.forEach(f => allFiles.push(f));
        }

        scanState.totalFiles = allFiles.length;
        scanState.currentAction = 'processing';
        scanState.currentFolder = '';

        await mapWithConcurrency(allFiles, CONCURRENCY, async (filePath) => {
            let stat;
            try {
                stat = await fs.stat(filePath);
            } catch (e) {
                fileIndex++;
                scanState.filesProcessed = fileIndex;
                return; // el archivo desapareció justo mientras escaneábamos
            }

            const existing = db.getPhotoByPath(filePath);

            // Si el archivo no cambió desde el último escaneo (mismo tamaño y misma
            // fecha de modificación), no vale la pena releer EXIF: nos ahorramos
            // abrir y parsear el archivo. En bibliotecas grandes esto hace que
            // re-escanear sea muchísimo más rápido que la primera vez.
            if (existing && existing.mtimeMs === stat.mtimeMs && existing.size === stat.size) {
                unchangedCount++;
                scanState.filesUnchanged = unchangedCount;
                fileIndex++;
                scanState.filesProcessed = fileIndex;
                return;
            }

            const wasModified = existing && existing.mtimeMs !== stat.mtimeMs;
            const meta = await extractMetadata(filePath, stat);
            const isNew = db.addPhoto(meta);

            if (wasModified) {
                // El contenido del archivo cambió: las caras detectadas antes ya no
                // son de fiar, se limpian para que se vuelvan a analizar.
                db.clearFacesForPhoto(meta.id);
                db.setPhotoFacesScanned(meta.id, false);
            }

            if (isNew) newCount++; else updateCount++;

            fileIndex++;
            scanState.filesProcessed = fileIndex;
            if (fileIndex % 200 === 0) {
                console.log(`[scanner] Procesados ${fileIndex}/${allFiles.length}...`);
            }
        }).then(results => {
            const failed = results.filter(r => r && !r.ok);
            if (failed.length > 0) {
                console.error(`[scanner] ${failed.length} archivo(s) no se pudieron procesar (se omitieron, el resto del escaneo continuó). Ejemplo:`, failed[0].error && failed[0].error.message);
            }
        });

        scanState.currentAction = 'cleaning';

        // Limpiar de la base de datos las fotos que ya no existen en disco.
        // OJO: las fotos en la papelera tienen su `path` apuntando a la carpeta de
        // papelera de la app (fuera de las carpetas configuradas) a propósito, así
        // que se excluyen de esta comprobación; si no, cada escaneo las borraría del
        // índice (el archivo seguiría en la papelera, pero la app dejaría de saber
        // que existe).
        const missingPaths = [];
        for (const photo of db.photos) {
            if (photo.trashedAt) continue;
            const isUnderActiveFolder = folders.some(folder => isPathUnderFolder(photo.path, folder));
            if (!isUnderActiveFolder || !fsSync.existsSync(photo.path)) {
                missingPaths.push(photo.path);
            }
        }
        await db.removePhotosBatch(missingPaths);

        await db.saveAll();
        console.log(`[scanner] Escaneo completado. Total: ${allFiles.length}. Nuevos: ${newCount}, Actualizados: ${updateCount}, Sin cambios: ${unchangedCount}, Eliminados: ${missingPaths.length}.`);

        scanState.currentAction = 'idle';
        isScanning = false;

        return {
            status: 'completed',
            added: newCount,
            updated: updateCount,
            unchanged: unchangedCount,
            deleted: missingPaths.length,
            total: db.photos.length
        };
    } catch (e) {
        console.error('[scanner] Error durante el escaneo:', e);
        scanState.currentAction = 'idle';
        isScanning = false;
        throw e;
    }
}

module.exports = {
    startScan,
    getIsScanning: () => isScanning,
    getScanState: () => scanState
};
