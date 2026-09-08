from pathlib import Path
import unicodedata

import pymupdf
from pydantic import BaseModel


class TextBlock(BaseModel):
    block_number: int
    x0: float
    y0: float
    x1: float
    y1: float
    text: str


class PageData(BaseModel):
    page_number: int
    width: float
    height: float
    text: str
    char_count: int
    image_count: int
    blocks: list[TextBlock]


class PDFData(BaseModel):
    filename: str
    page_count: int
    total_characters: int
    total_images: int
    pages: list[PageData]


def read_pdf(pdf_path: str | Path) -> PDFData:
    path = Path(pdf_path)

    if not path.exists():
        raise FileNotFoundError(f"PDF não encontrado: {path}")

    if path.suffix.lower() != ".pdf":
        raise ValueError(f"O arquivo não é um PDF: {path}")

    document = pymupdf.open(path)

    pages: list[PageData] = []
    total_characters = 0
    total_images = 0

    try:
        for index, page in enumerate(document):
            text = page.get_text("text", sort=True).strip()
            images = page.get_images(full=True)

            blocks: list[TextBlock] = []
            fragments = []
            for raw_block in page.get_text("dict", sort=True).get("blocks", []):
                if raw_block.get("type") != 0:
                    continue
                for line in raw_block.get("lines", []):
                    line_text = "".join(
                        span.get("text", "") for span in line.get("spans", [])
                    ).strip()
                    if line_text:
                        x0, y0, x1, y1 = line["bbox"]
                        fragments.append(
                            [float(x0), float(y0), float(x1), float(y1), line_text]
                        )

            rows: list[list[list]] = []
            for fragment in sorted(fragments, key=lambda item: (item[1], item[0])):
                side = fragment[0] >= float(page.rect.width) / 2
                matching = next(
                    (
                        row
                        for row in reversed(rows[-6:])
                        if abs(fragment[1] - row[0][1]) <= 2.5
                        and (row[0][0] >= float(page.rect.width) / 2) == side
                    ),
                    None,
                )
                if matching is None:
                    rows.append([fragment])
                else:
                    matching.append(fragment)

            for block_number, row in enumerate(rows):
                row.sort(key=lambda item: item[0])
                blocks.append(
                    TextBlock(
                        block_number=block_number,
                        x0=min(item[0] for item in row),
                        y0=min(item[1] for item in row),
                        x1=max(item[2] for item in row),
                        y1=max(item[3] for item in row),
                        text=" ".join(item[4] for item in row),
                    )
                )

            page_data = PageData(
                page_number=index + 1,
                width=float(page.rect.width),
                height=float(page.rect.height),
                text=text,
                char_count=len(text),
                image_count=len(images),
                blocks=blocks,
            )

            pages.append(page_data)

            total_characters += len(text)
            total_images += len(images)

    finally:
        document.close()

    result = PDFData(
        filename=path.name,
        page_count=len(pages),
        total_characters=total_characters,
        total_images=total_images,
        pages=pages,
    )
    characters = "".join(page.text for page in pages)
    non_space = [character for character in characters if not character.isspace()]
    letter_ratio = (
        sum(
            unicodedata.category(character).startswith("L")
            for character in non_space
        )
        / max(1, len(non_space))
    )
    punctuation_ratio = (
        sum(
            unicodedata.category(character).startswith("P")
            for character in non_space
        )
        / max(1, len(non_space))
    )
    letters = [
        character
        for character in non_space
        if unicodedata.category(character).startswith("L")
    ]
    portuguese_letters = set(
        "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ"
        "áàâãäéèêëíìîïóòôõöúùûüçÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇ"
    )
    suspicious_letter_ratio = (
        sum(character not in portuguese_letters for character in letters)
        / max(1, len(letters))
    )
    if (
        letter_ratio < 0.20
        or punctuation_ratio > 0.20
        or suspicious_letter_ratio > 0.02
    ):
        from src.extraction.vision_ocr import read_pdf_with_vision

        return read_pdf_with_vision(path, result)
    return result
