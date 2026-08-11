"""
Core Client — Manages the google-genai Client singleton.
"""

from google import genai

from app.config import get_settings

_client: genai.Client | None = None

def get_client() -> genai.Client:
    """
    Lazy initialization of the Gemini Client.
    Creates the client on the first call and reuses it subsequently.
    """
    global _client
    if _client is None:
        settings = get_settings()
        if not settings.GEMINI_API_KEY:
            raise ValueError("GEMINI_API_KEY is not set in environment variables.")

        # Initialize the new google-genai client
        _client = genai.Client(api_key=settings.GEMINI_API_KEY)

    return _client
