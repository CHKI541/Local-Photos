# Handoff Claude ⇄ Antigravity — Local Photos

**Fecha:** 2026-08-04
**Autor de este documento:** Claude (Cowork), trabajando junto con Israel.
**Para:** Antigravity (o cualquier IA/dev que siga tocando el proyecto).

Este documento existe para que **no nos pisemos los cambios** entre asistentes y para
dejar listo el empaquetado a `.exe`. Léelo **entero** antes de editar el proyecto.

Ruta del proyecto: `C:\Users\israe\OneDrive\Documentos\Local Fotos`

---

## 🆕 ACTUALIZACIÓN (2026-08-05) — leer primero

Desde la versión anterior de este handoff pasó lo siguiente (todo **revisado y funcionando**):

- **Gemini** agregó 3 features (Shift+clic por rango, traducción del aviso de papelera, **editar fecha** de fotos/videos) y **empaquetó el `.exe`** siguiendo este handoff (ffmpeg-static, `db.json` en `~/.local-photos` con migración, Electron/electron-builder). Lo revisé: **está bien hecho y no rompió nada.** De paso Gemini mejoró `updateStorageInfo`.
- **Claude corrigió 2 bugs** que se habían colado antes (ver PARTE 2): `loadSettings()` mal llamada y el título de la pestaña.
- **Claude aplicó 4 "quick-wins"** de las propuestas (ver PARTE 8), todas de bajo riesgo y probadas en vivo.

👉 Antes de tocar `public/app.js`, `public/lightbox.js` o `public/face-scanner.js`, mirá la PARTE 3 y la PARTE 8 para no pisar estos aportes.

---

## PARTE 0 — Reglas para no pisarnos (importante)

1. **Antes de reescribir un archivo completo, leé la PARTE 3** (lista de cambios de Claude
   que ya están en el código y deben conservarse). Si vas a editar `server.js`, `app.js`,
   `index.html`, `i18n.js`, `scanner.js`, `paths.js`, `lightbox.js`, `ui-helpers.js` o
   `face-scanner.js`, hacelo con **ediciones puntuales**, no regenerando el archivo desde cero.
2. Cuando termines una tanda de cambios, **actualizá este archivo** (o dejá uno nuevo
   `HANDOFF_ANTIGRAVITY.md`) listando qué tocaste, para que Claude tampoco te pise a vos.
3. El proyecto ya está **verificado y funcionando** al momento de escribir esto (ver PARTE 1).

---

## PARTE 1 — Estado actual verificado ✅

Levanté la app real y la recorrí con un navegador automatizado. **Todo esto funciona hoy:**

- **Rebranding a "Local Photos"** (marca del sidebar, título de pestaña, favicon de cámara indigo/cyan).
- **Rediseño visual** limpio (paleta indigo/cyan, sombras y bordes suaves).
- **Miniaturas de video con `ffmpeg`**: probado con `.mp4` **y `.mkv`** — ambos generan
  vista previa correctamente (frame extraído por ffmpeg) y se ven en la grilla con su badge ▶.
  ⚠️ **Depende de que `ffmpeg` esté disponible** — ver PARTE 4 (esto hay que resolverlo para el `.exe`).
- **Contador de caras global y persistente**: la píldora "Analizando caras (X/Y)" ahora muestra
  el total real de la biblioteca y sobrevive al reinicio (se recalcula desde `db.json`).
- **Widget de almacenamiento removido** del sidebar (queda solo "Configurar carpetas").
- **Botón "Explorar…"** en Configuración abre el diálogo nativo de Windows para elegir carpeta.
- **Modo 100% offline** (aporte previo de Claude): íconos, tipografías y Leaflet salen de
  `public/vendor/` — verifiqué **0 peticiones a internet** al abrir la app. (Los *tiles* del
  mapa de "Lugares" siguen necesitando internet; eso es inevitable en cualquier mapa.)

---

## PARTE 2 — Bugs que Antigravity introdujo y Claude ya corrigió 🔧

Estos dos ya están arreglados en el código (los escribí en disco). **No los reviertan.**

1. **`app.js` — Configuración estaba rota.** La función se renombró a `loadSettings()`, pero
   `navigateTo()` seguía llamando a `loadSettingsPage()` → `ReferenceError` al abrir Configuración,
   y `pendingFolders` quedaba vacío (riesgo de **borrar las carpetas configuradas** al guardar).
   - **Fix:** en `navigateTo`, la línea ahora dice `else if (pageName === 'settings') loadSettings();`
   - **Fix extra:** `loadSettings()` ahora llama a `applyThresholdDescription()` para localizar el
     texto de sensibilidad de agrupamiento.

