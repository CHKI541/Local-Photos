const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const db = require('./database');
const { TRASH_DIR, THUMBNAIL_SIZES, thumbnailCachePath, faceCachePath } = require('./paths');
const { mapWithConcurrency } = require('./concurrency');

// Mover/copiar archivos completos es más pesado que leer 128KB de EXIF, así que aquí
// usamos menos concurrencia que en el escaneo para no saturar el disco.
const MOVE_CONCURRENCY = 4;

async function ensureDir(dir) {
    await fsp.mkdir(dir, { recursive: true });
}

// Mueve un archivo. Si el origen y el destino están en discos/unidades distintas
// (muy común aquí: las fotos pueden estar en "E:\Fotos" pero la papelera de la app
// vive dentro de la carpeta de usuario, normalmente en "C:\") fs.rename falla con
// EXDEV ("cross-device link"), así que en ese caso se recurre a copiar y luego
// borrar el original.
async function safeMove(src, dest) {
    await ensureDir(path.dirname(dest));
    try {
        await fsp.rename(src, dest);
    } catch (e) {
        if (e.code === 'EXDEV') {
            await fsp.copyFile(src, dest);
            await fsp.unlink(src);
        } else {
            throw e;
        }
    }
}

function uniqueDestination(dir, filename) {
    const ext = path.extname(filename);
    const base = path.basename(filename, ext);
    let candidate = path.join(dir, filename);
    let n = 1;
    while (fs.existsSync(candidate)) {
        candidate = path.join(dir, `${base} (${n})${ext}`);
        n++;
    }
    return candidate;
}

async function removeCacheFilesFor(photoId) {
    const targets = THUMBNAIL_SIZES.map(size => thumbnailCachePath(photoId, size));
    const faces = db.getFacesForPhoto(photoId);
    faces.forEach(f => targets.push(faceCachePath(f.id)));
    await Promise.all(targets.map(p => fsp.unlink(p).catch(() => {})));
}

async function trashPhotos(ids) {
    const photos = ids.map(id => db.getPhotoById(id)).filter(p => p && !p.trashedAt);
    const results = await mapWithConcurrency(photos, MOVE_CONCURRENCY, async (photo) => {
        const dest = path.join(TRASH_DIR, `${photo.id}__${photo.filename}`);
        await safeMove(photo.path, dest);
        return { id: photo.id, trashPath: dest };
    });
    const succeeded = results.filter(r => r.ok).map(r => r.value);
    const failed = results.filter(r => !r.ok);
    if (succeeded.length > 0) await db.markPhotosTrashed(succeeded);
    return {
        movedCount: succeeded.length,
        failedCount: failed.length,
        errors: failed.map(f => f.error && f.error.message)
    };
}

async function restorePhotos(ids) {
    const photos = ids.map(id => db.getPhotoById(id)).filter(p => p && p.trashedAt && p.originalPath);
    const results = await mapWithConcurrency(photos, MOVE_CONCURRENCY, async (photo) => {
        const targetDir = path.dirname(photo.originalPath);
        await ensureDir(targetDir);
        const dest = fs.existsSync(photo.originalPath)
            ? uniqueDestination(targetDir, path.basename(photo.originalPath))
            : photo.originalPath;
        await safeMove(photo.path, dest);
        return { id: photo.id, restoredPath: dest };
    });
    const succeeded = results.filter(r => r.ok).map(r => r.value);
    const failed = results.filter(r => !r.ok);
    if (succeeded.length > 0) await db.markPhotosRestored(succeeded);
    return {
        restoredCount: succeeded.length,
        failedCount: failed.length,
        errors: failed.map(f => f.error && f.error.message)
    };
}

async function deletePhotosForever(ids) {
    const photos = ids.map(id => db.getPhotoById(id)).filter(Boolean);
    const results = await mapWithConcurrency(photos, MOVE_CONCURRENCY, async (photo) => {
        try {
            await fsp.unlink(photo.path);
        } catch (e) {
            if (e.code !== 'ENOENT') throw e; // si ya no está en disco, igual se quita del índice
        }
        await removeCacheFilesFor(photo.id);
        return photo.id;
    });
    const succeededIds = results.filter(r => r.ok).map(r => r.value);
    const failed = results.filter(r => !r.ok);
    if (succeededIds.length > 0) await db.deletePhotosPermanently(succeededIds);
    return {
        deletedCount: succeededIds.length,
        failedCount: failed.length,
        errors: failed.map(f => f.error && f.error.message)
    };
}

async function emptyTrash() {
    const trashed = db.photos.filter(p => p.trashedAt);
    return deletePhotosForever(trashed.map(p => p.id));
}

async function purgeExpiredTrash() {
    const expired = db.getExpiredTrash();
    if (expired.length === 0) return { deletedCount: 0, failedCount: 0, errors: [] };
    console.log(`[trash] Purgando ${expired.length} elemento(s) con más de ${db.config.trashRetentionDays} días en la papelera...`);
    return deletePhotosForever(expired.map(p => p.id));
}

module.exports = {
    safeMove,
    trashPhotos,
    restorePhotos,
    deletePhotosForever,
    emptyTrash,
    purgeExpiredTrash
};
