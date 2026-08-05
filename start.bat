@echo off
title Google Fotos Local
cd /d "%~dp0"

if not exist "node_modules" (
    echo Instalando dependencias por primera vez, esto puede tardar 1-2 minutos...
    call npm install
    if errorlevel 1 (
        echo.
        echo Hubo un error instalando las dependencias. ¿Tienes Node.js instalado?
        echo Descargalo desde https://nodejs.org y volve a intentar.
        pause
        exit /b 1
    )
)

echo.
echo Iniciando el servidor...
start "" http://localhost:8080
node server.js

pause