2. **`i18n.js` — el título de la pestaña seguía diciendo "Google Fotos/Photos - Local".**
   `applyLanguageToDocument()` pisa `document.title` con la clave `page_title_html`, que no se
   había renombrado.
   - **Fix:** `page_title_html` = `'Local Photos'` en los 3 idiomas (es/en/he).

---

## PARTE 3 — ⚠️ Cambios de Claude que NO hay que pisar

Estos son aportes de una revisión previa que **ya están integrados y funcionando**. Si regenerás
un archivo desde una base vieja, los perdés (ya pasó una vez). Marcadores para detectar si siguen:

| Archivo | Qué hace | Marcador (grep) |
|---|---|---|
| `scanner.js` | Fecha de nombres tipo `20220803_...`, `PXL_...` (Android/Pixel/WhatsApp) | `(?<![0-9])(19\d{2}|20[0-3]\d)` |
| `paths.js` + `server.js` + `scanner.js` | `isPathUnderFolder()` (evita que `C:\Fotos` traiga fotos de `C:\FotosViejas`) | `isPathUnderFolder` |
| `server.js` | Orden de `/api/photos` calculando el timestamp una sola vez | `const sortKey` |
| `lightbox.js` | Muestra el bloque EXIF del visor (cámara/ISO/dimensiones/peso/ruta) | `lightboxExifBlock').style.display` |
| `ui-helpers.js` | `formatMonthYear` capitaliza la primera letra | `charAt(0).toUpperCase()` |
| `app.js` | **Barra lateral de años/meses calibrada** (usa `maxScroll`, Recuerdos antes de la barra, reajuste en resize, etiquetas por prominencia) | `maxScroll` |
| `app.js` | Fuga de memoria del observer de la grilla | `groupObserver.disconnect` |
| `app.js` | Guard de "Lugares" si Leaflet no cargó | `typeof L === 'undefined'` |
| `i18n.js` | Claves `places_map_unavailable_*` (aviso amable de Lugares sin internet) | `places_map_unavailable` |
| `face-scanner.js` | Reagrupa solo si el lote encontró caras nuevas (no en cada lote) | `facesFoundThisBatch` |
| `public/vendor/**` + `index.html` | **Modo offline**: fuentes/FontAwesome/Leaflet locales | `vendor/` en index.html, `0` refs a `cdnjs/unpkg/googleapis` |

> Si vas a editar `app.js`/`server.js`/`index.html`/`i18n.js`, editá **solo** las partes que
> necesitás y dejá lo de arriba intacto.

---

## PARTE 4 — Recomendaciones pendientes (aplicar antes o durante el empaquetado)

### 4.1 (IMPORTANTE) Videos portables: usar `ffmpeg-static` en vez del `ffmpeg` del sistema
Hoy `server.js` llama a `ffmpeg` asumiendo que está instalado en la PC. En una PC sin ffmpeg,
**los videos vuelven a no tener vista previa**, y un `.exe` para compartir no puede depender de eso.

**Solución:** bundlear el binario con el paquete npm `ffmpeg-static` y, de paso, usar `execFile`
(sin shell) para evitar problemas con rutas raras. En `server.js`:

```js
// arriba, junto a los require:
const ffmpegStatic = require('ffmpeg-static'); // ruta absoluta al binario incluido
// En un .exe empaquetado el binario queda fuera del asar:
const FFMPEG_BIN = ffmpegStatic
  ? ffmpegStatic.replace('app.asar' + path.sep, 'app.asar.unpacked' + path.sep)
  : 'ffmpeg';
```

Y dentro de `generateVideoThumbnail`, reemplazar el `exec('ffmpeg ...')` por `execFile`:

```js
const seekSeconds = (photo.duration && photo.duration > 1.5) ? '00:00:01' : '00:00:00';
await new Promise((resolve, reject) => {
  execFile(FFMPEG_BIN, ['-ss', seekSeconds, '-i', photo.path, '-vframes', '1', '-q:v', '2', tmpFramePath, '-y'],
    { windowsHide: true }, (err) => err ? reject(err) : resolve());
});
```
(igual para el fallback `00:00:00`). Instalar: `npm i ffmpeg-static`.

