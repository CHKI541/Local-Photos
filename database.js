const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const crypto = require('crypto');

const { APP_DATA_DIR } = require('./paths');

const DB_PATH = path.join(APP_DATA_DIR, 'db.json');
const DB_TMP_PATH = path.join(APP_DATA_DIR, 'db.json.tmp');

const LEGACY_DB = path.join(__dirname, 'db.json');
try {
    if (!fs.existsSync(DB_PATH) && fs.existsSync(LEGACY_DB)) {
        fs.copyFileSync(LEGACY_DB, DB_PATH);
        console.log('[database] Se migró la base de datos existente a la carpeta de datos de usuario:', DB_PATH);
    }
} catch (e) {
    console.error('[database] Error migrando db.json previo:', e.message);
}

function defaultDb() {
    return {
        config: {
            folders: [],
            clusterThreshold: 0.44,
            faceRecognitionEnabled: true,
            trashRetentionDays: 30
        },
        photos: [],
        faces: [],
        clusters: [],
        albums: []
    };
}

let db = defaultDb();

// --- Índices en memoria ---
// db.photos/db.faces son arrays (para poder recorrerlos, filtrarlos y para que el
// JSON en disco sea legible). Pero buscar por id/ruta con .find()/.filter() en un
// array de decenas de miles de fotos, UNA VEZ POR CADA FOTO durante un escaneo,
// es O(n²) y es la causa más probable de que la app "se trabe" con bibliotecas grandes.
// Estos Map se mantienen sincronizados con los arrays en cada método de escritura,
// y permiten búsquedas O(1).
let photosById = new Map();
let photosByPath = new Map();
let facesByPhotoId = new Map();
let facesById = new Map();

function rebuildIndices() {
    photosById = new Map(db.photos.map(p => [p.id, p]));
    photosByPath = new Map(db.photos.map(p => [p.path, p]));
    facesByPhotoId = new Map();
    facesById = new Map(db.faces.map(f => [f.id, f]));
    for (const f of db.faces) {
        if (!facesByPhotoId.has(f.photoId)) facesByPhotoId.set(f.photoId, []);
        facesByPhotoId.get(f.photoId).push(f);
    }
}

function indexAddPhoto(p) {
    photosById.set(p.id, p);
    photosByPath.set(p.path, p);
}
function indexRemovePhoto(p) {
    photosById.delete(p.id);
    photosByPath.delete(p.path);
}
function indexAddFace(f) {
    facesById.set(f.id, f);
    if (!facesByPhotoId.has(f.photoId)) facesByPhotoId.set(f.photoId, []);
    facesByPhotoId.get(f.photoId).push(f);
}

// Rellena campos que puedan faltar (bases de datos viejas o parcialmente escritas)
// para que el resto de la app nunca tenga que hacer chequeos defensivos de "undefined".
function ensureShape() {
    if (!db || typeof db !== 'object') db = defaultDb();
    if (!db.config || typeof db.config !== 'object') db.config = {};
    if (!Array.isArray(db.config.folders)) db.config.folders = [];
    if (typeof db.config.clusterThreshold !== 'number' || Number.isNaN(db.config.clusterThreshold)) db.config.clusterThreshold = 0.44;
    if (typeof db.config.faceRecognitionEnabled !== 'boolean') db.config.faceRecognitionEnabled = true;
    if (typeof db.config.trashRetentionDays !== 'number' || Number.isNaN(db.config.trashRetentionDays)) db.config.trashRetentionDays = 30;
    if (!Array.isArray(db.photos)) db.photos = [];
    if (!Array.isArray(db.faces)) db.faces = [];
    if (!Array.isArray(db.clusters)) db.clusters = [];
    if (!Array.isArray(db.albums)) db.albums = [];

    for (const p of db.photos) {
        if (typeof p.favorite !== 'boolean') p.favorite = false;
        if (p.trashedAt === undefined) p.trashedAt = null;
        if (p.originalPath === undefined) p.originalPath = null;
        if (typeof p.isVideo !== 'boolean') p.isVideo = false;
        if (p.duration === undefined) p.duration = null;
        if (p.mtimeMs === undefined) p.mtimeMs = null;
        if (typeof p.videoThumbGenerated !== 'boolean') p.videoThumbGenerated = false;
    }
}

