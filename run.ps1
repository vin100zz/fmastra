param([ValidateRange(1024, 65535)][int]$Port = 8011)
$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot
$gamePython = Join-Path $PSScriptRoot '.venv\Scripts\python.exe'
if (-not (Test-Path -LiteralPath $gamePython)) {
    throw 'Environnement absent. Exécutez : py -3.12 -m venv .venv ; puis .\.venv\Scripts\python.exe -m pip install -e ".[dev]"'
}
Write-Host "Touchline est disponible sur http://127.0.0.1:$Port"
Write-Host 'Un seul serveur par dossier de sauvegarde. Ctrl+C pour arrêter.'
& $gamePython -m uvicorn api.app:app --app-dir src --host 127.0.0.1 --port $Port --workers 1
exit $LASTEXITCODE
