from __future__ import annotations
from typing import List, Optional
from io import BytesIO
from pypdf import PdfReader


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
        # Some versions of pypdf may behave differently; continue anyway
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
        page = reader.pages[i]
        text = page.extract_text() or ""
        header = f"\n\n=== Page {i + 1} / {total_pages} ===\n"
        chunks.append(header + text)
    return "".join(chunks).strip()
