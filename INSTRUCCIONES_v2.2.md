# Instrucciones para compilar Local Photos v2.2

**Autor:** Claude (Cowork). **Para:** Antigravity. **Fecha:** 2026-08-06.

Esta versión corrige el feedback del foro (usuarios en hebreo) y agrega opciones de fecha
hebrea. **Ya está implementado y probado en vivo por Claude.** Tu tarea es aplicar los
archivos y **compilar la v2.2**. No rehagas estos archivos desde cero (ver HANDOFF_CLAUDE.md,
sección "NO pisar").

---

## Qué incluye la v2.2

### Bugs corregidos
1. **Rutas con hebreo en "Explorar"** (`server.js`): PowerShell no emitía UTF-8, así que las
   rutas con hebreo/no-ASCII llegaban como `?`. Ahora se fuerza `[Console]::OutputEncoding = UTF8`
   y se escribe la ruta con `[Console]::Out.Write`. (El escaneo en sí ya manejaba bien el hebreo;
   el bug era solo el diálogo "Explorar".)
2. **Flechas del visor invertidas en hebreo (RTL)** (`style.css` + `lightbox.js`): la posición ya
   se invertía sola (inset-inline), pero el ícono chevron quedaba al revés. Se voltea en RTL
   (`html[dir="rtl"] .lightbox-nav i { transform: scaleX(-1) }`) y las flechas del teclado (←/→)
   también se adaptan a RTL.
3. **"La burbuja de info no muestra info"**: ya estaba corregido en el código actual (el panel EXIF
   se muestra bien: cámara, ISO, dimensiones, peso, ruta). El reporte del foro venía de un `.exe`
   viejo. **Se resuelve solo al redistribuir la v2.2.**

### Rendimiento
4. **Vuelta instantánea a "Fotos"** (`app.js`): antes, al volver desde Favoritos/otra sección, se
   volvía a pedir `/api/photos` y a reconstruir todo mostrando "Cargando fotos...". Ahora se
   reutiliza lo ya renderizado (flag `timelineDirty`, que solo se activa cuando algo cambió de
   verdad). Es instantáneo.

### Funciones nuevas: Fecha hebrea (3 opciones INDEPENDIENTES en Configuración)
Usan el **calendario hebreo nativo del navegador** (`Intl.DateTimeFormat('...-u-ca-hebrew')`):
100% offline, sin librerías nuevas. Se guardan en `db.json` (config) y por defecto están **apagadas**.
1. **Mostrar la fecha hebrea en las imágenes** (`showHebrewDate`): agrega la fecha hebrea en el
   panel de información del visor.
2. **Ordenar la línea de tiempo por fecha hebrea** (`sortByHebrewDate`): los encabezados de fecha
   de la cuadrícula se muestran en el calendario hebreo (p. ej. "20 באב 5786"). El orden
   cronológico no cambia; solo la etiqueta/agrupación. *(Nota: las etiquetas de AÑO de la barra
   lateral siguen en gregoriano — se puede pasar a año hebreo en una versión futura.)*
3. **Recuerdos según la fecha hebrea** (`memoriesHebrewDate`): la tira de "Recuerdos" compara el
   mismo día del calendario hebreo en años anteriores. *(Nota: los años bisiestos hebreos con
   Adar א׳/ב׳ son un caso borde aceptable.)*

---

## Archivos modificados en v2.2 (usar los que te paso)

| Archivo | Cambios |
|---|---|
| `package.json` | versión → **2.2.0** |
| `server.js` | encoding UTF-8 en `/api/browse-folder`; acepta las 3 opciones en `POST /api/config` |
| `database.js` | 3 opciones nuevas en config (defaultDb, ensureShape, saveConfig) |
| `public/app.js` | cache del timeline (perf); agrupación/encabezados por fecha hebrea; Recuerdos por fecha hebrea; carga de config (`window.appConfig`, `loadAppConfig`); wiring de los 3 toggles en Configuración |
| `public/lightbox.js` | teclado ←/→ adaptado a RTL; fecha hebrea en el panel de info |
| `public/ui-helpers.js` | helpers `formatHebrewDateLong`, `formatHebrewDayMonth`, `hebrewDayMonthKey` |
| `public/index.html` | sección "Fecha hebrea" con 3 toggles; elemento `#lightboxHebrewDate` en el visor |
| `public/style.css` | flip del chevron en RTL |
| `public/i18n.js` | claves `settings_hebrew_*` en es/en/he |

> No se tocaron: `scanner.js`, `paths.js`, `mediaActions.js`, `mediaTypes.js`, `concurrency.js`,
> `exifUtils.js`, `face-scanner.js`, `video-scanner.js`, `electron/main.js`.

---

## Cómo compilar la v2.2

Desde `C:\Users\israe\OneDrive\Documentos\Local Fotos`:

```bash
npm install            # asegura ffmpeg-static, electron y electron-builder (ya en package.json)
npm run dist           # genera el instalador
```

Resultado: `dist\Local Photos Setup 2.2.0.exe`. Ese es el archivo para compartir en el foro.

### Verificación rápida antes de publicar
- [ ] Abrir; agregar una carpeta con **"Explorar"** cuyo nombre tenga **hebreo** → la ruta se
      completa bien (sin `?`) y escanea.
- [ ] En hebreo, abrir el visor → las **flechas apuntan al lado correcto**.
- [ ] Abrir una foto → el **panel de info muestra los datos** (cámara/dimensiones/ruta).
- [ ] Ir a Favoritos y volver a Fotos → **no dice "Cargando"**, es instantáneo.
- [ ] Configuración → sección **"Fecha hebrea"** con 3 interruptores; activarlos y confirmar:
      encabezados en hebreo, fecha hebrea en el visor, y Recuerdos por fecha hebrea.

Todo esto Claude ya lo probó en vivo con Chromium; el binario de Electron usa el mismo motor,
así que el calendario hebreo de `Intl` funciona igual (Electron trae ICU completo).
