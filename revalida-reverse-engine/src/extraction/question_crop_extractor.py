import json
from pathlib import Path

import pymupdf

from src.extraction.visual_asset_extractor import find_question_regions


PDF_PATH = Path(
    "data/raw/provas/revalida_2026_1_caderno_1.pdf"
)

OUTPUT_DIR = Path(
    "data/processed/question_crops/revalida_2026_1"
)


def extract_question_crops():
    OUTPUT_DIR.mkdir(
        parents=True,
        exist_ok=True,
    )

    document = pymupdf.open(PDF_PATH)

    manifest = []

    try:
        for page_index, page in enumerate(document):

            page_number = page_index + 1

            # Apenas corpo da prova
            if not 3 <= page_number <= 26:
                continue

            regions = find_question_regions(page)

            for region in regions:

                question_number = region[
                    "question_number"
                ]

                if not 1 <= question_number <= 100:
                    continue

                rect = region["rect"]

                #
                # Pequena margem para evitar cortes
                #
                margin_x = 8
                margin_y = 5

                crop = pymupdf.Rect(
                    max(
                        0,
                        rect.x0 - margin_x
                    ),
                    max(
                        0,
                        rect.y0 - margin_y
                    ),
                    min(
                        page.rect.width,
                        rect.x1 + margin_x
                    ),
                    min(
                        page.rect.height,
                        rect.y1 + margin_y
                    ),
                )

                filename = (
                    f"q{question_number:03d}"
                    "_question.png"
                )

                output_path = (
                    OUTPUT_DIR / filename
                )

                pix = page.get_pixmap(
                    matrix=pymupdf.Matrix(
                        2.5,
                        2.5,
                    ),
                    clip=crop,
                    alpha=False,
                )

                pix.save(output_path)

                manifest.append(
                    {
                        "question_number":
                            question_number,

                        "source_page":
                            page_number,

                        "asset":
                            filename,

                        "type":
                            "question_crop",

                        "column":
                            region["column"],

                        "bbox": {
                            "x0": round(
                                crop.x0, 2
                            ),
                            "y0": round(
                                crop.y0, 2
                            ),
                            "x1": round(
                                crop.x1, 2
                            ),
                            "y1": round(
                                crop.y1, 2
                            ),
                        },
                    }
                )

    finally:
        document.close()

    manifest.sort(
        key=lambda item:
        item["question_number"]
    )

    manifest_path = (
        OUTPUT_DIR
        / "question_crops_manifest.json"
    )

    manifest_path.write_text(
        json.dumps(
            manifest,
            ensure_ascii=False,
            indent=2,
        ),
        encoding="utf-8",
    )

    print()
    print(
        f"Recortes gerados: "
        f"{len(manifest)}"
    )

    numbers = {
        item["question_number"]
        for item in manifest
    }

    missing = [
        n
        for n in range(1, 101)
        if n not in numbers
    ]

    print(
        f"Questões ausentes: {missing}"
    )

    print()
    print(
        f"Manifesto: {manifest_path}"
    )


if __name__ == "__main__":
    extract_question_crops()
