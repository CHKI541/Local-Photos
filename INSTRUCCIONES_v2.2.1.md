# Instrucciones para compilar Local Photos v2.2.1

**Autor:** Claude (Cowork). **Para:** Antigravity. **Fecha:** 2026-08-07.

Cambios pequeños sobre la v2.2 (ya implementados y probados en vivo por Claude). Aplicá los
archivos y **compilá la v2.2.1**. No rehagas nada desde cero (ver HANDOFF_CLAUDE.md → "NO pisar").

---

## Qué cambia en v2.2.1

1. **Fechas hebreas en NUMERALES hebreos (gematría)** — `public/ui-helpers.js`
   Antes se veían con dígitos occidentales ("6 בתשרי 5784"). Ahora en gematría real, p. ej.
   **"י״ג אב תשפ״ו"** (con gueresh ׳ / gershayim ״, y los casos ט״ו=15 / ט״ז=16). Se usa un
   conversor propio (`toHebrewNumeral`) + el calendario hebreo de `Intl`. Afecta a los
   encabezados del timeline y a la fecha hebrea del visor.

2. **Barra lateral (scrubber) en AÑOS hebreos** — `public/app.js`
   Cuando está activada la opción "ordenar por fecha hebrea", las etiquetas de la barra ahora
   muestran el **año hebreo** (תשפ״ו, תשפ״ה, … תשע״ו), agrupando y calculando por año/mes del
   calendario hebreo (no el gregoriano). La burbuja al arrastrar también sale en hebreo
   ("אב תשפ״ו"). Verificado: los años se calculan bien (2016→תשע״ו, 2024→תשפ״ד, 2026→תשפ״ו).

3. **Logo del header = ícono del programa** — `public/index.html` + `public/icon.png` (NUEVO)
   El header usaba un SVG dibujado a mano. Ahora usa el **PNG real del programa**
   (`public/icon.png`, copia de `build/icon.png`), así el logo de arriba siempre coincide con el
   ícono del `.exe`. También el favicon apunta a `icon.png`.

> Nota: si en el futuro cambian `build/icon.png`, copiar también a `public/icon.png` para que
> el logo del header siga coincidiendo.

---

## Archivos de v2.2.1 (usar los que te paso)

| Archivo | Cambio |
|---|---|
| `package.json` | versión → **2.2.1** |
| `public/ui-helpers.js` | conversor de gematría + fechas hebreas en numerales; helpers `formatHebrewYear`, `formatHebrewMonthYear`, `hebrewYearNum`, `hebrewMonthNum` |
| `public/app.js` | barra lateral por año/mes hebreo + etiquetas/burbuja en gematría |
| `public/index.html` | logo del header = `<img src="icon.png">`; favicon = `icon.png` |
| `public/icon.png` | **NUEVO** — copia de `build/icon.png` (logo del programa para el header) |

> No se tocó nada más. Todo lo de v2.2 (fecha hebrea configurable, rendimiento, bugs) sigue igual.

---

## Compilar

```bash
npm install
npm run dist
```
Resultado: `dist\Local Photos Setup 2.2.1.exe`.

### Verificación
- [ ] Con "ordenar por fecha hebrea" activo: los encabezados salen en gematría ("י״ג אב תשפ״ו").
- [ ] La barra lateral muestra años hebreos (תשפ״ו, תשפ״ה, …) y al arrastrar la burbuja sale en hebreo.
- [ ] El logo de arriba es el ícono del programa (cámara índigo/cyan); la pestaña también.
- [ ] Con las opciones apagadas, todo sigue en gregoriano como antes.
