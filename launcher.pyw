"""Lanceur Windows sans console, cible du raccourci créé par shortcut.bat.

pythonw.exe n'ouvre aucune fenêtre : le jeu s'affiche dans une fenêtre d'application Edge ou Chrome
(--app), qui porte l'icône du jeu dans la barre des tâches. Le serveur s'arrête quand cette fenêtre se
ferme ; s'il tournait déjà (start.bat), le lanceur l'ouvre seulement et le laisse tourner.
"""
import json
import os
import shutil
import subprocess
import sys
import threading
import time
import traceback
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent
PORT = 8011
URL = f"http://localhost:{PORT}/"
LOG = ROOT / "launcher.log"


def game_running() -> bool:
    try:
        with urllib.request.urlopen(f"{URL}openapi.json", timeout=2) as response:
            return str(json.load(response).get("info", {}).get("title", "")).startswith("Football Manager")
    except (OSError, ValueError):
        return False


def app_browser() -> str | None:
    """Edge, présent sur tout Windows récent, sinon Chrome : seuls à ouvrir une page en fenêtre d'application."""
    candidates = []
    for base in (os.environ.get("ProgramFiles(x86)"), os.environ.get("ProgramFiles"), os.environ.get("LOCALAPPDATA")):
        if base:
            candidates += [Path(base, "Microsoft", "Edge", "Application", "msedge.exe"),
                           Path(base, "Google", "Chrome", "Application", "chrome.exe")]
    for path in candidates:
        if path.is_file(): return str(path)
    return shutil.which("msedge") or shutil.which("chrome")


def open_window() -> subprocess.Popen | None:
    """Un profil propre au jeu donne une instance du navigateur à part, qui vit tant que la fenêtre est ouverte."""
    browser = app_browser()
    if browser is None:
        import webbrowser
        webbrowser.open(URL)
        return None
    profile = Path(os.environ.get("LOCALAPPDATA", ROOT), "FootballManager", "browser")
    return subprocess.Popen([browser, f"--app={URL}", f"--user-data-dir={profile}", "--no-first-run",
                             "--no-default-browser-check", "--start-maximized"])


def alert(message: str) -> None:
    import ctypes
    ctypes.windll.user32.MessageBoxW(None, message, "Football Manager", 0x10)


def main() -> None:
    if sys.stderr is None:  # pythonw n'a pas de console : le journal du serveur va dans launcher.log
        sys.stdout = sys.stderr = open(LOG, "w", encoding="utf-8", buffering=1)
    if game_running():
        open_window()
        return
    os.chdir(ROOT)
    sys.path.insert(0, str(ROOT / "src"))
    os.environ["FMASTRA_RESUME"] = "1"  # reprendre la dernière sauvegarde, comme start.bat
    import uvicorn
    server = uvicorn.Server(uvicorn.Config("api.app:app", host="127.0.0.1", port=PORT, workers=1))

    def follow_window():
        while not server.started:
            if server.should_exit: return
            time.sleep(0.2)
        window = open_window()
        if window is not None:
            window.wait()
            server.should_exit = True

    threading.Thread(target=follow_window, daemon=True).start()
    server.run()
    if not server.started:
        raise RuntimeError(f"Le serveur n'a pas pu démarrer sur le port {PORT}.")


if __name__ == "__main__":
    try:
        main()
    except BaseException:
        print(traceback.format_exc(), file=sys.stderr)
        alert(f"Football Manager n'a pas pu démarrer.\n\nDétails : {LOG}")
        raise SystemExit(1)
