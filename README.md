# Google Fotos Local

Galería de fotos y videos de tu PC, con la interfaz y funciones al estilo Google Fotos, corriendo 100% en tu máquina.

## Requisitos

- [Node.js](https://nodejs.org) 18 o superior (recomendado 20+).

## Instalación y ejecución

**Windows:** doble clic en `start.bat`. La primera vez instala las dependencias automáticamente y después abre el navegador solo.

**Cualquier sistema (manual):**

```bash
npm install
npm start
```

Después abre `http://localhost:8080` en tu navegador.

En el primer uso, andá a **Configuración** (ícono de engranaje) y agregá la carpeta o carpetas donde tenés tus fotos (por ejemplo `E:\Fotos` o `C:\Users\tu_usuario\Pictures`). Guardá, y el escaneo empieza solo.

---

## Qué hay de nuevo respecto a la versión anterior

Revisé el proyecto completo a fondo. Estas son las funciones que se agregaron y los errores que se corrigieron.

### Idiomas

La app ahora está disponible en **español, inglés y hebreo** (con hebreo mostrado correctamente de derecha a izquierda, incluyendo el menú, los íconos y las animaciones). Al abrir la app por primera vez, se usa automáticamente el idioma de tu sistema/navegador si es uno de los tres soportados; si no, cae a español. Podés cambiarlo en cualquier momento con el ícono de globo 🌐 en la barra superior — tu elección se guarda y se recuerda la próxima vez que abras la app.

### Funciones nuevas (para que sea "como Google Fotos" de verdad)

- **Selección múltiple**: pasá el cursor sobre una foto para ver el círculo de selección, o hacé clic para seleccionar varias. Aparece una barra de acciones (favorito, añadir a álbum, descargar, papelera).
- **Favoritos**: estrella en cada foto + una sección "Favoritos" en el menú.
- **Papelera**: eliminar ya no borra directo. Se mueve a una papelera (con "Deshacer" al toque), y se elimina definitivamente a los 30 días (configurable) o cuando vos quieras.
- **Álbumes reales**: creá álbumes, ponéles nombre, agregá y quitá fotos. Las carpetas de tu PC se siguen viendo aparte, en "Carpetas".
- **Videos**: se indexan junto con las fotos, con miniatura, duración y reproductor en el visor. Sección "Videos" dedicada.
- **Reconocimiento facial, funcionando de verdad**: en la versión que subiste, el HTML pedía dos archivos (`face-api.js` y `face-scanner.js`) que no estaban incluidos en el volcado de código, así que la sección "Personas" nunca hacía nada. Los agregué (la librería y los modelos de reconocimiento están incluidos en `public/models/`, así que funciona 100% offline, nada de tus fotos sale de tu PC). Corre en segundo plano de a poco, sin trabar la app; se puede apagar desde Configuración.
- **Visor mejorado**: zoom (rueda del mouse o doble clic) y arrastre, panel de información con datos EXIF (cámara, ISO, apertura, dimensiones, peso, ruta), presentación de diapositivas, atajos de teclado (`←/→` navegar, `f` favorito, `Supr` papelera, `i` info, `+/-` zoom, `0` reset, `Esc` cerrar).
- **Recuerdos**: tira arriba de "Fotos" mostrando "hace X años" cuando hay fotos de la misma fecha en años anteriores.
- **Densidad de la cuadrícula**: 3 tamaños de miniatura (botones arriba a la derecha).
- **Búsqueda** por nombre de archivo, carpeta o persona (ya existía, ahora también filtra en Favoritos/Videos).
- **Diseño responsive**: usable en una ventana angosta o desde el celular en la misma red (menú lateral colapsable).
- **Descarga en ZIP** de varias fotos seleccionadas a la vez (hasta 300).
- Avisos con **notificaciones tipo "toast"** en vez de los `alert()`/`confirm()` nativos del navegador, que cortaban el flujo.

### Errores corregidos

- **Pérdida de datos silenciosa**: si el proceso se cerraba justo mientras se guardaba `db.json`, el archivo podía quedar corrupto, y al reabrir la app se perdían todos los nombres de personas, álbumes y favoritos sin ningún aviso. Ahora el guardado es atómico (nunca deja un archivo a medias) y si igual detecta uno dañado, hace una copia de respaldo y avisa por consola en vez de descartarlo en silencio.
- **Lentitud al escanear bibliotecas grandes**: cada foto se buscaba con una búsqueda lineal sobre todas las demás (O(n²)) — con 50.000 fotos son miles de millones de comparaciones. Ahora usa índices internos (O(1)). Además, un re-escaneo ahora se salta los archivos que no cambiaron (mismo tamaño y fecha de modificación), así que reabrir la app es casi instantáneo la segunda vez.
- **Fotos verticales giradas**: las fotos de celular en modo retrato se guardan con los píxeles "acostados" más una etiqueta EXIF de rotación. Las miniaturas no la tenían en cuenta y podían verse giradas 90°; se corrigió (afecta también al recorte de caras, que antes podía quedar desalineado en fotos verticales).
- **El servidor se podía caer entero**: al abrir una foto con la app del sistema, si el comando fallaba (por ejemplo corriendo en un sistema donde no existe `explorer.exe`), Node lo trataba como un error no controlado y tumbaba **todo el servidor**, no solo esa acción. Corregido, y además ahora funciona también en Mac/Linux, no solo Windows.
- **Seguridad**: el servidor tenía CORS abierto a cualquier origen. Como este servidor puede leer todas tus fotos y abrir aplicaciones del sistema, eso significaba que cualquier página maliciosa que visitaras mientras la app estaba corriendo podía, en teoría, pedirle datos o acciones sin que te dieras cuenta. Se sacó (no hace falta para que la app funcione, porque el frontend se sirve desde el mismo servidor) y se agregó una verificación de origen extra.
- **Visor de caras lento**: cada vez que pasabas de foto en el visor, se pedían **todas** las personas de la biblioteca entera solo para mostrar las caras de esa foto. Ahora hay un endpoint dedicado que devuelve solo lo necesario.
- **Clic accidental**: un solo clic en una foto abría el Explorador de Windows. Ahora un clic abre el visor (como en Google Fotos); "abrir con la app del sistema" sigue disponible como botón dentro del visor.
- **El agrupamiento de caras podía trabar el servidor entero**: con muchas caras y personas, el cálculo podía tardar varios segundos ejecutándose de un tirón, dejando la app entera sin responder mientras tanto (ni miniaturas, ni nada). Ahora cede el control periódicamente.
- Datos de almacenamiento **simulados** ("512 GB estimado", cálculo aproximado) reemplazados por tamaños reales de tus archivos y espacio real de disco.
- Se agregó soporte para reproducir/saltar dentro de videos (`Range requests`), sin el cual los videos no se pueden buscar/adelantar correctamente.

### Rendimiento

- La cuadrícula de fotos ahora se **virtualiza**: solo arma las miniaturas de lo que está cerca de la pantalla; el resto se reserva como espacio en blanco del tamaño correcto y se rellena a medida que scrolleás. Esto es lo que evita que la app se ponga lenta o consuma mucha memoria con bibliotecas de decenas de miles de fotos.
- Escaneo de disco con varios archivos en paralelo en vez de uno por uno.
- Miniaturas separadas por tamaño (una chica para la cuadrícula, una mediana para el visor) en vez de mandar la foto original de la cámara (puede pesar varios MB) solo para mostrarla en pantalla.

---

## Privacidad y funcionamiento offline

Todo — fotos, miniaturas, base de datos, reconocimiento facial — se queda en tu PC. Nada se sube a ningún servidor externo.

La única excepción es la sección **Lugares** (mapa), que descarga los "tiles" del mapa desde OpenStreetMap, y los íconos/tipografías/mapa que se cargan desde CDNs la primera vez que abrís la app (necesitás internet para eso específicamente; el resto funciona sin conexión).

## Estructura del proyecto

```
server.js          Servidor Express y todas las rutas de la API
database.js         Capa de datos (db.json), con índices en memoria
scanner.js           Escaneo de carpetas y extracción de metadatos
mediaActions.js       Papelera / restaurar / eliminar (movimiento de archivos)
paths.js, mediaTypes.js, exifUtils.js, concurrency.js   Utilidades compartidas
public/
  index.html, style.css
  app.js              Lógica principal: navegación, cuadrícula, álbumes, personas
  lightbox.js          Visor a pantalla completa
  face-scanner.js       Reconocimiento facial en segundo plano
  video-scanner.js      Miniaturas de video
  ui-helpers.js          Toasts, modales, helpers de formato
  face-api.js, models/    Librería y modelos de reconocimiento facial (offline)
```

## Solución de problemas

- **"No se pudo conectar"**: asegurate de tener el servidor corriendo (`npm start` o `start.bat`) y de estar entrando a `http://localhost:8080`.
- **La sección Personas está vacía**: el reconocimiento facial corre de a poco en segundo plano (mirá el indicador "Analizando caras" arriba a la derecha); en una biblioteca grande puede tardar. También podés forzar un agrupamiento manual con el botón "Agrupar rostros ahora" en la página de Personas.
- **Un video no se reproduce en el visor**: algunos formatos/códecs no los puede decodificar el navegador. La app lo detecta y te ofrece "Abrir con la app del sistema" en su lugar.
- **Cambié de carpeta una foto y no aparece**: usá el botón de escanear en Configuración, o esperá al próximo reinicio de la app (escanea sola al arrancar si ya tenés carpetas configuradas).
