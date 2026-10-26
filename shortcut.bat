@echo off
setlocal
cd /d "%~dp0"

rem Creer sur le Bureau un raccourci a l'icone du jeu (web\favicon.ico) vers
rem launcher.pyw, lance par pythonw.exe : pas de console, le jeu s'ouvre dans
rem sa propre fenetre, et le raccourci peut etre epingle a la barre des taches.
if not exist ".venv\Scripts\pythonw.exe" (
    echo Environnement Python absent. Suivez les instructions du README.md.
    pause
    exit /b 1
)
set "FMASTRA_DIR=%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -Command "$dir = $env:FMASTRA_DIR.TrimEnd('\'); $lnk = Join-Path ([Environment]::GetFolderPath('Desktop')) 'Football Manager.lnk'; $s = (New-Object -ComObject WScript.Shell).CreateShortcut($lnk); $s.TargetPath = Join-Path $dir '.venv\Scripts\pythonw.exe'; $s.Arguments = [char]34 + (Join-Path $dir 'launcher.pyw') + [char]34; $s.WorkingDirectory = $dir; $s.IconLocation = (Join-Path $dir 'web\favicon.ico') + ',0'; $s.Description = 'Football Manager'; $s.Save(); Write-Host ('Raccourci cree : ' + $lnk)"
if errorlevel 1 (
    echo Le raccourci n'a pas pu etre cree.
    pause
    exit /b 1
)
pause
endlocal
