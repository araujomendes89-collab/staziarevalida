import json
from pathlib import Path

import pymupdf

from src.extraction.visual_asset_extractor import find_question_regions


def rect_overlap_ratio(rect_a, rect_b):
    intersection = rect_a & rect_b

    if intersection.is_empty:
        return 0.0

    area = rect_a.get_area()

    if area <= 0:
        return 0.0

    return intersection.get_area() / area


def find_question_for_rect(rect, regions):
    best = None
    best_overlap = 0.0

    for region in regions:
        overlap = rect_overlap_ratio(
            rect,
            region["rect"],
        )

        if overlap > best_overlap:
            best_overlap = overlap
            best = region

    return best, best_overlap


def extract_tables(
    pdf_path: str,
    output_dir: str,
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

            try:
                tables = page.find_tables()
            except Exception as exc:
                print(
                    f"Página {page_number}: "
                    f"erro ao procurar tabelas: {exc}"
                )
                continue

            if not tables.tables:
                continue

            for table_index, table in enumerate(
                tables.tables,
                start=1,
            ):

                bbox = pymupdf.Rect(table.bbox)

                question_region, overlap = (
                    find_question_for_rect(
                        bbox,
                        regions,
                    )
                )

                if (
                    question_region is None
                    or overlap < 0.40
                ):
                    continue

                question_number = (
                    question_region[
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
                    f"_table_{asset_number:02d}"
                    f".png"
                )

                output_path = (
                    output_dir / filename
                )

                # Pequena margem para evitar
                # cortar linhas externas.
                expanded = pymupdf.Rect(
                    max(
                        0,
                        bbox.x0 - 5,
                    ),
                    max(
                        0,
                        bbox.y0 - 5,
                    ),
                    min(
                        page.rect.width,
                        bbox.x1 + 5,
                    ),
                    min(
                        page.rect.height,
                        bbox.y1 + 5,
                    ),
                )

                pix = page.get_pixmap(
                    matrix=pymupdf.Matrix(
                        3,
                        3,
                    ),
                    clip=expanded,
                    alpha=False,
                )

                pix.save(output_path)

                #
                # Também tentamos preservar
                # o conteúdo tabular em dados.
                #
                rows = []

                try:
                    extracted = table.extract()

                    if extracted:
                        rows = extracted

                except Exception:
                    pass

                manifest.append(
                    {
                        "question_number":
                            question_number,

                        "source_page":
                            page_number,

                        "type":
                            "table",

                        "asset":
                            filename,

                        "bbox": {
                            "x0": round(
                                bbox.x0,
                                2,
                            ),
                            "y0": round(
                                bbox.y0,
                                2,
                            ),
                            "x1": round(
                                bbox.x1,
                                2,
                            ),
                            "y1": round(
                                bbox.y1,
                                2,
                            ),
                        },

                        "assignment_overlap":
                            round(
                                overlap,
                                3,
                            ),

                        "rows":
                            rows,
                    }
                )

    finally:
        document.close()

    manifest_path = (
        output_dir
        / "table_assets_manifest.json"
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

    manifest = extract_tables(
        "data/raw/provas/"
        "revalida_2026_1_caderno_1.pdf",

        "data/processed/"
        "visual_assets/"
        "revalida_2026_1",
    )

    print()
    print(
        f"Tabelas encontradas: "
        f"{len(manifest)}"
    )

    for item in manifest:

        print(
            f"Q{item['question_number']:03d}"
            f" | página "
            f"{item['source_page']}"
            f" | {item['asset']}"
        )
