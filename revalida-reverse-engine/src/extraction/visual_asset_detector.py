import json
import re
from collections import defaultdict
from pathlib import Path

import pymupdf

from src.extraction.visual_asset_extractor import find_question_regions


PDF_PATH = Path(
    "data/raw/provas/revalida_2026_1_caderno_1.pdf"
)

MASTER_PATH = Path(
    "data/processed/revalida_2026_1_master.json"
)

OUTPUT_DIR = Path(
    "data/processed/visual_assets_v2/revalida_2026_1"
)

OUTPUT_MANIFEST = Path(
    "data/processed/revalida_2026_1_visual_assets_v2.json"
)


def normalize(text):
    return " ".join(
        text.lower().split()
    )


def classify_visual_type(question_text):
    text = normalize(question_text)

    patterns = [
        (
            "ECG",
            [
                r"\beletrocardiograma\b",
                r"\becg\b",
                r"\btraçado eletrocardiográfico\b",
            ],
        ),
        (
            "RADIOLOGY",
            [
                r"\bradiografia\b",
                r"\braio[- ]?x\b",
                r"\btomografia\b",
                r"\bressonância\b",
                r"\bultrassonografia\b",
                r"\bultrassom\b",
                r"\bimagem radiológica\b",
            ],
        ),
        (
            "CHART",
            [
                r"\bgráfico\b",
                r"\bcurva\b",
                r"\bhistograma\b",
            ],
        ),
        (
            "DIAGRAM",
            [
                r"\bdiagrama\b",
                r"\bfluxograma\b",
                r"\besquema\b",
                r"\bfigura\b",
            ],
        ),
        (
            "CLINICAL_IMAGE",
            [
                r"\bfotografia\b",
                r"\bfoto\b",
                r"\blesão\b",
                r"\bimagem clínica\b",
            ],
        ),
    ]

    for visual_type, expressions in patterns:
        for expression in expressions:
            if re.search(
                expression,
                text,
                flags=re.IGNORECASE,
            ):
                return visual_type

    return "IMAGE"


def get_question_text(master_question):
    parts = [
        master_question.get(
            "stem",
            "",
        )
    ]

    alternatives = master_question.get(
        "alternatives",
        {}
    )

    for letter in "ABCD":
        parts.append(
            alternatives.get(
                letter,
                "",
            )
        )

    return " ".join(parts)


def overlap_ratio(asset_rect, question_rect):
    intersection = (
        asset_rect
        & question_rect
    )

    if intersection.is_empty:
        return 0.0

    area = asset_rect.get_area()

    if area <= 0:
        return 0.0

    return (
        intersection.get_area()
        / area
    )


def best_question_for_rect(
    rect,
    regions,
):
    best = None
    best_score = 0.0

    for region in regions:
        score = overlap_ratio(
            rect,
            region["rect"],
        )

        if score > best_score:
            best_score = score
            best = region

    return best, best_score


def expanded_rect(
    rect,
    page_rect,
    margin=5,
):
    return pymupdf.Rect(
        max(
            page_rect.x0,
            rect.x0 - margin,
        ),
        max(
            page_rect.y0,
            rect.y0 - margin,
        ),
        min(
            page_rect.x1,
            rect.x1 + margin,
        ),
        min(
            page_rect.y1,
            rect.y1 + margin,
        ),
    )


def save_crop(
    page,
    rect,
    output_path,
    scale=3.0,
):
    pix = page.get_pixmap(
        matrix=pymupdf.Matrix(
            scale,
            scale,
        ),
        clip=rect,
        alpha=False,
    )

    pix.save(
        output_path
    )


def extract_images(
    page,
    page_number,
    regions,
    question_map,
    manifest,
    counters,
):
    seen_rects = set()

    for image in page.get_images(
        full=True
    ):
        xref = image[0]

        try:
            rects = page.get_image_rects(
                xref
            )
        except Exception:
            continue

        for rect in rects:
            key = (
                round(rect.x0, 1),
                round(rect.y0, 1),
                round(rect.x1, 1),
                round(rect.y1, 1),
            )

            if key in seen_rects:
                continue

            seen_rects.add(key)

            # Ignora logos e elementos minúsculos.
            if (
                rect.width < 50
                or rect.height < 50
            ):
                continue

            region, overlap = (
                best_question_for_rect(
                    rect,
                    regions,
                )
            )

            if (
                region is None
                or overlap < 0.50
            ):
                continue

            number = region[
                "question_number"
            ]

            master_question = (
                question_map.get(number)
            )

            if master_question is None:
                continue

            counters[
                (number, "image")
            ] += 1

            sequence = counters[
                (number, "image")
            ]

            visual_type = (
                classify_visual_type(
                    get_question_text(
                        master_question
                    )
                )
            )

            filename = (
                f"q{number:03d}_"
                f"{visual_type.lower()}_"
                f"{sequence:02d}.png"
            )

            output_path = (
                OUTPUT_DIR
                / filename
            )

            crop = expanded_rect(
                rect,
                page.rect,
                margin=3,
            )

            save_crop(
                page,
                crop,
                output_path,
            )

            manifest[number].append(
                {
                    "asset_type":
                        visual_type,

                    "source_kind":
                        "EMBEDDED_IMAGE",

                    "file":
                        filename,

                    "source_page":
                        page_number,

                    "xref":
                        xref,

                    "bbox": {
                        "x0":
                            round(rect.x0, 2),
                        "y0":
                            round(rect.y0, 2),
                        "x1":
                            round(rect.x1, 2),
                        "y1":
                            round(rect.y1, 2),
                    },

                    "assignment_overlap":
                        round(
                            overlap,
                            3,
                        ),
                }
            )


