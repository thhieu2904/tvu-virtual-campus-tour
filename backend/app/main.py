"""
TVU Virtual Campus Tour — FastAPI Application Entry Point.

Architecture: Layered (Router → Service → Repository)
API Style: RESTful
"""

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import get_settings
from app.routers import admin, chat, locations


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup and shutdown events."""
    # --- Startup ---
    # TODO: Initialize DB connection pool
    from app.ai.core_client import get_client
    settings = get_settings()
    if settings.GEMINI_API_KEY:
        try:
            get_client()
            print("🤖 Gemini client initialized")
        except Exception as e:
            print(f"⚠️ Failed to initialize Gemini client: {e}")
    else:
        print("⚠️ GEMINI_API_KEY not set, AI features disabled")

    from app.cache import init_caches
    await init_caches()
    print("📦 Cache system initialized")

    print("🚀 TVU Virtual Campus Tour API starting...")
    yield
    # --- Shutdown ---
    # TODO: Close DB connections
    print("👋 TVU Virtual Campus Tour API shutting down...")


settings = get_settings()

app = FastAPI(
    title=settings.APP_NAME,
    version=settings.APP_VERSION,
    lifespan=lifespan,
    docs_url="/api/docs",
    redoc_url="/api/redoc",
    openapi_url="/api/openapi.json",
)

# === CORS ===
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# === Routers ===
app.include_router(locations.router, prefix="/api", tags=["Locations"])
app.include_router(chat.router, prefix="/api", tags=["Chat"])
app.include_router(admin.router, prefix="/api/admin", tags=["Admin"])


# === Health Check ===
@app.get("/api/health", tags=["System"])
async def health_check():
    """Health check endpoint for monitoring."""
    return {
        "status": "healthy",
        "service": settings.APP_NAME,
        "version": settings.APP_VERSION,
    }
