"""
Dependency injection functions for FastAPI.
Used in router Depends() parameters.
"""

from fastapi import Depends, Header, HTTPException, status

from app.config import Settings, get_settings


async def verify_admin_key(
    x_admin_key: str = Header(..., alias="X-Admin-Key"),
    settings: Settings = Depends(get_settings),
) -> str:
    """
    Verify admin API key from request header.
    Usage: router endpoint with Depends(verify_admin_key)
    """
    if x_admin_key != settings.ADMIN_API_KEY:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Invalid admin API key",
        )
    return x_admin_key