function load() {
    if (fs.existsSync(DB_PATH)) {
        try {
            const raw = fs.readFileSync(DB_PATH, 'utf8');
            if (raw.trim().length === 0) throw new Error('El archivo db.json está vacío');
            db = JSON.parse(raw);
            ensureShape();
            console.log(`[database] Base de datos cargada: ${db.photos.length} fotos, ${db.albums.length} álbumes.`);
        } catch (e) {
            console.error('[database] ERROR: db.json no se pudo leer o es inválido:', e.message);
            // Muy importante: NUNCA descartar en silencio un archivo dañado.
            // Guardamos una copia para poder intentar recuperarlo a mano más tarde,
            // y arrancamos con una base vacía para que la app siga funcionando.
            try {
                const backupPath = path.join(__dirname, `db.json.corrupto-${Date.now()}.bak`);
                fs.copyFileSync(DB_PATH, backupPath);
                console.error(`[database] Se guardó una copia del archivo dañado en: ${backupPath}`);
                console.error('[database] Tus fotos en disco NO se han tocado. Solo se perdió el índice (nombres de personas, álbumes, favoritos). Vuelve a escanear tus carpetas para reconstruirlo.');
            } catch (backupErr) {
                console.error('[database] No se pudo respaldar el archivo dañado:', backupErr.message);
            }
            db = defaultDb();
        }
    } else {
        db = defaultDb();
        saveSync();
    }
    rebuildIndices();
}

// Escritura sincrónica atómica (solo se usa una vez, al arrancar, si no existe db.json).
function saveSync() {
    try {
        fs.writeFileSync(DB_TMP_PATH, JSON.stringify(db, null, 2), 'utf8');
        fs.renameSync(DB_TMP_PATH, DB_PATH);
    } catch (e) {
        console.error('[database] Error al crear la base de datos inicial:', e.message);
    }
}

// --- Escritura asíncrona en cola, con throttle ---
// Nunca hay más de una escritura en curso a la vez (se encolan en writeChain), y la
// escritura es atómica (temp + rename) para que un cierre inesperado no deje un
// db.json a medio escribir (lo que antes provocaba pérdida total y silenciosa de datos).
let writeChain = Promise.resolve();
let lastSaveTime = 0;
let throttleTimer = null;
const THROTTLE_MS = 2000;

async function doWrite() {
    try {
        const json = JSON.stringify(db, null, 2);
        await fsp.writeFile(DB_TMP_PATH, json, 'utf8');
        await fsp.rename(DB_TMP_PATH, DB_PATH);
        lastSaveTime = Date.now();
    } catch (e) {
        console.error('[database] Error al guardar la base de datos:', e.message);
    }
}

function scheduleWrite() {
    writeChain = writeChain.then(doWrite);
    return writeChain;
}

// force=true -> guarda ya (y devuelve una Promise para poder esperar la confirmación).
// force=false -> guarda como máximo una vez cada 2s, para no saturar el disco
// mientras se procesan miles de fotos durante un escaneo.
function save(force = false) {
    if (force) {
        if (throttleTimer) { clearTimeout(throttleTimer); throttleTimer = null; }
        return scheduleWrite();
    }
    const elapsed = Date.now() - lastSaveTime;
    if (elapsed > THROTTLE_MS) {
        return scheduleWrite();
    }
    if (!throttleTimer) {
        throttleTimer = setTimeout(() => {
            throttleTimer = null;
            scheduleWrite();
        }, THROTTLE_MS - elapsed);
    }
    return Promise.resolve();
}

load();

