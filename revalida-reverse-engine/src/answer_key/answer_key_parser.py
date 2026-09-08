import json
from collections import Counter
from pathlib import Path

import pymupdf


PDF_PATH = Path(
    "data/raw/gabaritos/2026_1_gabarito_definitivo_caderno1.pdf"
)

OUTPUT_PATH = Path(
    "data/processed/revalida_2026_1_gabarito_definitivo.json"
)


BROKEN_DIGITS = {
    "Ϭ": "0",
    "ϭ": "1",
    "Ϯ": "2",
    "ϯ": "3",
    "ϰ": "4",
    "ϱ": "5",
    "ϲ": "6",
    "ϳ": "7",
    "ϴ": "8",
    "ϵ": "9",
}


# Glifos usados pelo PDF para A/B/C/D.
GLYPH_TO_ANSWER = {
    "\x04": "A",
    "\x11": "B",
    "\x12": "C",
    "\x18": "D",
}


def decode_question_number(text: str):
    decoded = "".join(
        BROKEN_DIGITS.get(char, char)
        for char in text.strip()
    )

    if not decoded.isdigit():
        return None

    number = int(decoded)

    if 1 <= number <= 100:
        return number

    return None


def decode_answer(text: str):
    # Alguns spans possuem caracteres auxiliares
    # antes do glifo da resposta.
    for char in reversed(text):
        if char in GLYPH_TO_ANSWER:
            return GLYPH_TO_ANSWER[char]

    return None


def get_spans(page):
    spans = []

    data = page.get_text("dict")

    for block in data.get("blocks", []):
        if block.get("type") != 0:
            continue

        for line in block.get("lines", []):
            for span in line.get("spans", []):
                text = span.get("text", "")
                bbox = span.get("bbox", [0, 0, 0, 0])

                spans.append(
                    {
                        "text": text,
                        "font": span.get("font", ""),
                        "x0": float(bbox[0]),
                        "y0": float(bbox[1]),
                        "x1": float(bbox[2]),
                        "y1": float(bbox[3]),
                    }
                )

    return spans


def parse_page(page, page_number: int):
    spans = get_spans(page)

    questions = []
    answers = []

    for span in spans:
        # Região da tabela do gabarito.
        if not 300 <= span["y0"] <= 700:
            continue

        number = decode_question_number(
            span["text"]
        )

        if number is not None:
            questions.append(
                {
                    **span,
                    "question_number": number,
                }
            )

        answer = decode_answer(
            span["text"]
        )

        if answer is not None:
            answers.append(
                {
                    **span,
                    "answer": answer,
                }
            )

    results = []

    for question in questions:
        candidates = []

        for answer in answers:
            delta_y = abs(
                answer["y0"]
                - question["y0"]
            )

            delta_x = (
                answer["x0"]
                - question["x0"]
            )

            # No PDF, a resposta está aproximadamente
            # 75-80 pontos à direita do número.
            if (
                delta_y <= 3.0
                and 40 <= delta_x <= 110
            ):
                candidates.append(
                    {
                        "delta_y": delta_y,
                        "delta_x": delta_x,
                        "answer": answer,
                    }
                )

        if not candidates:
            results.append(
                {
                    "question_number":
                        question["question_number"],

                    "official_answer":
                        None,

                    "answer_status":
                        "UNRESOLVED",

                    "answer_key_type":
                        "DEFINITIVE",

                    "source":
                        "INEP",

                    "source_page":
                        page_number,
                }
            )
            continue

        candidates.sort(
            key=lambda item: (
                item["delta_y"],
                abs(
                    item["delta_x"] - 78
                ),
            )
        )

        best = candidates[0]["answer"]

        raw_glyph = (
            best["text"]
            .encode(
                "unicode_escape"
            )
            .decode("ascii")
        )

        results.append(
            {
                "question_number":
                    question[
                        "question_number"
                    ],

                "official_answer":
                    best["answer"],

                "answer_status":
                    "VALID",

                "answer_key_type":
                    "DEFINITIVE",

                "source":
                    "INEP",

                "source_page":
                    page_number,

                "raw_answer_glyph":
                    raw_glyph,

                "question_position": {
                    "x": round(
                        question["x0"], 2
                    ),
                    "y": round(
                        question["y0"], 2
                    ),
                },

                "answer_position": {
                    "x": round(
                        best["x0"], 2
                    ),
                    "y": round(
                        best["y0"], 2
                    ),
                },
            }
        )

    return results


def main():
    if not PDF_PATH.exists():
        raise FileNotFoundError(
            f"PDF não encontrado: {PDF_PATH}"
        )

    document = pymupdf.open(
        PDF_PATH
    )

    results = []

    try:
        for page_index, page in enumerate(
            document,
            start=1,
        ):
            results.extend(
                parse_page(
                    page,
                    page_index,
                )
            )

    finally:
        document.close()

    results.sort(
        key=lambda item:
        item["question_number"]
    )

    numbers = [
        item["question_number"]
        for item in results
    ]

    counts = Counter(numbers)

    duplicates = sorted(
        number
        for number, count
        in counts.items()
        if count > 1
    )

    unique_numbers = set(numbers)

    missing = [
        number
        for number in range(1, 101)
        if number not in unique_numbers
    ]

    unresolved = [
        item["question_number"]
        for item in results
        if item["official_answer"]
        not in {"A", "B", "C", "D"}
    ]

    answer_distribution = Counter(
        item["official_answer"]
        for item in results
        if item["official_answer"]
        in {"A", "B", "C", "D"}
    )

    OUTPUT_PATH.parent.mkdir(
        parents=True,
        exist_ok=True,
    )

    OUTPUT_PATH.write_text(
        json.dumps(
            results,
            ensure_ascii=False,
            indent=2,
        ),
        encoding="utf-8",
    )

    print()
    print("=" * 78)
    print("GABARITO DEFINITIVO — EXTRAÇÃO")
    print("=" * 78)

    print(
        f"Registros extraídos: "
        f"{len(results)}"
    )

    print(
        f"Questões únicas: "
        f"{len(unique_numbers)}"
    )

    print(
        f"Duplicadas: {duplicates}"
    )

    print(
        f"Ausentes: {missing}"
    )

    print(
        f"Não resolvidas: {unresolved}"
    )

    print()
    print(
        "Distribuição:",
        dict(
            sorted(
                answer_distribution.items()
            )
        ),
    )

    if (
        len(results) == 100
        and len(unique_numbers) == 100
        and not duplicates
        and not missing
        and not unresolved
    ):
        print()
        print(
            "STATUS: STRUCTURALLY_VERIFIED"
        )
    else:
        print()
        print(
            "STATUS: REVIEW"
        )

    print()
    print(
        f"Arquivo: {OUTPUT_PATH}"
    )

    print()
    print(
        "Primeiras 20 respostas:"
    )

    for item in results[:20]:
        print(
            f"Q"
            f"{item['question_number']:03d}"
            f" → "
            f"{item['official_answer']}"
        )


if __name__ == "__main__":
    main()