def extract_tables(
    page,
    page_number,
    regions,
    manifest,
    counters,
):
    try:
        finder = page.find_tables()
    except Exception:
        return

    for table in finder.tables:
        rect = pymupdf.Rect(
            table.bbox
        )

        # Ignora tabelas muito pequenas.
        if (
            rect.width < 80
            or rect.height < 25
        ):
            continue

        region, overlap = (
            best_question_for_rect(
                rect,
                regions,
            )
        )

        if (
            region is None
            or overlap < 0.40
        ):
            continue

        number = region[
            "question_number"
        ]

        counters[
            (number, "table")
        ] += 1

        sequence = counters[
            (number, "table")
        ]

        filename = (
            f"q{number:03d}_"
            f"table_{sequence:02d}.png"
        )

        output_path = (
            OUTPUT_DIR
            / filename
        )

        crop = expanded_rect(
            rect,
            page.rect,
            margin=5,
        )

        save_crop(
            page,
            crop,
            output_path,
        )

        rows = []

        try:
            extracted = (
                table.extract()
            )

            if extracted:
                rows = extracted

        except Exception:
            pass

        manifest[number].append(
            {
                "asset_type":
                    "TABLE",

                "source_kind":
                    "PDF_TABLE",

                "file":
                    filename,

                "source_page":
                    page_number,

                "bbox": {
                    "x0":
                        round(rect.x0, 2),
                    "y0":
                        round(rect.y0, 2),
                    "x1":
                        round(rect.x1, 2),
                    "y1":
                        round(rect.y1, 2),
                },

                "assignment_overlap":
                    round(
                        overlap,
                        3,
                    ),

                "table_data":
                    rows,
            }
        )


def main():
    if not MASTER_PATH.exists():
        raise FileNotFoundError(
            f"Dataset mestre não encontrado: "
            f"{MASTER_PATH}"
        )

    master = json.loads(
        MASTER_PATH.read_text(
            encoding="utf-8"
        )
    )

    question_map = {
        q["question_number"]: q
        for q in master[
            "questions"
        ]
    }

    OUTPUT_DIR.mkdir(
        parents=True,
        exist_ok=True,
    )

    manifest = defaultdict(
        list
    )

    counters = defaultdict(
        int
    )

    document = pymupdf.open(
        PDF_PATH
    )

    try:
        for page_index, page in enumerate(
            document
        ):
            page_number = (
                page_index + 1
            )

            if not (
                3
                <= page_number
                <= 26
            ):
                continue

            regions = (
                find_question_regions(
                    page
                )
            )

            extract_images(
                page,
                page_number,
                regions,
                question_map,
                manifest,
                counters,
            )

            extract_tables(
                page,
                page_number,
                regions,
                manifest,
                counters,
            )

    finally:
        document.close()

    questions = []

    for number in range(
        1,
        101
    ):
        original_crop = Path(
            "data/processed/"
            "question_crops/"
            "revalida_2026_1/"
            f"q{number:03d}_question.png"
        )

        assets = manifest.get(
            number,
            [],
        )

        questions.append(
            {
                "question_number":
                    number,

                "question_original":
                    str(
                        original_crop
                    )
                    if original_crop.exists()
                    else None,

                "visual_source_preserved":
                    original_crop.exists(),

                "has_specific_assets":
                    bool(assets),

                "asset_count":
                    len(assets),

                "assets":
                    assets,
            }
        )

    output = {
        "exam_id":
            "revalida_2026_1",

        "visual_manifest_version":
            "2.0.0",

        "questions":
            questions,
    }

    OUTPUT_MANIFEST.write_text(
        json.dumps(
            output,
            ensure_ascii=False,
            indent=2,
        ),
        encoding="utf-8",
    )

    with_assets = [
        q
        for q in questions
        if q[
            "has_specific_assets"
        ]
    ]

    missing_original = [
        q["question_number"]
        for q in questions
        if not q[
            "visual_source_preserved"
        ]
    ]

    type_counts = defaultdict(
        int
    )

    for q in questions:
        for asset in q[
            "assets"
        ]:
            type_counts[
                asset["asset_type"]
            ] += 1

    print()
    print("=" * 78)
    print(
        "VISUAL ASSET DETECTOR V2"
    )
    print("=" * 78)

    print(
        "Questões analisadas: 100"
    )

    print(
        f"Questões com assets "
        f"específicos: "
        f"{len(with_assets)}"
    )

    print(
        f"Recortes originais ausentes: "
        f"{missing_original}"
    )

    print()
    print(
        "Assets por tipo:"
    )

    for key in sorted(
        type_counts
    ):
        print(
            f"{key}: "
            f"{type_counts[key]}"
        )

    print()
    print(
        "Questões com assets:"
    )

    for q in with_assets:
        types = [
            asset[
                "asset_type"
            ]
            for asset in q[
                "assets"
            ]
        ]

        print(
            f"Q"
            f"{q['question_number']:03d}"
            f" → "
            f"{', '.join(types)}"
        )

    print()
    print(
        f"Manifesto: "
        f"{OUTPUT_MANIFEST}"
    )

    print()
    print(
        "STATUS: VISUAL_ASSETS_EXTRACTED"
    )


if __name__ == "__main__":
    main()
