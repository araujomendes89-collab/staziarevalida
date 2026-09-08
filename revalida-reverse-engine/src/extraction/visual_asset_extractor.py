import json
import re
from pathlib import Path

import pymupdf


QUESTION_HEADER = re.compile(
    r"QUEST[ÃA]O\s+(\d{1,3})",
    re.IGNORECASE,
)


def find_question_regions(page):
    """
    Localiza as questões na página e cria regiões aproximadas
    usando coluna + posição vertical.
    """

    blocks = page.get_text("blocks")

    headers = []

    page_center = page.rect.width / 2

    for block in blocks:
        x0, y0, x1, y1, text = block[:5]

        match = QUESTION_HEADER.search(text)

        if not match:
            continue

        number = int(match.group(1))

        column = (
            "left"
            if x0 < page_center
            else "right"
        )

        headers.append(
            {
                "question_number": number,
                "column": column,
                "x0": x0,
                "y0": y0,
            }
        )

    regions = []

    for column in ("left", "right"):

        items = [
            h for h in headers
            if h["column"] == column
        ]

        items.sort(
            key=lambda h: h["y0"]
        )

        if column == "left":
            column_x0 = 35
            column_x1 = page_center
        else:
            column_x0 = page_center
            column_x1 = page.rect.width - 35

        for index, item in enumerate(items):

            start_y = item["y0"]

            if index + 1 < len(items):
                end_y = items[index + 1]["y0"]
            else:
                end_y = page.rect.height - 30

            regions.append(
                {
                    "question_number":
                        item["question_number"],

                    "column":
                        column,

                    "rect": pymupdf.Rect(
                        column_x0,
                        start_y,
                        column_x1,
                        end_y,
                    ),
                }
            )

    return regions


def overlap_ratio(rect_a, rect_b):
    intersection = rect_a & rect_b

    if intersection.is_empty:
        return 0.0

    if rect_a.get_area() == 0:
        return 0.0

    return (
        intersection.get_area()
        / rect_a.get_area()
    )


def extract_visual_assets(
    pdf_path,
    output_dir,
):
    pdf_path = Path(pdf_path)

    output_dir = Path(output_dir)

    output_dir.mkdir(
        parents=True,
        exist_ok=True,
    )

    document = pymupdf.open(pdf_path)

    manifest = []

    try:

        for page_index, page in enumerate(document):

            page_number = page_index + 1

            regions = find_question_regions(page)

            if not regions:
                continue

            images = page.get_images(
                full=True
            )

            for image_data in images:

                xref = image_data[0]

                try:
                    rects = page.get_image_rects(
                        xref
                    )
                except Exception:
                    continue

                for rect in rects:

                    # Ignora imagens minúsculas:
                    # logos, ícones etc.
                    if (
                        rect.width < 60
                        or rect.height < 60
                    ):
                        continue

                    best_region = None
                    best_overlap = 0.0

                    for region in regions:

                        overlap = overlap_ratio(
                            rect,
                            region["rect"],
                        )

                        if overlap > best_overlap:
                            best_overlap = overlap
                            best_region = region

                    if (
                        best_region is None
                        or best_overlap < 0.50
                    ):
                        continue

                    question_number = (
                        best_region[
                            "question_number"
                        ]
                    )

                    existing = [
                        item
                        for item in manifest
                        if item[
                            "question_number"
                        ] == question_number
                    ]

                    asset_number = (
                        len(existing) + 1
                    )

                    filename = (
                        f"q{question_number:03d}"
                        f"_image_{asset_number:02d}"
                        f".png"
                    )

                    output_path = (
                        output_dir / filename
                    )

                    #
                    # Em vez de salvar somente
                    # o bitmap interno, renderizamos
                    # exatamente a área visual usada
                    # na página.
                    #
                    pix = page.get_pixmap(
                        matrix=pymupdf.Matrix(
                            2.5,
                            2.5,
                        ),
                        clip=rect,
                        alpha=False,
                    )

                    pix.save(output_path)

                    manifest.append(
                        {
                            "question_number":
                                question_number,

                            "source_page":
                                page_number,

                            "type":
                                "image",

                            "asset":
                                filename,

                            "xref":
                                xref,

                            "bbox": {
                                "x0": round(
                                    rect.x0, 2
                                ),
                                "y0": round(
                                    rect.y0, 2
                                ),
                                "x1": round(
                                    rect.x1, 2
                                ),
                                "y1": round(
                                    rect.y1, 2
                                ),
                            },

                            "assignment_overlap":
                                round(
                                    best_overlap,
                                    3,
                                ),
                        }
                    )

    finally:
        document.close()

    manifest_path = (
        output_dir
        / "visual_assets_manifest.json"
    )

    manifest_path.write_text(
        json.dumps(
            manifest,
            ensure_ascii=False,
            indent=2,
        ),
        encoding="utf-8",
    )

    return manifest


if __name__ == "__main__":

    manifest = extract_visual_assets(
        "data/raw/provas/"
        "revalida_2026_1_caderno_1.pdf",

        "data/processed/"
        "visual_assets/"
        "revalida_2026_1",
    )

    print()
    print(
        f"Assets encontrados: "
        f"{len(manifest)}"
    )

    for item in manifest:
        print(
            f"Q{item['question_number']:03d}"
            f" | pág {item['source_page']}"
            f" | {item['asset']}"
        )
