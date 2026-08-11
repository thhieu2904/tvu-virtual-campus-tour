"""
Markdown Semantic Chunker
=========================
Splits documents into semantic chunks based on Markdown headings.

Strategy:
  1. Parse Markdown into sections based on headings (#, ##, ###)
  2. Each section becomes a candidate chunk
  3. Breadcrumb heading trail prepended to every chunk
  4. Small sections (<200 tokens) merged into previous section
  5. Large sections (>max_chunk_size) split at paragraph/list boundaries
  6. Tables are never split mid-table

Edge cases handled:
  - Content before first heading → chunk with file name as breadcrumb
  - Document with no headings → fallback to simple character splitter
  - Large tables → split by row groups, each keeping header row
  - Empty sections → skipped
  - Heading level jumps (H1→H3) → breadcrumb chains correctly

Adapted from: src-tham-khao/aic-rag/document-service/src/worker/chunker.py
Changed: Removed langchain dependency, using SimpleFallbackSplitter instead.
"""
import logging
import re
import unicodedata
from typing import Any, Dict, List, Optional, Tuple

logger = logging.getLogger(__name__)

# ── Regex patterns ───────────────────────────────────────────────────────────
_HEADING_RE = re.compile(r"^(#{1,6})\s+(.+)$", re.MULTILINE)
_TABLE_ROW_RE = re.compile(r"^\|.+\|$")
_TABLE_SEP_RE = re.compile(r"^\|\s*[-:]+" )


class SimpleFallbackSplitter:
    """
    Simple recursive text splitter — replaces langchain's RecursiveCharacterTextSplitter.
    Splits text at decreasing levels of granularity: paragraphs → sentences → words.
    """

    def __init__(
        self,
        chunk_size: int = 1500,
        chunk_overlap: int = 200,
        length_function=None,
    ):
        self.chunk_size = chunk_size
        self.chunk_overlap = chunk_overlap
        self._len = length_function or len
        self._separators = ["\n\n\n", "\n\n", "\n", ". ", "! ", "? ", "; ", ": ", ", ", " "]

    def split_text(self, text: str) -> List[str]:
        """Split text into chunks respecting chunk_size and overlap."""
        text = text.strip()
        if not text:
            return []

        if self._len(text) <= self.chunk_size:
            return [text]

        return self._recursive_split(text, 0)

    def _recursive_split(self, text: str, sep_idx: int) -> List[str]:
        """Recursively split text using separators from coarsest to finest."""
        if self._len(text) <= self.chunk_size:
            return [text] if text.strip() else []

        if sep_idx >= len(self._separators):
            # Last resort: hard split by characters
            return self._hard_split(text)

        sep = self._separators[sep_idx]
        parts = text.split(sep)

        if len(parts) <= 1:
            # This separator didn't help, try the next one
            return self._recursive_split(text, sep_idx + 1)

        # Merge parts into chunks that fit within chunk_size
        chunks: List[str] = []
        current_parts: List[str] = []
        current_len = 0

        for part in parts:
            part_len = self._len(part) + self._len(sep)

            if current_len + part_len > self.chunk_size and current_parts:
                chunk_text = sep.join(current_parts).strip()
                if chunk_text:
                    chunks.append(chunk_text)

                # Overlap: keep last part(s) that fit in overlap window
                overlap_parts: List[str] = []
                overlap_len = 0
                for prev_part in reversed(current_parts):
                    pl = self._len(prev_part) + self._len(sep)
                    if overlap_len + pl > self.chunk_overlap:
                        break
                    overlap_parts.insert(0, prev_part)
                    overlap_len += pl

                current_parts = overlap_parts + [part]
                current_len = sum(self._len(p) + self._len(sep) for p in current_parts)
            else:
                current_parts.append(part)
                current_len += part_len

        if current_parts:
            chunk_text = sep.join(current_parts).strip()
            if chunk_text:
                # If this chunk is still too large, split further
                if self._len(chunk_text) > self.chunk_size:
                    chunks.extend(self._recursive_split(chunk_text, sep_idx + 1))
                else:
                    chunks.append(chunk_text)

        return chunks

    def _hard_split(self, text: str) -> List[str]:
        """Hard split by character count as last resort."""
        chunks = []
        start = 0
        while start < len(text):
            end = start + self.chunk_size
            chunk = text[start:end].strip()
            if chunk:
                chunks.append(chunk)
            start = end - self.chunk_overlap
        return chunks


