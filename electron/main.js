// ============================================================
// electron/main.js — Envoltorio de escritorio para Local Photos.
//
// Qué hace:
//   1. Arranca el servidor Express existente (server.js) DENTRO de este
//      mismo proceso de Electron (no abre ninguna consola negra).
//   2. Espera a que el servidor responda en http://localhost:PORT.
//   3. Abre una ventana de aplicación limpia (sin barra de navegador)
//      que muestra la interfaz web tal cual — se ve como una app, con la
//      misma estética "estilo navegador" de la app actual.
//
// Empaquetado con electron-builder -> instalador .exe para cualquier PC.
// Ver HANDOFF_CLAUDE.md para los pasos y los cambios de código requeridos.
// ============================================================

const { app, BrowserWindow, shell } = require('electron');
const path = require('path');
const http = require('http');

// Puerto interno. Si querés evitar choques con otra cosa en 8080, cambialo acá
// y en el resto será transparente (la ventana usa este mismo valor).
const PORT = process.env.LP_PORT || 8080;
process.env.PORT = PORT;

// Una sola instancia: si el usuario abre el .exe dos veces, enfocamos la
// ventana existente en vez de levantar un segundo servidor sobre el mismo puerto.
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
    app.quit();
} else {
    let mainWindow = null;

    app.on('second-instance', () => {
        if (mainWindow) {
            if (mainWindow.isMinimized()) mainWindow.restore();
            mainWindow.focus();
        }
    });

    // Arranca el servidor Express en este proceso. server.js hace app.listen(PORT).
    // (En el paquete, __dirname de server.js apunta dentro de app.asar; Electron
    //  parcha fs para poder LEER de ahí, así que servir la UI estática funciona.
    //  OJO: escribir db.json NO puede ir dentro del asar — ver HANDOFF_CLAUDE.md,
    //  hay que mover db.json a app.getPath('userData').)
    function startServer() {
        try {
            require(path.join(__dirname, '..', 'server.js'));
        } catch (e) {
            console.error('No se pudo iniciar el servidor interno:', e);
        }
    }

    // Poll hasta que el servidor conteste, así la ventana no carga una página en blanco.
    function waitForServer(url, timeoutMs = 20000) {
        const start = Date.now();
        return new Promise((resolve, reject) => {
            (function ping() {
                const req = http.get(url, res => { res.resume(); resolve(); });
                req.on('error', () => {
                    if (Date.now() - start > timeoutMs) return reject(new Error('timeout'));
                    setTimeout(ping, 300);
                });
                req.setTimeout(1500, () => { req.destroy(); });
            })();
        });
    }

    function createWindow() {
        mainWindow = new BrowserWindow({
            width: 1400,
            height: 900,
            minWidth: 900,
            minHeight: 600,
            backgroundColor: '#ffffff',
            autoHideMenuBar: true,       // sin barra de menú (File/Edit/…): se ve como app, no como navegador
            icon: path.join(__dirname, 'icon.png'), // ver HANDOFF: icono 256x256 (o .ico en build)
            title: 'Local Photos',
            show: false,
            webPreferences: {
                contextIsolation: true,
                nodeIntegration: false   // la UI es una web normal; no necesita Node en el render
            }
        });

        mainWindow.once('ready-to-show', () => mainWindow.show());

        // Los enlaces externos (p. ej. tiles/atribución de OpenStreetMap) se abren en
        // el navegador del sistema, no dentro de la app.
        mainWindow.webContents.setWindowOpenHandler(({ url }) => {
            shell.openExternal(url);
            return { action: 'deny' };
        });

        const appUrl = `http://localhost:${PORT}`;
        waitForServer(appUrl)
            .then(() => mainWindow.loadURL(appUrl))
            .catch(() => mainWindow.loadURL('data:text/html,<h2 style="font-family:sans-serif;padding:40px">No se pudo iniciar Local Photos. Cerrá y volvé a abrir la aplicación.</h2>'));
    }

    app.whenReady().then(() => {
        startServer();
        createWindow();
        app.on('activate', () => {
            if (BrowserWindow.getAllWindows().length === 0) createWindow();
        });
    });

    app.on('window-all-closed', () => {
        // En Windows/Linux, cerrar la ventana cierra la app (y con ella el servidor).
        if (process.platform !== 'darwin') app.quit();
    });
}