### 4.2 (CRÍTICO para el .exe) `db.json` debe ir a una carpeta escribible
En un `.exe`, el código queda dentro de `app.asar`, que es **de solo lectura**. Hoy `database.js`
guarda `db.json` en la carpeta del proyecto (`__dirname`) → **al empaquetar, fallarían todas las
escrituras** (favoritos, álbumes, caras, escaneo). El caché y la papelera ya viven en
`os.homedir()/.local-photos` (bien); `db.json` tiene que ir ahí también.

En `database.js`:
```js
const { APP_DATA_DIR } = require('./paths');   // ya existe y apunta a ~/.local-photos
const DB_PATH = path.join(APP_DATA_DIR, 'db.json');
const DB_TMP_PATH = path.join(APP_DATA_DIR, 'db.json.tmp');

// Migración de una sola vez: si aún no hay db.json nuevo pero sí el viejo en la
// carpeta del proyecto, copiarlo para no perder la biblioteca ya escaneada.
const LEGACY_DB = path.join(__dirname, 'db.json');
try {
  if (!fs.existsSync(DB_PATH) && fs.existsSync(LEGACY_DB)) fs.copyFileSync(LEGACY_DB, DB_PATH);
} catch (e) { /* no crítico */ }
```
> ⚠️ Sin la migración, el usuario "pierde" su biblioteca (la app arrancaría con `db.json` vacío
> en la ubicación nueva). Con la migración, se copia sola la primera vez.

---

## PARTE 5 — Empaquetado a `.exe` (recomendado: Electron)

**Objetivo:** un instalador para cualquier PC Windows, **sin ventana negra de consola**, que se
vea como una app (misma interfaz web, sin barra de navegador).

**Por qué Electron:** la app ya es un servidor Node + web; Electron la envuelve en una ventana
limpia y `electron-builder` genera un **instalador `.exe`** (compartible). Maneja el módulo nativo
`sharp` y permite incluir `ffmpeg-static`. Es la opción más profesional y robusta.

> No se puede compilar/probar el `.exe` de Windows desde el entorno de Claude (es Linux y `sharp`
> es nativo). **Antigravity debe hacer el build en la PC Windows del usuario**, siguiendo estos pasos.

### Paso 1 — Aplicar 4.1 y 4.2 (ffmpeg-static + db.json escribible). Sin eso, el .exe no anda bien.

### Paso 2 — Instalar dependencias de empaquetado
```bash
npm i ffmpeg-static
npm i -D electron electron-builder
```

### Paso 3 — Archivo nuevo `electron/main.js`
Ya está hecho (te lo dejo junto a este documento, en `electron/main.js`). Copialo a
`Local Fotos/electron/main.js`. Arranca `server.js` en el propio proceso de Electron, espera a que
el servidor responda y abre la ventana en `http://localhost:8080` sin barra de navegador.

### Paso 4 — Ajustes en `package.json`
Agregá/ajustá estas claves (respetando las dependencias que ya están):
```jsonc
{
  "main": "electron/main.js",
  "scripts": {
    "start": "node server.js",
    "electron": "electron .",
    "dist": "electron-builder --win"
  },
  "build": {
    "appId": "com.israel.localphotos",
    "productName": "Local Photos",
    "files": ["**/*", "!_backup*", "!_to_delete/**", "!_rev/**", "!CAMBIOS_REALIZADOS.md", "!HANDOFF_*.md", "!**/*.map"],
    "asarUnpack": [
      "**/node_modules/sharp/**",
      "**/node_modules/@img/**",
      "**/node_modules/ffmpeg-static/**"
    ],
    "win": { "target": "nsis", "icon": "build/icon.ico" },
    "nsis": { "oneClick": false, "allowToChangeInstallationDirectory": true, "perMachine": false }
  }
}
```
- `asarUnpack` es **obligatorio**: `sharp` (binario nativo, con sus paquetes `@img/sharp-win32-*`)
  y `ffmpeg-static` no pueden ejecutarse desde adentro del `.asar`.
- Poné un ícono en `build/icon.ico` (256×256). Podés reusar la cámara indigo/cyan del favicon.

### Paso 5 — Build
```bash
npm run dist
```
Genera el instalador en `dist/Local Photos Setup <versión>.exe`. Ese es el archivo para compartir.

### Gotchas / verificaciones
- **`public/vendor/`, `public/models/`, `public/face-api.js`** deben quedar dentro del paquete
  (el patrón `files: ["**/*"]` los incluye — no los excluyas).
