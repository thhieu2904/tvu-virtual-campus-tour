"""
PDF Text Extractor — Markdown Output
======================================
Uses pdfplumber for text + table extraction.
Tables are converted to Markdown format.
Headings are detected via font size analysis.

Output: List[{page_number, text, char_count}]

Adapted from: src-tham-khao/aic-rag/document-service/src/worker/extractors/pdf_extractor.py
"""
import logging
from importlib.util import find_spec
from typing import Any, Dict, List, Optional

logger = logging.getLogger(__name__)

# Minimum font size ratio (vs median) to consider text a heading
_HEADING_SIZE_RATIO = 1.25


class PDFExtractor:
    """Extract text from PDF files using pdfplumber with Markdown table output."""

    def extract_pages_from_bytes(self, file_bytes: bytes) -> List[Dict[str, Any]]:
        """Extract text from PDF bytes."""
        import os
        import tempfile

        if find_spec("pdfplumber") is None:
            raise ImportError("pdfplumber required: pip install pdfplumber")

        with tempfile.NamedTemporaryFile(suffix=".pdf", delete=False) as tmp:
            tmp.write(file_bytes)
            tmp_path = tmp.name

        try:
            return self._extract_pages(tmp_path)
        finally:
            os.unlink(tmp_path)

    def _extract_pages(self, file_path: str) -> List[Dict[str, Any]]:
        """Extract text from all pages of a PDF file on disk."""
        import pdfplumber

        # First pass: collect font sizes across ALL pages for heading detection
        median_size = self._compute_median_font_size(file_path)

        pages = []
        with pdfplumber.open(file_path) as pdf:
            logger.info(f"📄 PDF: extracting {len(pdf.pages)} pages")
            for i, page in enumerate(pdf.pages):
                text = self._extract_page_markdown(page, median_size)
                stripped = text.strip()
                if not stripped:
                    continue
                pages.append({
                    "page_number": i + 1,
                    "text": stripped,
                    "char_count": len(stripped),
                })

        logger.info(
            f"✅ PDF→MD: {len(pages)} pages, "
            f"{sum(p['char_count'] for p in pages)} chars"
        )
        return pages

    # ── Page-level extraction ────────────────────────────────────────────

    def _extract_page_markdown(self, page, median_size: Optional[float]) -> str:
        """Extract a single page as Markdown, interleaving text and tables."""
        tables = page.find_tables()
        table_bboxes = [t.bbox for t in tables]

        # Get all text NOT inside tables
        text_parts = self._extract_text_outside_tables(page, table_bboxes, median_size)

        # Convert tables to Markdown
        table_parts = []
        for table in tables:
            md_table = self._table_to_markdown(table.extract())
            if md_table:
                table_parts.append({
                    "y": table.bbox[1],  # top y coordinate
                    "text": md_table,
                })

        # Merge and sort by y position (top of page = 0)
        all_parts = text_parts + table_parts
        all_parts.sort(key=lambda p: p["y"])

        return "\n\n".join(p["text"] for p in all_parts if p["text"].strip())

    def _extract_text_outside_tables(
        self, page, table_bboxes: list, median_size: Optional[float]
    ) -> List[Dict[str, Any]]:
        """Extract text lines that are NOT inside any table bbox."""
        chars = page.chars
        if not chars:
            # Fallback: no char-level data, use extract_text
            text = page.extract_text() or ""
            if text.strip():
                return [{"y": 0, "text": text.strip()}]
            return []

        # Group chars into lines by their top coordinate
        lines = self._group_chars_into_lines(chars, table_bboxes)

        # Apply heading detection if median_size is available
        text_blocks: List[Dict[str, Any]] = []
        for line_info in lines:
            text = line_info["text"].strip()
            if not text:
                continue

            # Best-effort heading detection
            if (
                median_size
                and line_info.get("avg_size")
                and line_info["avg_size"] >= median_size * _HEADING_SIZE_RATIO
                and len(text) < 200  # Headings are typically short
                and not text.startswith("|")  # Not a table residual
            ):
                ratio = line_info["avg_size"] / median_size
                if ratio >= 1.8:
                    text = f"# {text}"
                elif ratio >= 1.4:
                    text = f"## {text}"
                else:
                    text = f"### {text}"

            text_blocks.append({
                "y": line_info["y"],
                "text": text,
            })

        # Consolidate consecutive text blocks into paragraphs
        return self._consolidate_text_blocks(text_blocks)

    def _group_chars_into_lines(
        self, chars: list, table_bboxes: list
    ) -> List[Dict[str, Any]]:
        """Group characters into lines, excluding those inside table bboxes."""
        filtered_chars = [
            char for char in chars
            if not self._is_inside_any_bbox(char, table_bboxes)
        ]

        if not filtered_chars:
            return []

        # Sort by top position, then x
        filtered_chars.sort(key=lambda c: (round(c["top"], 1), c["x0"]))

        # Group by line (chars with similar top coordinate)
        lines: List[Dict[str, Any]] = []
        current_line_chars: List[dict] = []
        current_top: Optional[float] = None
        tolerance = 3  # pixels

        for char in filtered_chars:
            if current_top is None or abs(char["top"] - current_top) > tolerance:
                if current_line_chars:
                    lines.append(self._chars_to_line(current_line_chars))
                current_line_chars = [char]
                current_top = char["top"]
            else:
                current_line_chars.append(char)

        if current_line_chars:
            lines.append(self._chars_to_line(current_line_chars))

        return lines

    @staticmethod
    def _chars_to_line(chars: list) -> Dict[str, Any]:
        """Convert a list of char dicts to a line dict."""
        text = "".join(c.get("text", "") for c in chars)
        sizes = [c.get("size", 0) for c in chars if c.get("size")]
        avg_size = sum(sizes) / len(sizes) if sizes else None
        top = chars[0]["top"] if chars else 0
        return {"y": top, "text": text, "avg_size": avg_size}

    @staticmethod
    def _is_inside_any_bbox(char: dict, bboxes: list) -> bool:
        """Check if a character is inside any table bounding box."""
        cx, cy = char.get("x0", 0), char.get("top", 0)
        for bbox in bboxes:
            x0, y0, x1, y1 = bbox
            if x0 <= cx <= x1 and y0 <= cy <= y1:
                return True
        return False

    @staticmethod
    def _consolidate_text_blocks(
        blocks: List[Dict[str, Any]]
    ) -> List[Dict[str, Any]]:
        """Merge consecutive text lines into paragraph blocks."""
        if not blocks:
            return []

        consolidated: List[Dict[str, Any]] = []
        current_texts: List[str] = []
        current_y = blocks[0]["y"]

        for block in blocks:
            text = block["text"]
            # If this is a heading, flush previous and keep separate
            if text.startswith("#"):
                if current_texts:
                    consolidated.append({
                        "y": current_y,
                        "text": " ".join(current_texts),
                    })
                    current_texts = []
                consolidated.append({"y": block["y"], "text": text})
                current_y = block["y"]
            else:
                if not current_texts:
                    current_y = block["y"]
                current_texts.append(text)

        if current_texts:
            consolidated.append({
                "y": current_y,
                "text": " ".join(current_texts),
            })

        return consolidated

    # ── Table conversion ─────────────────────────────────────────────────

    @staticmethod
    def _table_to_markdown(table_data: list) -> Optional[str]:
        """Convert pdfplumber table data (list of rows) to Markdown table."""
        if not table_data:
            return None

        rows = []
        for row in table_data:
            cells = [str(cell).strip() if cell else "" for cell in row]
            if any(cells):
                cells = [c.replace("|", "\\|").replace("\n", " ") for c in cells]
                rows.append(cells)

        if not rows:
            return None

        col_count = max(len(r) for r in rows)

        # Normalize all rows to same column count
        for row in rows:
            while len(row) < col_count:
                row.append("")

        md_lines = []
        md_lines.append("| " + " | ".join(rows[0]) + " |")
        md_lines.append("| " + " | ".join(["---"] * col_count) + " |")
        for row in rows[1:]:
            md_lines.append("| " + " | ".join(row) + " |")

        return "\n".join(md_lines)

    # ── Font size analysis ───────────────────────────────────────────────

    @staticmethod
    def _compute_median_font_size(file_path: str) -> Optional[float]:
        """Compute the median font size across all pages for heading detection."""
        try:
            import pdfplumber
        except ImportError:
            return None

        all_sizes = []
        try:
            with pdfplumber.open(file_path) as pdf:
                for page in pdf.pages:
                    for char in page.chars:
                        size = char.get("size")
                        if size and size > 0:
                            all_sizes.append(size)
        except Exception:
            return None

        if not all_sizes:
            return None

        all_sizes.sort()
        mid = len(all_sizes) // 2
        return all_sizes[mid]
