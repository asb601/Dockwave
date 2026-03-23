from __future__ import annotations
from typing import List, Optional
from io import BytesIO
import logging
import re

from pypdf import PdfReader

logger = logging.getLogger("intellidoc.pdf")

# ---------------------------------------------------------------------------
# pdfminer layout-aware extraction (preserves table spacing & columns)
# ---------------------------------------------------------------------------

def _pdfminer_extract_page(data: bytes, page_index: int) -> str | None:
    """Extract text from a single page using pdfminer's layout analysis.
    Returns None if pdfminer is unavailable or extraction fails."""
    try:
        from pdfminer.high_level import extract_pages
        from pdfminer.layout import (
            LAParams,
            LTTextBoxHorizontal,
            LTTextLineHorizontal,
            LTChar,
            LTFigure,
        )
    except ImportError:
        return None

    laparams = LAParams(
        line_margin=0.3,      # tighter line grouping for tables
        word_margin=0.15,     # keep columns separated
        boxes_flow=0.5,       # balanced reading order
        detect_vertical=False,
    )

    try:
        pages = list(extract_pages(BytesIO(data), page_numbers=[page_index], laparams=laparams))
        if not pages:
            return None

        lines: list[tuple[float, str]] = []
        for element in pages[0]:
            if isinstance(element, LTTextBoxHorizontal):
                for line in element:
                    if isinstance(line, LTTextLineHorizontal):
                        text = line.get_text().rstrip("\n")
                        if text.strip():
                            lines.append((round(-line.y0, 1), text))
            elif isinstance(element, LTFigure):
                # Recurse into figures (some tables are wrapped in figures)
                for child in element:
                    if isinstance(child, LTTextLineHorizontal):
                        text = child.get_text().rstrip("\n")
                        if text.strip():
                            lines.append((round(-child.y0, 1), text))

        if not lines:
            return None

        # Sort by vertical position (top-to-bottom)
        lines.sort(key=lambda x: x[0])
        return "\n".join(text for _, text in lines)

    except Exception as exc:
        logger.debug("pdfminer extraction failed for page %d: %s", page_index, exc)
        return None


# ---------------------------------------------------------------------------
# Table detection heuristic
# ---------------------------------------------------------------------------

_TABLE_PATTERN = re.compile(
    r"(?:"
    r"\d+[\.\d]*\s*[%&|]"       # numbers followed by separators
    r"|\t{2,}"                   # multiple tabs
    r"|[ ]{3,}\S+[ ]{3,}\S+"    # wide spaces between columns
    r")",
)

def _looks_like_table(text: str) -> bool:
    """Rough heuristic: does the text look like it contains tabular data?"""
    lines = text.strip().split("\n")
    if len(lines) < 3:
        return False
    table_lines = sum(1 for ln in lines if _TABLE_PATTERN.search(ln))
    return table_lines >= max(2, len(lines) * 0.3)


def parse_pages(spec: str, total_pages: int) -> list[int]:
    """Parse a pages spec like "1-3,5,8-" into zero-based page indices.
    Empty start means 1, empty end means last page.
    """
    indices: list[int] = []
    for part in spec.split(','):
        part = part.strip()
        if not part:
            continue
        if '-' in part:
            start_s, end_s = part.split('-', 1)
            start = int(start_s) if start_s else 1
            end = int(end_s) if end_s else total_pages
            start = max(1, start)
            end = min(total_pages, end)
            if start <= end:
                indices.extend(range(start - 1, end))
        else:
            try:
                idx1 = int(part)
                if 1 <= idx1 <= total_pages:
                    indices.append(idx1 - 1)
            except ValueError:
                # Ignore invalid token
                pass
    # Deduplicate while preserving order
    seen = set()
    result: list[int] = []
    for i in indices:
        if i not in seen:
            seen.add(i)
            result.append(i)
    return result


def extract_text_from_pdf_bytes(data: bytes, pages_spec: Optional[str] = None, password: Optional[str] = None) -> str:
    reader = PdfReader(BytesIO(data))

    # Try to decrypt if encrypted
    try:
        if getattr(reader, "is_encrypted", False):
            if password:
                try:
                    reader.decrypt(password)  # type: ignore[attr-defined]
                except Exception:
                    pass
            try:
                reader.decrypt("")  # type: ignore[attr-defined]
            except Exception:
                pass
    except Exception:
        pass

    total_pages = len(reader.pages)
    target_pages: List[int]
    if pages_spec:
        target_pages = parse_pages(pages_spec, total_pages)
    else:
        target_pages = list(range(total_pages))

    chunks: list[str] = []
    for i in target_pages:
        if i < 0 or i >= total_pages:
            continue

        header = f"\n\n=== Page {i + 1} / {total_pages} ===\n"

        # 1) Try pypdf first (fast)
        pypdf_text = (reader.pages[i].extract_text() or "").strip()

        # 2) If text looks like it has tables, or is suspiciously short,
        #    try pdfminer's layout-aware extraction for better column handling
        pdfminer_text = None
        if _looks_like_table(pypdf_text) or len(pypdf_text) < 100:
            pdfminer_text = _pdfminer_extract_page(data, i)

        # Pick the better result
        if pdfminer_text and (
            _looks_like_table(pypdf_text)  # pdfminer better for tables
            or len(pdfminer_text) > len(pypdf_text) * 1.2  # pdfminer got more text
        ):
            text = pdfminer_text
        else:
            text = pypdf_text

        chunks.append(header + text)
    return "".join(chunks).strip()
