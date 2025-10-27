#!/usr/bin/env python3
"""
Repo Inventory Script
- Lists files with language, category, size, last-modified, last commit SHA.
- Produces:
  - ai/docs/inventory.csv
  - ai/docs/coverage.csv

Usage:
  python ai/scripts/repo_inventory.py --root . --out ai/docs

Notes:
- Designed to complete under ~2 minutes on typical repos.
- Skips common bulky/vendor folders by default.
"""
from __future__ import annotations
import argparse
import csv
import os
import re
import subprocess
import sys
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Dict, Iterable, List, Optional, Tuple

# --------- Config ---------
DEFAULT_EXCLUDES = [
    ".git", "node_modules", ".venv", "venv", "dist", "build", ".next", "out",
    "coverage", ".pytest_cache", ".mypy_cache", "__pycache__", ".pnpm-store",
    ".yarn", ".cache", ".parcel-cache", "tmp", "temp", "vendor", "target"
]

LANG_BY_EXT = {
    # Web/TS
    ".ts": "TypeScript", ".tsx": "TypeScript", ".js": "JavaScript", ".jsx": "JavaScript",
    ".mjs": "JavaScript", ".cjs": "JavaScript",
    # Python
    ".py": "Python",
    # Config / Infra
    ".json": "JSON", ".yml": "YAML", ".yaml": "YAML", ".toml": "TOML", ".ini": "INI",
    ".env": "ENV",
    # Docs
    ".md": "Markdown", ".rst": "reStructuredText", ".txt": "Text",
    # Other common
    ".css": "CSS", ".scss": "SCSS", ".less": "LESS",
    ".sql": "SQL",
    ".sh": "Shell",
}

TEST_FILE_PATTERNS = [
    re.compile(r"(^|/)tests?(/|$)"),
    re.compile(r"(^|/)__tests__(/|$)"),
    re.compile(r"(\.test\.|\.spec\.)"),
    re.compile(r"(^|/)test_[^/]+$"),
]

DOC_FILE_EXTS = {".md", ".rst", ".txt"}
DOC_DIR_PATTERNS = [re.compile(r"(^|/)docs?(/|$)")]

BINARY_EXTS = {
    ".png", ".jpg", ".jpeg", ".gif", ".svg", ".ico", ".pdf", ".zip", ".gz",
    ".tar", ".tgz", ".mp4", ".mov", ".avi", ".webm", ".woff", ".woff2", ".ttf",
    ".eot", ".bin", ".db"
}

@dataclass
class FileRecord:
    path: str
    size_bytes: int
    language: str
    category: str  # source | tests | docs | other
    last_modified: str
    last_commit_sha: str


def is_excluded(path: Path, excludes: List[str]) -> bool:
    parts = set(path.parts)
    for ex in excludes:
        if ex in parts:
            return True
    return False


def detect_language(path: Path) -> str:
    return LANG_BY_EXT.get(path.suffix.lower(), "Unknown")


def detect_category(path: Path) -> str:
    p = str(path)
    # tests
    for pat in TEST_FILE_PATTERNS:
        if pat.search(p):
            return "tests"
    # docs
    if path.suffix.lower() in DOC_FILE_EXTS:
        return "docs"
    for pat in DOC_DIR_PATTERNS:
        if pat.search(p):
            return "docs"
    # source vs other
    lang = detect_language(path)
    if lang != "Unknown":
        return "source"
    return "other"


def git_last_modified_and_sha(repo_root: Path, file_path: Path) -> Tuple[str, str]:
    rel = os.path.relpath(file_path, repo_root)
    try:
        # Last commit ISO date and SHA for this file
        output = subprocess.check_output(
            ["git", "log", "-1", "--pretty=%cI|%H", "--", rel],
            cwd=str(repo_root), stderr=subprocess.DEVNULL
        ).decode("utf-8").strip()
        if "|" in output:
            date_iso, sha = output.split("|", 1)
            return date_iso, sha
    except Exception:
        pass
    # Fallback to filesystem mtime and HEAD sha
    try:
        mtime = datetime.fromtimestamp(file_path.stat().st_mtime).isoformat()
    except Exception:
        mtime = ""
    try:
        head = subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=str(repo_root)).decode().strip()
    except Exception:
        head = ""
    return mtime, head


