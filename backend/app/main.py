from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes import exports, health, projects, quotes
from app.core.config import get_settings

settings = get_settings()

app = FastAPI(
    title="Security Quote API",
    version="0.1.0",
    description="Technical-commercial quote engine for security installers.",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health.router, prefix="/api/v1")
app.include_router(quotes.router, prefix="/api/v1")
app.include_router(exports.router, prefix="/api/v1")
app.include_router(projects.router, prefix="/api/v1")


@app.get("/")
def root():
    return {
        "name": "Security Quote API",
        "version": "0.1.0",
        "docs": "/docs",
    }
