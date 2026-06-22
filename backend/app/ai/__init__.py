"""
AI Module for TVU Virtual Campus Tour.
Exposes public interfaces for Chat, Embedding, and TTS.
"""

from .chat_engine import generate_response
from .core_client import get_client
from .embedding_engine import embed_batch, embed_document, embed_query
from .tts_engine import synthesize

__all__ = [
    "get_client",
    "embed_query",
    "embed_document",
    "embed_batch",
    "generate_response",
    "synthesize",
]
