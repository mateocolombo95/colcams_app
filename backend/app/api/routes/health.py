from fastapi import APIRouter, HTTPException

from app.db.mongo import ping_database

router = APIRouter(prefix="/health", tags=["health"])


@router.get("")
def health():
    try:
        ping_database()
        database = "ok"
    except Exception as exc:
        raise HTTPException(
            status_code=503,
            detail=f"API is running but MongoDB is unavailable: {exc}",
        ) from exc

    return {
        "status": "ok",
        "database": database,
    }
