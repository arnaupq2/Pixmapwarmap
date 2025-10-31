@echo off
cd /d "%~dp0"
echo ============================
echo Subiendo cambios a GitHub...
echo ============================
git add .
git commit -m "force update"
git push origin main
echo ----------------------------
echo ✅ Actualización completada.
echo Cierra esta ventana para salir.
pause