def walk_files(root: Path, excludes: List[str]) -> Iterable[Path]:
    for dirpath, dirnames, filenames in os.walk(root):
        # prune excluded dirs in-place for performance
        dirnames[:] = [d for d in dirnames if d not in excludes]
        for fname in filenames:
            yield Path(dirpath) / fname


def inventory_repo(root: Path, excludes: List[str]) -> List[FileRecord]:
    records: List[FileRecord] = []
    for f in walk_files(root, excludes):
        if f.is_dir():
            continue
        # Skip obvious generated or binary
        if f.suffix.lower() in BINARY_EXTS:
            # We still inventory binaries as 'other' to reflect coverage, but could skip if desired
            pass
        rel = os.path.relpath(f, root)
        # Skip top-level lock files and metadata (optional)
        try:
            size = f.stat().st_size
        except FileNotFoundError:
            continue
        lang = detect_language(f)
        category = detect_category(f)
        last_modified, last_sha = git_last_modified_and_sha(root, f)
        records.append(FileRecord(rel, size, lang, category, last_modified, last_sha))
    return records


def write_inventory_csv(out_dir: Path, rows: List[FileRecord]) -> Path:
    out_path = out_dir / "inventory.csv"
    out_dir.mkdir(parents=True, exist_ok=True)
    with out_path.open("w", newline="") as f:
        w = csv.writer(f)
        w.writerow(["path", "size_bytes", "language", "category", "last_modified", "last_commit_sha"])
        for r in rows:
            w.writerow([r.path, r.size_bytes, r.language, r.category, r.last_modified, r.last_commit_sha])
    return out_path


def write_coverage_csv(out_dir: Path, rows: List[FileRecord]) -> Path:
    out_path = out_dir / "coverage.csv"
    out_dir.mkdir(parents=True, exist_ok=True)
    total_files = len(rows)
    total_bytes = sum(r.size_bytes for r in rows) or 1
    by_cat: Dict[str, Tuple[int, int]] = {}
    for r in rows:
        c = by_cat.get(r.category, (0, 0))
        by_cat[r.category] = (c[0] + 1, c[1] + r.size_bytes)

    with out_path.open("w", newline="") as f:
        w = csv.writer(f)
        w.writerow(["category", "file_count", "percent_files", "bytes", "percent_bytes"])
        for cat in sorted(by_cat.keys()):
            cnt, b = by_cat[cat]
            w.writerow([cat, cnt, round(cnt * 100.0 / max(total_files, 1), 2), b, round(b * 100.0 / total_bytes, 2)])
        # Add a languages section for additional visibility
        w.writerow([])
        w.writerow(["language", "file_count"])
        by_lang: Dict[str, int] = {}
        for r in rows:
            by_lang[r.language] = by_lang.get(r.language, 0) + 1
        for lang, cnt in sorted(by_lang.items(), key=lambda x: (-x[1], x[0])):
            w.writerow([lang, cnt])
    return out_path


def main():
    parser = argparse.ArgumentParser(description="Repo Inventory")
    parser.add_argument("--root", default=".", help="Path to repo root")
    parser.add_argument("--out", default="ai/docs", help="Output directory for CSVs")
    parser.add_argument("--exclude", action="append", default=[], help="Additional directories to exclude")
    args = parser.parse_args()

    root = Path(args.root).resolve()
    out_dir = (root / args.out) if not os.path.isabs(args.out) else Path(args.out)
    excludes = sorted(set(DEFAULT_EXCLUDES + args.exclude))

    print(f"[inventory] scanning: {root}")
    print(f"[inventory] excluding: {', '.join(excludes)}")
    rows = inventory_repo(root, excludes)
    inv_path = write_inventory_csv(out_dir, rows)
    cov_path = write_coverage_csv(out_dir, rows)
    print(f"[inventory] wrote {inv_path}")
    print(f"[inventory] wrote {cov_path}")


if __name__ == "__main__":
    sys.exit(main())
