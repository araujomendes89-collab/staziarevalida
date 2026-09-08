"""Fallback de OCR local para PDFs com camada textual corrompida."""

import hashlib
import json
import re
import shutil
import subprocess
import sys
from pathlib import Path

from src.extraction.pdf_reader import PDFData, PageData, TextBlock


def _cache_path(pdf_path: Path) -> Path:
    project_root = Path(__file__).resolve().parents[2]
    digest = hashlib.sha256(pdf_path.read_bytes()).hexdigest()
    return project_root / "data/processed/ocr" / f"{digest}.json"


def read_pdf_with_vision(pdf_path: Path, native: PDFData) -> PDFData:
    if sys.platform != "darwin" or shutil.which("swift") is None:
        raise RuntimeError(
            f"{pdf_path}: camada textual corrompida e OCR local indisponível."
        )
    cache = _cache_path(pdf_path)
    if not cache.is_file():
        cache.parent.mkdir(parents=True, exist_ok=True)
        temporary = cache.with_suffix(".json.tmp")
        script = Path(__file__).with_name("vision_ocr.swift")
        subprocess.run(
            ["swift", str(script), str(pdf_path), str(temporary)],
            check=True,
        )
        temporary.replace(cache)
    try:
        payload = json.loads(cache.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError) as exc:
        raise RuntimeError(f"Cache de OCR inválido: {cache}") from exc

    pages = []
    native_by_number = {page.page_number: page for page in native.pages}
    for page_data in payload.get("pages", []):
        blocks = [
            TextBlock(
                block_number=index,
                x0=item["x0"],
                y0=item["y0"],
                x1=item["x1"],
                y1=item["y1"],
                text=item["text"],
            )
            for index, item in enumerate(page_data.get("blocks", []))
            if item.get("text", "").strip()
        ]
        text = "\n".join(block.text for block in blocks)
        native_page = native_by_number.get(page_data["page_number"])
        if native_page is not None:
            ocr_headers = {
                int(match.group(1))
                for match in re.finditer(
                    r"QUEST[ÃA]O\s*[,.:|]?\s*(\d{1,3})",
                    text,
                    re.IGNORECASE,
                )
            }
            for native_block in native_page.blocks:
                match = re.search(
                    r"QUEST[ÃA]O\s+(\d{1,3})",
                    native_block.text,
                    re.IGNORECASE,
                )
                if match and int(match.group(1)) not in ocr_headers:
                    blocks.append(native_block)
                # A camada textual pode estar ilegível, mas os marcadores
                # editoriais (A)-(D) normalmente permanecem intactos. Eles
                # são usados apenas como âncoras geométricas; o conteúdo vem
                # integralmente do OCR local.
                alternative = re.match(
                    r"^\s*(?:\(([A-D])\)|([A-D])[\x00-\x1f])",
                    native_block.text,
                )
                if alternative:
                    letter = alternative.group(1) or alternative.group(2)
                    same_column = [
                        block
                        for block in blocks
                        if abs(block.y0 - native_block.y0) <= 8.0
                        and (block.x0 >= native_page.width / 2)
                        == (native_block.x0 >= native_page.width / 2)
                    ]
                    if any(
                        re.match(rf"^\s*\({letter}\)(?:\s|$)", block.text)
                        for block in same_column
                    ):
                        continue
                    marker_y = (
                        min(same_column, key=lambda block: abs(block.y0 - native_block.y0)).y0
                        - 0.01
                        if same_column
                        else native_block.y0
                    )
                    blocks.append(
                        TextBlock(
                            block_number=len(blocks),
                            x0=max(0.0, native_block.x0 - 8.0),
                            y0=marker_y,
                            x1=native_block.x0,
                            y1=native_block.y1,
                            text=f"({letter})",
                        )
                    )
            text = "\n".join(block.text for block in blocks)
        pages.append(
            PageData(
                page_number=page_data["page_number"],
                width=page_data["width"],
                height=page_data["height"],
                text=text,
                char_count=len(text),
                image_count=native_page.image_count if native_page else 0,
                blocks=blocks,
            )
        )
    if len(pages) != native.page_count:
        raise RuntimeError(f"OCR incompleto para {pdf_path}.")
    return PDFData(
        filename=pdf_path.name,
        page_count=len(pages),
        total_characters=sum(page.char_count for page in pages),
        total_images=native.total_images,
        pages=pages,
    )