class MarkdownSemanticChunker:
    """Markdown-aware semantic chunker with heading-based splitting."""

    def __init__(
        self,
        chunk_size: int = 1500,
        chunk_overlap: int = 200,
        min_chunk_tokens: int = 200,
    ):
        self.chunk_size = chunk_size
        self.chunk_overlap = chunk_overlap
        self.min_chunk_tokens = min_chunk_tokens

        # Fallback splitter for documents without headings
        self._fallback_splitter = SimpleFallbackSplitter(
            chunk_size=chunk_size,
            chunk_overlap=chunk_overlap,
            length_function=self._count_tokens,
        )

    # ── Public API ───────────────────────────────────────────────────────

    def chunk_pages(
        self,
        pages: List[Dict[str, Any]],
        document_metadata: Optional[Dict[str, Any]] = None,
    ) -> List[Dict[str, Any]]:
        """Chunk pages — compatible with ingest pipeline interface.

        For DOCX (single Markdown page): uses semantic Markdown chunking.
        For PDF (multiple pages): concatenates then tries semantic, falls back
        to per-page splitting if no headings found.
        """
        if document_metadata is None:
            document_metadata = {}

        if not pages:
            return []

        # If single page (DOCX output), use Markdown chunking directly
        if len(pages) == 1:
            full_text = pages[0]["text"]
            return self._chunk_markdown(full_text, document_metadata)

        # Multiple pages (PDF): concatenate with page markers, then chunk
        full_text = self._concatenate_pages(pages)
        chunks = self._chunk_markdown(full_text, document_metadata)

        # If Markdown chunking produced results, use them
        if chunks:
            return chunks

        # Ultimate fallback: per-page splitting
        return self._chunk_pages_fallback(pages, document_metadata)

    # ── Core Markdown chunking ───────────────────────────────────────────

    def _chunk_markdown(
        self, text: str, document_metadata: Dict[str, Any]
    ) -> List[Dict[str, Any]]:
        """Split Markdown text into semantic chunks based on headings."""
        text = self._clean_text(text)
        if not text:
            return []

        # Parse into sections
        sections = self._parse_sections(text)

        # If no headings found, use fallback splitter
        if len(sections) <= 1 and not any(s["heading"] for s in sections):
            return self._fallback_chunk(text, document_metadata)

        # Build chunks from sections
        raw_chunks = self._build_chunks_from_sections(sections)

        # Convert to output format
        return self._finalize_chunks(raw_chunks, document_metadata)

    def _parse_sections(self, text: str) -> List[Dict[str, Any]]:
        """Parse Markdown into sections delimited by headings."""
        lines = text.split("\n")
        sections: List[Dict[str, Any]] = []
        current_content_lines: List[str] = []
        current_heading: Optional[str] = None
        current_level: int = 0

        # Track heading stack for breadcrumbs
        heading_stack: List[Tuple[int, str]] = []

        for line in lines:
            heading_match = _HEADING_RE.match(line)
            if heading_match:
                # Save previous section
                if current_content_lines or current_heading:
                    sections.append({
                        "heading": current_heading,
                        "level": current_level,
                        "content": "\n".join(current_content_lines).strip(),
                        "breadcrumb_parts": list(heading_stack),
                    })

                # Update heading stack
                level = len(heading_match.group(1))
                heading_text = heading_match.group(2).strip()

                # Pop headings at same or deeper level
                while heading_stack and heading_stack[-1][0] >= level:
                    heading_stack.pop()
                heading_stack.append((level, heading_text))

                current_heading = line.strip()
                current_level = level
                current_content_lines = []
            else:
                current_content_lines.append(line)

        # Don't forget the last section
        if current_content_lines or current_heading:
            sections.append({
                "heading": current_heading,
                "level": current_level,
                "content": "\n".join(current_content_lines).strip(),
                "breadcrumb_parts": list(heading_stack),
            })

        return sections

    def _build_chunks_from_sections(
        self, sections: List[Dict[str, Any]]
    ) -> List[Dict[str, Any]]:
        """Build chunks from parsed sections, handling merge/split."""
        chunks: List[Dict[str, Any]] = []

        for section in sections:
            heading = section["heading"]
            content = section["content"]
            breadcrumb_parts = section["breadcrumb_parts"]

            # Build full section text (heading + content)
            if heading:
                section_text = heading + "\n\n" + content if content else heading
            else:
                section_text = content

            if not section_text.strip():
                continue

            tokens = self._count_tokens(section_text)
            breadcrumb = self._format_breadcrumb(breadcrumb_parts)

            if tokens < self.min_chunk_tokens and chunks:
                # Merge small section into previous chunk
                prev = chunks[-1]
                merged_text = prev["text"] + "\n\n" + section_text
                merged_tokens = self._count_tokens(merged_text)

                if merged_tokens <= self.chunk_size:
                    prev["text"] = merged_text
                    prev["token_count"] = merged_tokens
                    continue

            if tokens > self.chunk_size:
                # Split large section
                sub_chunks = self._split_large_section(
                    section_text, breadcrumb, breadcrumb_parts
                )
                chunks.extend(sub_chunks)
            else:
                chunks.append({
                    "text": section_text,
                    "token_count": tokens,
                    "breadcrumb": breadcrumb,
                })

        return chunks

    def _split_large_section(
        self,
        section_text: str,
        breadcrumb: str,
        breadcrumb_parts: List[Tuple[int, str]],
    ) -> List[Dict[str, Any]]:
        """Split a large section at paragraph/table boundaries."""
        blocks = self._split_into_blocks(section_text)
        chunks: List[Dict[str, Any]] = []
        current_block_texts: List[str] = []
        current_tokens = 0

        for block in blocks:
            block_tokens = self._count_tokens(block["text"])

            if block_tokens > self.chunk_size:
                # Flush current
                if current_block_texts:
                    combined = "\n\n".join(current_block_texts)
                    chunks.append({
                        "text": combined,
                        "token_count": self._count_tokens(combined),
                        "breadcrumb": breadcrumb,
                    })
                    current_block_texts = []
                    current_tokens = 0

                # Split the oversized block
                if block["type"] == "table":
                    table_chunks = self._split_large_table(block["text"])
                    for tc in table_chunks:
                        chunks.append({
                            "text": tc,
                            "token_count": self._count_tokens(tc),
                            "breadcrumb": breadcrumb,
                        })
                else:
                    sub_texts = self._fallback_splitter.split_text(block["text"])
                    for st in sub_texts:
                        chunks.append({
                            "text": st.strip(),
                            "token_count": self._count_tokens(st),
                            "breadcrumb": breadcrumb,
                        })
            elif current_tokens + block_tokens > self.chunk_size:
                # Flush current, start new
                if current_block_texts:
                    combined = "\n\n".join(current_block_texts)
                    chunks.append({
                        "text": combined,
                        "token_count": self._count_tokens(combined),
                        "breadcrumb": breadcrumb,
                    })
                current_block_texts = [block["text"]]
                current_tokens = block_tokens
            else:
                current_block_texts.append(block["text"])
                current_tokens += block_tokens

        # Flush remaining
        if current_block_texts:
            combined = "\n\n".join(current_block_texts)
            chunks.append({
                "text": combined,
                "token_count": self._count_tokens(combined),
                "breadcrumb": breadcrumb,
            })

        return chunks

    def _split_into_blocks(self, text: str) -> List[Dict[str, str]]:
        """Split text into blocks: paragraphs and tables."""
        lines = text.split("\n")
        blocks: List[Dict[str, str]] = []
        current_lines: List[str] = []
        in_table = False

        for line in lines:
            is_table_line = bool(_TABLE_ROW_RE.match(line.strip()))

            if is_table_line and not in_table:
                if current_lines:
                    txt = "\n".join(current_lines).strip()
                    if txt:
                        blocks.append({"type": "text", "text": txt})
                    current_lines = []
                in_table = True
                current_lines.append(line)
            elif not is_table_line and in_table:
                if current_lines:
                    txt = "\n".join(current_lines).strip()
                    if txt:
                        blocks.append({"type": "table", "text": txt})
                    current_lines = []
                in_table = False
                current_lines.append(line)
            else:
                current_lines.append(line)

        if current_lines:
            txt = "\n".join(current_lines).strip()
            if txt:
                block_type = "table" if in_table else "text"
                blocks.append({"type": block_type, "text": txt})

        return blocks

    def _split_large_table(self, table_text: str) -> List[str]:
        """Split a large table into chunks, each keeping the header row."""
        lines = table_text.strip().split("\n")
        if len(lines) < 3:
            return [table_text]

        header_line = lines[0]
        separator_line = lines[1] if _TABLE_SEP_RE.match(lines[1].strip()) else None

        header_block = header_line
        if separator_line:
            header_block = header_line + "\n" + separator_line
            data_lines = lines[2:]
        else:
            data_lines = lines[1:]

        header_tokens = self._count_tokens(header_block)
        max_data_tokens = self.chunk_size - header_tokens - 10

        chunks: List[str] = []
        current_data: List[str] = []
        current_tokens = 0

        for data_line in data_lines:
            if _TABLE_SEP_RE.match(data_line.strip()):
                continue

            line_tokens = self._count_tokens(data_line)
            if current_tokens + line_tokens > max_data_tokens and current_data:
                chunk = header_block + "\n" + "\n".join(current_data)
                chunks.append(chunk)
                current_data = []
                current_tokens = 0

            current_data.append(data_line)
            current_tokens += line_tokens

        if current_data:
            chunk = header_block + "\n" + "\n".join(current_data)
            chunks.append(chunk)

        return chunks if chunks else [table_text]

    # ── Breadcrumb helpers ───────────────────────────────────────────────

    @staticmethod
    def _format_breadcrumb(parts: List[Tuple[int, str]]) -> str:
        """Format breadcrumb: '# Chương 1 > ## 1.1 Intro > ### Chi tiết'"""
        if not parts:
            return ""
        return " > ".join(f"{'#' * level} {text}" for level, text in parts)

    # ── Fallback chunking ────────────────────────────────────────────────

    def _fallback_chunk(
        self, text: str, document_metadata: Dict[str, Any]
    ) -> List[Dict[str, Any]]:
        """No headings found — use simple character splitter."""
        text_chunks = self._fallback_splitter.split_text(text)
        return self._text_list_to_chunks(text_chunks, document_metadata)

    def _chunk_pages_fallback(
        self, pages: List[Dict[str, Any]], document_metadata: Dict[str, Any]
    ) -> List[Dict[str, Any]]:
        """Per-page fallback for PDF with no Markdown structure."""
        all_chunks: List[Dict[str, Any]] = []
        global_index = 0

        for page_info in pages:
            page_text = self._clean_text(page_info["text"])
            if not page_text:
                continue

            text_chunks = self._fallback_splitter.split_text(page_text)
            for chunk_text in text_chunks:
                stripped = chunk_text.strip()
                if not stripped:
                    continue

                meta = {**document_metadata, "page_number": page_info["page_number"]}
                all_chunks.append({
                    "chunk_index": global_index,
                    "text_content": stripped,
                    "token_count": self._count_tokens(stripped),
                    "metadata": meta,
                })
                global_index += 1

        return all_chunks

    def _text_list_to_chunks(
        self, texts: List[str], document_metadata: Dict[str, Any]
    ) -> List[Dict[str, Any]]:
        """Convert list of text strings to chunk dicts."""
        chunks = []
        for i, text in enumerate(texts):
            stripped = text.strip()
            if not stripped:
                continue
            chunks.append({
                "chunk_index": i,
                "text_content": stripped,
                "token_count": self._count_tokens(stripped),
                "metadata": {**document_metadata},
            })
        return chunks

    # ── Finalization ─────────────────────────────────────────────────────

    def _finalize_chunks(
        self, raw_chunks: List[Dict[str, Any]], document_metadata: Dict[str, Any]
    ) -> List[Dict[str, Any]]:
        """Convert raw chunks to final output format with breadcrumb prefix."""
        file_name = document_metadata.get("file_name", "")

        result = []
        for i, chunk in enumerate(raw_chunks):
            text = chunk["text"].strip()
            if not text:
                continue

            breadcrumb = chunk.get("breadcrumb", "")

            # Prepend breadcrumb as context prefix
            if breadcrumb:
                final_text = f"[{breadcrumb}]\n\n{text}"
            elif file_name:
                final_text = f"[{file_name}]\n\n{text}"
            else:
                final_text = text

            result.append({
                "chunk_index": i,
                "text_content": final_text,
                "token_count": self._count_tokens(final_text),
                "metadata": {**document_metadata},
            })

        logger.info(
            f"✅ Semantic chunked into {len(result)} chunks "
            f"(chunk_size={self.chunk_size}, overlap={self.chunk_overlap})"
        )
        return result

    # ── Utilities ────────────────────────────────────────────────────────

    @staticmethod
    def _count_tokens(text: str) -> int:
        """Estimate token count. Vietnamese ~1.3 tokens/word."""
        words = len(text.split())
        return max(int(words * 1.3), 1)

    @staticmethod
    def _clean_text(text: str) -> str:
        text = unicodedata.normalize("NFC", text)
        text = re.sub(r"\n{4,}", "\n\n\n", text)
        return text.strip()

    @staticmethod
    def _concatenate_pages(pages: List[Dict[str, Any]]) -> str:
        """Concatenate multi-page text with double newlines."""
        parts = []
        for page in pages:
            text = page.get("text", "").strip()
            if text:
                parts.append(text)
        return "\n\n".join(parts)
