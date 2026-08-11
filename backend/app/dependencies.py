"""
Dependency injection functions for FastAPI.
Used in router Depends() parameters.
"""

from typing import Any, Dict

import httpx
from fastapi import Depends, Header, HTTPException, status

from app.config import Settings, get_settings


async def verify_supabase_token(
    authorization: str = Header(..., alias="Authorization"),
    settings: Settings = Depends(get_settings),
) -> Dict[str, Any]:
    """
    Verify Supabase JWT token from the Authorization header.

    Calls Supabase GoTrue API to validate the token and returns user info.
    Raises HTTP 401 if the token is missing, malformed, or expired.
    """
    if not authorization.startswith("Bearer "):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid Authorization header format",
        )

    token = authorization.split(" ", 1)[1]

    # Verify token via Supabase GoTrue /auth/v1/user endpoint
    url = f"{settings.SUPABASE_URL}/auth/v1/user"
    headers = {
        "Authorization": f"Bearer {token}",
        "apikey": settings.SUPABASE_ANON_KEY,
    }

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.get(url, headers=headers)
    except httpx.RequestError:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Cannot reach authentication service",
        )

    if response.status_code != 200:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
        )

    return response.json()

