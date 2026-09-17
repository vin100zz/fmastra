"""Run with: python -m uvicorn api.app:app --app-dir src --workers 1."""
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from starlette.middleware.trustedhost import TrustedHostMiddleware

from infrastructure.persistence.store import SaveError
from .service import GameService, CommandError
from .routes import router


def create_app(root: Path | None = None, saves: Path | None = None) -> FastAPI:
    root = root or Path(__file__).resolve().parents[2]
    service = GameService(root, saves)

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        yield
        service.close()

    app = FastAPI(title="Football Manager Light", version="0.1.0", lifespan=lifespan)
    app.state.game = service
    app.add_middleware(TrustedHostMiddleware, allowed_hosts=["localhost", "127.0.0.1", "testserver", "[::1]"])

    @app.middleware("http")
    async def local_requests(request: Request, call_next):
        if request.method == "POST":
            origin = request.headers.get("origin")
            if origin and origin != str(request.base_url).rstrip("/"):
                return JSONResponse({"detail": "Origine de commande non autorisée."}, status_code=403)
        response = await call_next(request)
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["Content-Security-Policy"] = "default-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; script-src 'self'; frame-ancestors 'none'"
        response.headers["Cache-Control"] = "no-store" if request.url.path.startswith("/api/") else "no-cache"
        return response

    @app.exception_handler(CommandError)
    async def command_error(request: Request, exc: CommandError):
        return JSONResponse({"detail": str(exc)}, status_code=409)

    @app.exception_handler(SaveError)
    async def save_error(request: Request, exc: SaveError):
        return JSONResponse({"detail": str(exc)}, status_code=400)

    @app.exception_handler(KeyError)
    async def missing(request: Request, exc: KeyError):
        return JSONResponse({"detail": "Élément introuvable."}, status_code=404)

    @app.exception_handler(ValueError)
    async def invalid(request: Request, exc: ValueError):
        return JSONResponse({"detail": str(exc)}, status_code=422)

    app.include_router(router(service))
    if (root / "web" / "clubs").exists(): app.mount("/crests", StaticFiles(directory=root / "web" / "clubs"), name="crests")
    if (root / "web").exists(): app.mount("/", StaticFiles(directory=root / "web", html=True), name="web")
    return app


app = create_app()
