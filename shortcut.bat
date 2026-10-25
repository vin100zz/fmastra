@echo off
setlocal
cd /d "%~dp0"

rem Un .bat ne porte pas d'icone : creer sur le Bureau un raccourci vers
rem start.bat qui porte la marque du jeu (web\favicon.ico).
set "FMASTRA_DIR=%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -Command "$dir = $env:FMASTRA_DIR.TrimEnd('\'); $lnk = Join-Path ([Environment]::GetFolderPath('Desktop')) 'Football Manager.lnk'; $s = (New-Object -ComObject WScript.Shell).CreateShortcut($lnk); $s.TargetPath = Join-Path $dir 'start.bat'; $s.WorkingDirectory = $dir; $s.IconLocation = (Join-Path $dir 'web\favicon.ico') + ',0'; $s.Description = 'Football Manager'; $s.Save(); Write-Host ('Raccourci cree : ' + $lnk)"
if errorlevel 1 (
    echo Le raccourci n'a pas pu etre cree.
    pause
    exit /b 1
)
pause
endlocal
