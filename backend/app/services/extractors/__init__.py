"""
Extractors Package — Document Text Extraction
===============================================
Unified TextExtractor that dispatches to the correct format handler
based on file extension.

Supported formats:
  .pdf  — pdfplumber (table-aware, heading detection via font size)
  .docx — python-docx (heading styles → Markdown)

Usage:
    from app.services.extractors import TextExtractor
    extractor = TextExtractor()
    pages = extractor.extract(file_bytes, file_name="lecture.docx")

All extractors return: List[{page_number: int, text: str, char_count: int}]
"""
import logging
import os
from typing import Dict, List, Any, Type

from app.services.extractors.pdf_extractor import PDFExtractor
from app.services.extractors.docx_extractor import DocxExtractor

logger = logging.getLogger(__name__)

# ── Registry: extension → extractor class ────────────────────────────────────
_EXTRACTOR_REGISTRY: Dict[str, Type] = {
    ".pdf": PDFExtractor,
    ".docx": DocxExtractor,
}


class TextExtractor:
    """
    Unified text extractor — dispatches to the correct handler by file extension.
    """

    def __init__(self):
        self._instances: Dict[str, Any] = {
            ext: cls() for ext, cls in _EXTRACTOR_REGISTRY.items()
        }

    @property
    def supported_extensions(self) -> list:
        return list(_EXTRACTOR_REGISTRY.keys())

    def extract(
        self, file_bytes: bytes, file_name: str = ""
    ) -> List[Dict[str, Any]]:
        """
        Extract pages from file bytes.

        Args:
            file_bytes: Raw file content.
            file_name: Original file name (used to determine extension).

        Returns:
            List of {page_number: int, text: str, char_count: int}
        """
        ext = os.path.splitext(file_name)[1].lower() if file_name else ".pdf"
        extractor = self._instances.get(ext)

        if extractor is None:
            supported = ", ".join(self.supported_extensions)
            raise ValueError(
                f"Unsupported file type '{ext}'. Supported: {supported}"
            )

        logger.info(f"📄 Extracting text from '{file_name}' (type: {ext})")
        pages = extractor.extract_pages_from_bytes(file_bytes)
        total_chars = sum(p["char_count"] for p in pages)
        logger.info(f"✅ Extracted {len(pages)} pages, {total_chars} chars total")
        return pages


__all__ = [
    "TextExtractor",
    "PDFExtractor",
    "DocxExtractor",
]