- Si el puerto 8080 está ocupado, la ventana queda en blanco. Opcional: elegir un puerto libre
  dinámicamente (o cambiar `LP_PORT` en `electron/main.js`).
- El diálogo "Explorar…" usa PowerShell → solo Windows (perfecto para el `.exe`).
- Probar tras instalar: abrir la app, agregar una carpeta, escanear, ver fotos, ver una miniatura
  de video, abrir el visor (EXIF), y confirmar que `~/.local-photos/db.json` se crea/actualiza.

---

## PARTE 6 — Alternativa liviana (si no querés los ~150 MB de Electron)

**`pkg` + arranque oculto + navegador del sistema.** Empaqueta Node + el código en un
`LocalPhotos.exe` chico; un lanzador oculta la consola y abre el navegador por defecto en
`http://localhost:8080` (se ve "como Google Fotos" en tu navegador real).
- Instalar: `npm i -D @yao-pkg/pkg` (fork mantenido de `pkg`).
- Incluir como *assets* los binarios nativos de `sharp` (`node_modules/@img/**`) y `ffmpeg-static`,
  además de `public/**`, `models/**`, `vendor/**`.
- Para que no se vea la consola: compilar el lanzador en modo *GUI subsystem*, o usar un pequeño
  `LocalPhotos.vbs` que ejecute el `.exe` oculto (`WScript.Shell` con ventana 0).
- `db.json` igual debe ir a `~/.local-photos` (PARTE 4.2).
- Contras: `pkg` + módulos nativos es más frágil que Electron, y no da un instalador "de verdad"
  (compartís una carpeta/zip). Por eso **se recomienda Electron**.

---

## PARTE 7 — Checklist final (después del build)
- [ ] La app abre **sin ventana de consola negra**.
- [ ] Se ve la interfaz "Local Photos" (marca + título de pestaña correctos).
- [ ] Agregar carpeta (con "Explorar…") y escanear funciona.
- [ ] Las **miniaturas de video** se ven (probar con un `.mkv` o `.mov`, no solo `.mp4`).
- [ ] "Analizando caras (X/Y)" muestra el total real y persiste al reabrir.
- [ ] Íconos y tipografías se ven **sin internet** (modo offline).
- [ ] `~/.local-photos/db.json` se crea y guarda (favoritos/álbumes sobreviven al reinicio).
- [ ] El instalador `.exe` se puede copiar a otra PC y funciona sin instalar Node ni ffmpeg.

---

## PARTE 8 — Quick-wins aplicadas por Claude (2026-08-05) + propuestas

De `PROPUESTAS_Y_OPTIMIZACIONES.md`, Claude aplicó solo estas **quick-wins seguras** (probadas en vivo). **No pisarlas** (marcadores para grep):

| Archivo | Qué | Marcador |
|---|---|---|
| `public/app.js` | Modal de **ayuda de atajos** con tecla `?` (textos es/en/he embebidos) | `SHORTCUTS_STRINGS` |
| `public/app.js` | **Ctrl/Cmd + A** = seleccionar todo lo visible | `selectAllVisible` |
| `public/lightbox.js` | **Slideshow en orden aleatorio** (Fisher-Yates); la navegación manual sigue secuencial | `buildShuffledOrder` |
| `public/face-scanner.js` | **Filtro de calidad de caras** (descarta < 40px → menos personas falsas) | `box.width >= 40` |

Ya estaba implementado (no rehacer): scrubber de fechas, exportar ZIP, Recuerdos, scroll virtual, caché de miniaturas 2 niveles, lazy-load, clustering por centroides, merge de personas, alineación por landmarks (la hace face-api), y **encabezados de fecha sticky**.

**Excluido a pedido del usuario:** Recuerdos (ya existe) y Álbumes inteligentes automáticos.

**Propuestas NO aplicadas (recomendadas a futuro, requieren más trabajo/decisión):** valoración con estrellas, chips de filtro en header, panel de estadísticas, archivar/ocultar, split de caras, deduplicador por hash, vista calendario/heatmap, tags jerárquicos, editor no destructivo, QR en red local (⚠️ expone fotos en la LAN), PIN, HEIC (⚠️ `sharp` normalmente no trae HEIC compilado → daría error), WebP/AVIF y BlurHash (regeneran todo el caché), Service Worker, migración a SQLite. Si se toma alguna, hacerla como cambio aislado y probar.
