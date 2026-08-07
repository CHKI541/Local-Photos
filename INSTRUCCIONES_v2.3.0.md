# Instrucciones para compilar Local Photos v2.3.0

**Autor:** Claude (Cowork). **Para:** Antigravity. **Fecha:** 2026-08-07.

Correcciones sobre la v2.2.1 (ya implementadas y probadas por Claude). Aplicá los archivos
que te paso y **compilá la v2.3.0**. No rehagas nada desde cero (ver HANDOFF_CLAUDE.md → "NO pisar").

---

## Qué se corrige en v2.3.0

### 1. Fecha hebrea con "año/día menos" (bug principal) — `public/ui-helpers.js`, `public/app.js`
**Causa raíz:** la app calculaba la fecha convirtiendo primero la hora de cada foto a la zona
horaria local del equipo (Buenos Aires, UTC-3). Las fotos sacadas después de medianoche
"retrocedían" un día, y justo en Rosh Hashaná ese día de menos se convertía en un **año hebreo
de menos**. Por eso se veía como "año menos / todo cae mal" (~8% de las fotos, las de 00:00–02:59).

**Arreglo:** todas las fechas (gregoriana y hebrea) se calculan sobre la **hora real de captura**
de la foto (los componentes UTC del ISO guardado), con `timeZone:'UTC'`. Ya **no** se convierte a
la zona local. Así la fecha coincide siempre con el reloj de la cámara, y el gregoriano y el
hebreo quedan idénticos entre sí. La fecha hebrea se ancla al mediodía UTC del día de captura
(inmune a horario de verano). *(No se toca el tema del anochecer: el día hebreo cambia a
medianoche, igual que el gregoriano.)*

Verificado en la zona de Buenos Aires: `2025-09-23T00:30Z` → **א׳ תשרי תשפ״ו** (antes daba
כ״ט אלול תשפ״ה = un año menos). Gregoriano y UTC ahora dan el mismo resultado.

### 2. Mes hebreo que quedaba en `NaN` — `public/ui-helpers.js`
Al pedir día+mes+año juntos, `Intl` devuelve el **nombre** del mes ("Shevat"), no un número, así
que `hebrewMonthNum` daba `NaN` y rompía el agrupado del nav lateral y la clave de "Recuerdos".
Ahora se usa ese nombre estable como clave (distingue "Adar I"/"Adar II" en años bisiestos).

### 3. Panel de información vacío en hebreo (RTL) — `public/style.css`
**Causa:** la regla CSS `html[dir="rtl"] .lightbox-info-panel` era más específica que
`.lightbox-info-panel.visible`, así que en hebreo el panel quedaba **siempre** fuera de pantalla
al abrirlo → "no muestra nada". **Arreglo:** la regla de ocultar ahora lleva `:not(.visible)`,
así el estado abierto siempre gana. (En español/inglés ya andaba; el bug era solo en RTL.)

### 4. La fecha hebrea del visor no se actualizaba al cambiar la fecha — `public/lightbox.js`
Al editar la fecha se refrescaba solo la gregoriana. Ahora se repinta todo el panel
(incluida la hebrea). El editor de fecha además trabaja en hora real de la foto (ida y vuelta sin desfase).

### 5. Re-escaneo de carpetas en cada apertura — `server.js`, `database.js`, `public/index.html`, `public/i18n.js`, `public/app.js`
Antes el servidor re-escaneaba las carpetas en **cada** arranque. Ahora **no** escanea al abrir:
usa el índice ya guardado en `db.json` y abre al instante. Se agregó la opción
**"Escanear las carpetas al abrir la app"** en Configuración (por defecto **apagada**). Para sumar
fotos nuevas: botón **"Guardar y Escanear Ahora"**, o activar esa opción.

---

## Archivos de v2.3.0 (usar los que te paso)

| Archivo | Cambio |
|---|---|
| `package.json` | versión → **2.3.0** |
| `public/ui-helpers.js` | fechas en hora real de la foto (UTC) → corrige "año/día menos"; mes hebreo estable (no más NaN); editor de fecha en hora real |
| `public/app.js` | grilla, nav de años y "Recuerdos" consistentes con la hora real (UTC); guardado del nuevo interruptor |
| `public/lightbox.js` | refresca la fecha hebrea del panel al cambiar la fecha |
| `public/style.css` | panel de información visible en hebreo (RTL) |
| `public/index.html` | interruptor "Escanear al abrir" en Configuración |
| `public/i18n.js` | textos del interruptor (es / en / he) |
| `server.js` | no re-escanea al abrir salvo que `scanOnStartup` esté activo |
| `database.js` | nueva opción de config `scanOnStartup` (por defecto `false`) |

> No se tocó nada más. Todo lo de v2.2.x (gematría, rendimiento, reconocimiento facial, etc.) sigue igual.

---

## Compilar

```bash
npm install
npm run dist
```
Resultado: `dist\Local Photos Setup 2.3.0.exe`.

### Verificación
- [ ] Con "ordenar por fecha hebrea" activo: los encabezados salen correctos, sin "año menos"
      (probá una foto de la madrugada y una cercana a Rosh Hashaná).
- [ ] La fecha hebrea coincide con la gregoriana de la misma foto (mismo día real de captura).
- [ ] En hebreo, el botón de información (ℹ) del visor **abre el panel** y muestra los datos.
- [ ] Al abrir la app **no** aparece la pantalla de "indexando"; abre al instante.
- [ ] En Configuración está el interruptor "Escanear las carpetas al abrir la app" (apagado).
- [ ] Con "Guardar y Escanear Ahora" sí escanea y suma fotos nuevas.
