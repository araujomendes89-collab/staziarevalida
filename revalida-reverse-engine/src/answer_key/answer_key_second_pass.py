import json
from pathlib import Path

import pymupdf


PDF_PATH = Path(
    "data/raw/gabaritos/"
    "2026_1_gabarito_definitivo_caderno1.pdf"
)

FIRST_PASS_PATH = Path(
    "data/processed/"
    "revalida_2026_1_gabarito_definitivo.json"
)

OUTPUT_PATH = Path(
    "data/processed/"
    "revalida_2026_1_gabarito_second_pass.json"
)


GLYPH_TO_ANSWER = {
    "\x04": "A",
    "\x11": "B",
    "\x12": "C",
    "\x18": "D",
}


def decode_answer(text):
    for char in reversed(text):
        if char in GLYPH_TO_ANSWER:
            return GLYPH_TO_ANSWER[char]

    return None


def get_answer_spans(page):
    spans = []

    data = page.get_text("dict")

    for block in data.get("blocks", []):
        if block.get("type") != 0:
            continue

        for line in block.get("lines", []):
            for span in line.get("spans", []):
                text = span.get("text", "")
                answer = decode_answer(text)

                if answer is None:
                    continue

                bbox = span.get(
                    "bbox",
                    [0, 0, 0, 0],
                )

                x0 = float(bbox[0])
                y0 = float(bbox[1])

                # Apenas a região das 20 linhas
                # da tabela.
                if not 300 <= y0 <= 700:
                    continue

                spans.append(
                    {
                        "answer": answer,
                        "raw": (
                            text
                            .encode("unicode_escape")
                            .decode("ascii")
                        ),
                        "x": x0,
                        "y": y0,
                    }
                )

    return spans


def collect_column(
    spans,
    x_min,
    x_max,
    first_question,
):
    column = [
        span
        for span in spans
        if x_min <= span["x"] <= x_max
    ]

    column.sort(
        key=lambda item: item["y"]
    )

    if len(column) != 20:
        raise RuntimeError(
            f"Esperadas 20 respostas "
            f"para Q{first_question}-"
            f"Q{first_question + 19}, "
            f"mas foram encontradas "
            f"{len(column)}."
        )

    results = []

    for index, span in enumerate(column):
        question_number = (
            first_question + index
        )

        results.append(
            {
                "question_number":
                    question_number,

                "official_answer":
                    span["answer"],

                "source_page":
                    1 if question_number <= 60 else 2,

                "raw_answer_glyph":
                    span["raw"],

                "x":
                    round(span["x"], 2),

                "y":
                    round(span["y"], 2),

                "method":
                    "FIXED_GRID_SECOND_PASS",
            }
        )

    return results


def main():
    doc = pymupdf.open(PDF_PATH)

    try:
        page1 = get_answer_spans(
            doc[0]
        )

        page2 = get_answer_spans(
            doc[1]
        )

        results = []

        # Página 1
        results.extend(
            collect_column(
                page1,
                150,
                210,
                1,
            )
        )

        results.extend(
            collect_column(
                page1,
                300,
                360,
                21,
            )
        )

        results.extend(
            collect_column(
                page1,
                445,
                510,
                41,
            )
        )

        # Página 2
        results.extend(
            collect_column(
                page2,
                225,
                275,
                61,
            )
        )

        results.extend(
            collect_column(
                page2,
                375,
                425,
                81,
            )
        )

    finally:
        doc.close()

    results.sort(
        key=lambda item:
        item["question_number"]
    )

    OUTPUT_PATH.write_text(
        json.dumps(
            results,
            ensure_ascii=False,
            indent=2,
        ),
        encoding="utf-8",
    )

    first_pass = json.loads(
        FIRST_PASS_PATH.read_text(
            encoding="utf-8"
        )
    )

    first_map = {
        item["question_number"]:
            item["official_answer"]
        for item in first_pass
    }

    second_map = {
        item["question_number"]:
            item["official_answer"]
        for item in results
    }

    differences = []

    for number in range(1, 101):
        a = first_map.get(number)
        b = second_map.get(number)

        if a != b:
            differences.append(
                {
                    "question_number":
                        number,
                    "first_pass": a,
                    "second_pass": b,
                }
            )

    print()
    print("=" * 78)
    print(
        "GABARITO — SEGUNDA EXTRAÇÃO INDEPENDENTE"
    )
    print("=" * 78)

    print(
        f"Registros Parser B: "
        f"{len(results)}"
    )

    print(
        f"Divergências A × B: "
        f"{len(differences)}"
    )

    if differences:
        print()
        print("DIVERGÊNCIAS:")

        for item in differences:
            print(
                f"Q"
                f"{item['question_number']:03d}"
                f" | A="
                f"{item['first_pass']}"
                f" | B="
                f"{item['second_pass']}"
            )

        print()
        print(
            "STATUS: REVIEW"
        )

    else:
        print()
        print(
            "100/100 respostas idênticas."
        )
        print(
            "STATUS: ANSWER_KEY_VERIFIED"
        )

    print()
    print(
        f"Arquivo: {OUTPUT_PATH}"
    )


if __name__ == "__main__":
    main()