module.exports = {
    get config() { return db.config; },
    get photos() { return db.photos; },
    get faces() { return db.faces; },
    get clusters() { return db.clusters; },
    get albums() { return db.albums; },

    saveConfig(patch) {
        if (Array.isArray(patch.folders)) db.config.folders = patch.folders;
        if (patch.clusterThreshold !== undefined) db.config.clusterThreshold = parseFloat(patch.clusterThreshold);
        if (patch.faceRecognitionEnabled !== undefined) db.config.faceRecognitionEnabled = !!patch.faceRecognitionEnabled;
        if (patch.trashRetentionDays !== undefined) db.config.trashRetentionDays = parseInt(patch.trashRetentionDays, 10);
        return save(true);
    },

    // --- Búsquedas O(1) ---
    getPhotoById(id) {
        return photosById.get(id) || null;
    },
    getPhotoByPath(p) {
        return photosByPath.get(p) || null;
    },

    addPhoto(photo) {
        const existing = photosByPath.get(photo.path);
        if (!existing) {
            db.photos.push(photo);
            indexAddPhoto(photo);
            save();
            return true;
        } else {
            // Conservar campos "curados" por el usuario (favorito, papelera) al reescanear
            Object.assign(existing, photo, {
                favorite: existing.favorite,
                trashedAt: existing.trashedAt,
                originalPath: existing.originalPath
            });
            save();
            return false;
        }
    },

    removePhoto(photoPath) {
        const p = photosByPath.get(photoPath);
        if (!p) return Promise.resolve();
        db.photos = db.photos.filter(x => x !== p);
        (facesByPhotoId.get(p.id) || []).forEach(f => facesById.delete(f.id));
        db.faces = db.faces.filter(f => f.photoId !== p.id);
        indexRemovePhoto(p);
        facesByPhotoId.delete(p.id);
        return save(true);
    },

    // Igual que removePhoto pero para muchas rutas a la vez con un único guardado final.
    // Evita re-escribir todo el archivo N veces cuando el escaneo detecta N archivos borrados.
    removePhotosBatch(photoPaths) {
        if (!photoPaths || photoPaths.length === 0) return Promise.resolve();
        const pathSet = new Set(photoPaths);
        const toRemove = db.photos.filter(p => pathSet.has(p.path));
        if (toRemove.length === 0) return Promise.resolve();
        const idSet = new Set(toRemove.map(p => p.id));
        db.photos = db.photos.filter(p => !idSet.has(p.id));
        db.faces = db.faces.filter(f => !idSet.has(f.photoId));
        toRemove.forEach(p => {
            (facesByPhotoId.get(p.id) || []).forEach(f => facesById.delete(f.id));
            indexRemovePhoto(p);
            facesByPhotoId.delete(p.id);
        });
        return save(true);
    },

    toggleFavorite(ids, favorite) {
        let count = 0;
        ids.forEach(id => {
            const p = photosById.get(id);
            if (p) { p.favorite = favorite; count++; }
        });
        save(true);
        return count;
    },

    updatePhotoDate(id, dateTaken) {
        const p = photosById.get(id);
        if (!p) return false;
        p.dateTaken = dateTaken;
        save(true);
        return true;
    },

    updatePhotoDates(ids, dateTaken) {
        let count = 0;
        ids.forEach(id => {
            const p = photosById.get(id);
            if (p) { p.dateTaken = dateTaken; count++; }
        });
        save(true);
        return count;
    },

    // items: [{ id, trashPath }]
    markPhotosTrashed(items) {
        items.forEach(info => {
            const p = photosById.get(info.id);
            if (!p) return;
            photosByPath.delete(p.path);
            p.originalPath = p.path;
            p.path = info.trashPath;
            p.trashedAt = new Date().toISOString();
            photosByPath.set(p.path, p);
        });
        return save(true);
    },

    // items: [{ id, restoredPath }]
    markPhotosRestored(items) {
        items.forEach(info => {
            const p = photosById.get(info.id);
            if (!p) return;
            photosByPath.delete(p.path);
            p.path = info.restoredPath;
            p.originalPath = null;
            p.trashedAt = null;
            photosByPath.set(p.path, p);
        });
        return save(true);
    },

    deletePhotosPermanently(ids) {
        const idSet = new Set(ids);
        const toRemove = db.photos.filter(p => idSet.has(p.id));
        db.photos = db.photos.filter(p => !idSet.has(p.id));
        db.faces = db.faces.filter(f => !idSet.has(f.photoId));
        db.albums.forEach(a => { a.photoIds = a.photoIds.filter(id => !idSet.has(id)); });
        toRemove.forEach(p => {
            (facesByPhotoId.get(p.id) || []).forEach(f => facesById.delete(f.id));
            indexRemovePhoto(p);
            facesByPhotoId.delete(p.id);
        });
        return save(true);
    },

    getExpiredTrash(retentionDaysOverride) {
        const days = retentionDaysOverride !== undefined ? retentionDaysOverride : db.config.trashRetentionDays;
        const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
        return db.photos.filter(p => p.trashedAt && new Date(p.trashedAt).getTime() < cutoff);
    },

    addFace(face) {
        const siblings = facesByPhotoId.get(face.photoId) || [];
        const exists = siblings.some(f =>
            Math.abs(f.box.x - face.box.x) < 0.05 &&
            Math.abs(f.box.y - face.box.y) < 0.05);
        if (!exists) {
            db.faces.push(face);
            indexAddFace(face);
            save();
        }
    },

    getFacesForPhoto(photoId) {
        const list = facesByPhotoId.get(photoId) || [];
        return list.map(f => ({ ...f, name: f.name || (f.clusterId ? this.getClusterName(f.clusterId) : null) }));
    },

    getFaceById(faceId) {
        return facesById.get(faceId) || null;
    },

    clearFacesForPhoto(photoId) {
        (facesByPhotoId.get(photoId) || []).forEach(f => facesById.delete(f.id));
        db.faces = db.faces.filter(f => f.photoId !== photoId);
        facesByPhotoId.delete(photoId);
        save();
    },

    setPhotoFacesScanned(photoId, scanned) {
        const photo = photosById.get(photoId);
        if (photo) {
            photo.facesScanned = scanned;
            save();
        }
    },

    updatePhotoDimensions(photoId, width, height) {
        const photo = photosById.get(photoId);
        if (photo) {
            photo.width = width;
            photo.height = height;
            save();
        }
    },

    setPhotoDuration(photoId, duration) {
        const photo = photosById.get(photoId);
        if (photo) {
            photo.duration = duration;
            save();
        }
    },

    setVideoThumbGenerated(photoId, generated) {
        const photo = photosById.get(photoId);
        if (photo) {
            photo.videoThumbGenerated = generated;
            save();
        }
    },

    updateFaceCluster(faceId, clusterId) {
        const face = facesById.get(faceId);
        if (face) {
            face.clusterId = clusterId;
            save();
        }
    },

    updateClusterName(clusterId, name) {
        let cluster = db.clusters.find(c => c.id === clusterId);
        if (!cluster) {
            cluster = { id: clusterId, name: name };
            db.clusters.push(cluster);
        } else {
            cluster.name = name;
        }

        db.faces.forEach(f => {
            if (f.clusterId === clusterId) {
                f.name = name;
            }
        });
        return save(true);
    },

    getClusterName(clusterId) {
        const cluster = db.clusters.find(c => c.id === clusterId);
        return cluster ? cluster.name : null;
    },

    // --- Álbumes ---
    createAlbum(name) {
        const album = {
            id: `album_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`,
            name: (name || 'Álbum sin título').trim(),
            photoIds: [],
            coverPhotoId: null,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };
        db.albums.push(album);
        save(true);
        return album;
    },

    getAlbum(id) {
        return db.albums.find(a => a.id === id) || null;
    },

    renameAlbum(id, name) {
        const album = db.albums.find(a => a.id === id);
        if (!album) return null;
        album.name = (name || '').trim() || album.name;
        album.updatedAt = new Date().toISOString();
        save(true);
        return album;
    },

    deleteAlbum(id) {
        const existed = db.albums.some(a => a.id === id);
        db.albums = db.albums.filter(a => a.id !== id);
        return save(true).then(() => existed);
    },

    addPhotosToAlbum(id, photoIds) {
        const album = db.albums.find(a => a.id === id);
        if (!album) return null;
        const existing = new Set(album.photoIds);
        photoIds.forEach(pid => existing.add(pid));
        album.photoIds = Array.from(existing);
        if (!album.coverPhotoId && album.photoIds.length > 0) album.coverPhotoId = album.photoIds[0];
        album.updatedAt = new Date().toISOString();
        save(true);
        return album;
    },

    removePhotosFromAlbum(id, photoIds) {
        const album = db.albums.find(a => a.id === id);
        if (!album) return null;
        const toRemove = new Set(photoIds);
        album.photoIds = album.photoIds.filter(pid => !toRemove.has(pid));
        if (album.coverPhotoId && toRemove.has(album.coverPhotoId)) {
            album.coverPhotoId = album.photoIds[0] || null;
        }
        album.updatedAt = new Date().toISOString();
        save(true);
        return album;
    },

    setAlbumCover(id, photoId) {
        const album = db.albums.find(a => a.id === id);
        if (!album) return null;
        album.coverPhotoId = photoId;
        save(true);
        return album;
    },

    saveAll() {
        return save(true);
    }
};
