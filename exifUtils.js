// Las fotos verticales de celular casi siempre se guardan con los píxeles en
// orientación "horizontal" más una etiqueta EXIF (Orientation 5-8) que le dice al
// visor "rotar 90°/270° al mostrar". sharp NO aplica esto automáticamente al leer
// metadata() -- width/height siguen siendo los del sensor, no los de la imagen ya
// rotada -- así que hay que corregirlo a mano en cualquier lugar donde se usen esas
// dimensiones para diseñar layout o para mapear coordenadas normalizadas (recorte de
// caras). Ambos casos usan esta misma función para no tener dos implementaciones que
// puedan desincronizarse.
function displayDimensions(width, height, orientation) {
    if (orientation && orientation >= 5 && orientation <= 8) {
        return { width: height, height: width };
    }
    return { width, height };
}

module.exports = { displayDimensions };
