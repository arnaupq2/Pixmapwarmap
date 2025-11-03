@echo off
cd /d "%~dp0"
echo ============================
echo Subiendo cambios a GitHub...
echo ============================
git add .
git push origin main --force
git push origin main
echo ----------------------------
echo ✅ Actualización completada.
echo Cierra esta ventana para salir.
pause
