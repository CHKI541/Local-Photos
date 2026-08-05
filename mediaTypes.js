// Formatos soportados. Las imágenes se limitan a formatos que (a) sharp puede
// procesar para generar miniaturas y (b) los navegadores pueden mostrar de forma
// nativa en una <img> a tamaño completo (por eso NO se incluyen HEIC/TIFF: sharp en
// muchos casos no trae soporte de HEIC compilado, y ningún navegador salvo Safari
// muestra TIFF/HEIC de forma nativa, así que "soportarlos" a medias solo generaría
// miniaturas rotas).
const IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif']);

// Para video se indexan más contenedores de los que el navegador puede reproducir de
// forma nativa, porque aun si el navegador no puede reproducirlo in-app, el archivo
// se sigue viendo en la biblioteca, con fecha y opción de "abrir con la app
// predeterminada". Si el navegador SÍ puede decodificarlo, además se genera una
// miniatura real y duración (ver public/video-scanner.js).
const VIDEO_EXTENSIONS = new Set(['.mp4', '.m4v', '.mov', '.webm', '.avi', '.mkv', '.3gp']);

const SUPPORTED_EXTENSIONS = new Set([...IMAGE_EXTENSIONS, ...VIDEO_EXTENSIONS]);

const MIME_TYPES = {
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.webp': 'image/webp',
    '.gif': 'image/gif',
    '.mp4': 'video/mp4',
    '.m4v': 'video/mp4',
    '.mov': 'video/quicktime',
    '.webm': 'video/webm',
    '.avi': 'video/x-msvideo',
    '.mkv': 'video/x-matroska',
    '.3gp': 'video/3gpp'
};

function isVideoExt(ext) {
    return VIDEO_EXTENSIONS.has(ext.toLowerCase());
}

function mimeFor(ext) {
    return MIME_TYPES[ext.toLowerCase()] || 'application/octet-stream';
}

module.exports = { IMAGE_EXTENSIONS, VIDEO_EXTENSIONS, SUPPORTED_EXTENSIONS, MIME_TYPES, isVideoExt, mimeFor };
