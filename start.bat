@echo off
setlocal
title Touchline - Football Manager Light
cd /d "%~dp0"

if not exist ".venv\Scripts\python.exe" (
    echo Environnement Python absent. Suivez les instructions du README.md.
    pause
    exit /b 1
)

rem Reutiliser le serveur du jeu s'il est deja en cours d'execution.
".venv\Scripts\python.exe" -c "import json, urllib.request; data=json.load(urllib.request.urlopen('http://localhost:8011/openapi.json', timeout=2)); raise SystemExit(0 if data.get('info', {}).get('title') == 'Football Manager Light' else 1)" >nul 2>&1
if not errorlevel 1 (
    start "" "http://localhost:8011/"
    exit /b 0
)

echo Demarrage de Touchline : http://localhost:8011/
echo Gardez cette fenetre ouverte. Ctrl+C pour arreter le jeu.
set "PYTHONPATH=%~dp0src"
".venv\Scripts\python.exe" -c "import threading, time, urllib.request, webbrowser, uvicorn; exec('def open_game():\n for attempt in range(60):\n  try:\n   with urllib.request.urlopen(\'http://localhost:8011/openapi.json\', timeout=1): pass\n   webbrowser.open(\'http://localhost:8011/\')\n   return\n  except OSError: time.sleep(0.5)'); threading.Thread(target=open_game, daemon=True).start(); uvicorn.run('api.app:app', host='127.0.0.1', port=8011, workers=1)"
if errorlevel 1 (
    echo Le serveur n'a pas pu demarrer. Consultez le message ci-dessus.
    pause
    exit /b 1
)
endlocal
