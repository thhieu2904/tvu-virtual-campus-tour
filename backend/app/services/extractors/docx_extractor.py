"""
DOCX Text Extractor — Markdown Output
=======================================
Iterates doc.element.body in document order to preserve the original
sequence of paragraphs and tables.

Output: List[{page_number: 1, text: "<full markdown>", char_count: N}]
Returns a single "page" containing the entire document as Markdown.

Adapted from: src-tham-khao/aic-rag/document-service/src/worker/extractors/docx_extractor.py
"""
import io
import logging
import re
from typing import Any, Dict, List

logger = logging.getLogger(__name__)


class DocxExtractor:
    """Extract text from .docx files as Markdown, preserving document order."""

    # ── Heading style name → Markdown level mapping ──────────────────────
    _HEADING_MAP = {
        "Heading 1": "#",
        "Heading 2": "##",
        "Heading 3": "###",
        "Heading 4": "####",
        "Title": "#",
        "Subtitle": "##",
    }

    def extract_pages_from_bytes(self, file_bytes: bytes) -> List[Dict[str, Any]]:
        """Extract DOCX content as a single Markdown 'page'.

        Returns:
            List with one item: {page_number: 1, text: "...", char_count: N}
        """
        try:
            from docx import Document
        except ImportError:
            raise ImportError("python-docx required: pip install python-docx")

        doc = Document(io.BytesIO(file_bytes))
        md_parts: List[str] = []

        # Iterate body elements in document order (paragraphs + tables interleaved)
        for element in doc.element.body:
            tag = element.tag

            if tag.endswith("}p"):  # CT_P — paragraph
                md = self._process_paragraph(element, doc)
                if md is not None:
                    md_parts.append(md)

            elif tag.endswith("}tbl"):  # CT_Tbl — table
                md = self._process_table(element, doc)
                if md:
                    md_parts.append(md)

        full_text = "\n".join(md_parts).strip()
        if not full_text:
            logger.warning("DOCX: no text content found")
            return []

        # Clean up excessive blank lines
        full_text = re.sub(r"\n{4,}", "\n\n\n", full_text)

        result = [{
            "page_number": 1,
            "text": full_text,
            "char_count": len(full_text),
        }]
        logger.info(f"✅ DOCX→MD: {len(full_text)} chars")
        return result

    # ── Paragraph processing ─────────────────────────────────────────────

    def _process_paragraph(self, element, doc) -> str | None:
        """Convert a paragraph element to Markdown text."""

        para = self._find_paragraph(element, doc)
        if para is None:
            return None

        text = para.text.strip()
        if not text:
            return None

        # Check heading style
        style_name = self._get_style_name(para)
        prefix = self._HEADING_MAP.get(style_name, "")

        if prefix:
            return f"\n{prefix} {text}\n"

        # Check for list items (numbered or bulleted)
        if self._is_list_item(element):
            indent_level = self._get_indent_level(element)
            indent = "  " * indent_level
            if self._is_numbered_list(element):
                return f"{indent}1. {text}"
            else:
                return f"{indent}- {text}"

        return text

    def _find_paragraph(self, element, doc):
        """Find the python-docx Paragraph wrapper for an lxml element."""
        from docx.text.paragraph import Paragraph
        try:
            return Paragraph(element, doc.element.body)
        except Exception:
            return None

    def _get_style_name(self, para) -> str:
        """Get the style name of a paragraph, handling None gracefully."""
        try:
            if para.style and para.style.name:
                return para.style.name
        except Exception:
            pass
        return ""

    def _is_list_item(self, element) -> bool:
        """Check if paragraph element is a list item (has numPr)."""
        from docx.oxml.ns import qn
        pPr = element.find(qn("w:pPr"))
        if pPr is not None:
            numPr = pPr.find(qn("w:numPr"))
            return numPr is not None
        return False

    def _is_numbered_list(self, element) -> bool:
        """Heuristic: check if the list item is numbered."""
        from docx.oxml.ns import qn
        pPr = element.find(qn("w:pPr"))
        if pPr is not None:
            numPr = pPr.find(qn("w:numPr"))
            if numPr is not None:
                numId = numPr.find(qn("w:numId"))
                if numId is not None:
                    val = numId.get(qn("w:val"))
                    return val is not None and val != "0"
        return False

    def _get_indent_level(self, element) -> int:
        """Get list indent level (ilvl)."""
        from docx.oxml.ns import qn
        pPr = element.find(qn("w:pPr"))
        if pPr is not None:
            numPr = pPr.find(qn("w:numPr"))
            if numPr is not None:
                ilvl = numPr.find(qn("w:ilvl"))
                if ilvl is not None:
                    try:
                        return int(ilvl.get(qn("w:val"), "0"))
                    except (ValueError, TypeError):
                        pass
        return 0

    # ── Table processing ─────────────────────────────────────────────────

    def _process_table(self, element, doc) -> str | None:
        """Convert a table element to Markdown table format."""
        from docx.table import Table as DocxTable

        try:
            table = DocxTable(element, doc.element.body)
        except Exception:
            return None

        rows = table.rows
        if not rows:
            return None

        md_rows: List[str] = []

        for i, row in enumerate(rows):
            cells = [self._clean_cell(cell.text) for cell in row.cells]
            if not any(cells):
                continue

            md_row = "| " + " | ".join(cells) + " |"
            md_rows.append(md_row)

            # Add separator after first row (header)
            if i == 0:
                separator = "| " + " | ".join(["---"] * len(cells)) + " |"
                md_rows.append(separator)

        if not md_rows:
            return None

        return "\n" + "\n".join(md_rows) + "\n"

    @staticmethod
    def _clean_cell(text: str) -> str:
        """Clean cell text: collapse whitespace, strip, escape pipes."""
        text = text.strip()
        text = re.sub(r"\s+", " ", text)
        text = text.replace("|", "\\|")
        return text
