// Ubicaciones centralizadas de los datos propios de la app (no las fotos del usuario).
// Todo vive bajo una carpeta con punto inicial (".local-photos") dentro del home del
// usuario. Esto es importante: scanner.js excluye automáticamente cualquier carpeta
// cuyo nombre empiece por "." al recorrer el disco, así que si el usuario configura
// su carpeta de usuario completa como carpeta a indexar, la app nunca "re-descubre"
// su propia caché de miniaturas ni las fotos que están en la papelera como si fueran
// fotos nuevas.
const os = require('os');
const path = require('path');

const APP_DATA_DIR = path.join(os.homedir(), '.local-photos');
const CACHE_DIR = path.join(APP_DATA_DIR, 'cache');
const TRASH_DIR = path.join(APP_DATA_DIR, 'trash');

// Tamaños de miniatura que se generan/cachean: 400 para la cuadrícula, 1600 como
// "vista previa" rápida del visor a pantalla completa (mucho más liviana que
// mandar el archivo original de una cámara de 40MP solo para verlo en pantalla).
const THUMBNAIL_SIZES = [400, 1600];

function thumbnailCachePath(id, size) {
    return path.join(CACHE_DIR, `${id}_${size}.jpg`);
}

function faceCachePath(faceId) {
    return path.join(CACHE_DIR, `face_${faceId}.jpg`);
}

// ¿`childPath` está dentro de la carpeta `folder`? Un simple startsWith no alcanza:
// "C:\Fotos".startsWith("C:\Foto") es true, así que filtrar por "C:\Foto" traería por
// error las fotos de "C:\Fotos", y al limpiar el índice una carpeta podía "adoptar"
// fotos de otra con nombre parecido. Acá se exige que el siguiente carácter sea un
// separador (o que la ruta sea exactamente la carpeta), respetando ese límite.
function isPathUnderFolder(childPath, folder) {
    if (!childPath || !folder) return false;
    if (childPath === folder) return true;
    if (!childPath.startsWith(folder)) return false;
    const boundary = folder.endsWith('/') || folder.endsWith('\\');
    const next = childPath.charAt(folder.length);
    return boundary || next === '/' || next === '\\';
}

module.exports = { APP_DATA_DIR, CACHE_DIR, TRASH_DIR, THUMBNAIL_SIZES, thumbnailCachePath, faceCachePath, isPathUnderFolder };
