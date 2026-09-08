import json
import re
from pathlib import Path

import pymupdf
from rapidfuzz import fuzz

from src.extraction.pdf_reader import read_pdf
from src.extraction.question_detector import detect_questions
from src.extraction.question_parser import parse_question
from src.extraction.visual_asset_extractor import find_question_regions


PDF_PATH = Path(
    "data/raw/provas/revalida_2026_1_caderno_1.pdf"
)

OUTPUT_PATH = Path(
    "data/processed/revalida_2026_1_second_pass.json"
)

ALT_PATTERN = re.compile(r"\(([A-D])\)")


def normalize(text: str) -> str:
    text = text.replace("\u00a0", " ")
    return " ".join(text.split()).strip()


def extract_numbers(text: str) -> list[str]:
    return re.findall(
        r"\d+(?:[.,]\d+)*(?:/\d+(?:[.,]\d+)*)?%?",
        text,
    )


def clean_second_pass_prefix(
    text: str,
    question_number: int,
) -> str:

    text = normalize(text)

    text = re.sub(
        rf"^QUEST[ÃA]O\s+{question_number}\s*",
        "",
        text,
        count=1,
        flags=re.I,
    )

    text = re.sub(
        rf"^{question_number}\s*[.)]?\s*",
        "",
        text,
        count=1,
    )

    text = re.sub(
        r"^ITEM\s+\d+\s*(?:-\s*V\.\s*[\d.]+)?\s*",
        "",
        text,
        count=1,
        flags=re.I,
    )

    # Remove marcador editorial do caderno quando aparece
    # no final da região da questão.
    text = re.sub(
        r"\s*\bÁREA\s+LIVRE\b\s*$",
        "",
        text,
        flags=re.IGNORECASE,
    )

    return text.strip()


def parse_second_pass(
    text: str,
    question_number: int,
):
    text = clean_second_pass_prefix(
        text,
        question_number,
    )

    parts = ALT_PATTERN.split(text)

    stem = normalize(
        parts[0] if parts else ""
    )

    alternatives = {}

    for index in range(
        1,
        len(parts) - 1,
        2,
    ):
        letter = parts[index]

        alternatives[letter] = normalize(
            parts[index + 1]
        )

    return stem, alternatives


def extract_region_text(
    page,
    rect,
) -> str:
    words = page.get_text(
        "words",
        clip=rect,
        sort=True,
    )

    return " ".join(
        word[4]
        for word in words
    )


def compare_text(a: str, b: str) -> dict:
    a = normalize(a)
    b = normalize(b)

    return {
        "ratio": round(
            fuzz.ratio(a, b),
            2,
        ),
        "token_set_ratio": round(
            fuzz.token_set_ratio(a, b),
            2,
        ),
    }


def main():
    pdf_data = read_pdf(PDF_PATH)

    raw_questions = detect_questions(
        pdf_data,
        start_page=3,
        end_page=26,
    )

    parsed_questions = {
        q.question_number: parse_question(q)
        for q in raw_questions
    }

    document = pymupdf.open(PDF_PATH)

    results = []

    try:
        for page_index, page in enumerate(document):
            page_number = page_index + 1

            if not 3 <= page_number <= 26:
                continue

            regions = find_question_regions(page)

            for region in regions:
                number = region["question_number"]

                if number not in parsed_questions:
                    continue

                original = parsed_questions[number]

                second_raw = extract_region_text(
                    page,
                    region["rect"],
                )

                second_stem, second_alts = parse_second_pass(
                    second_raw,
                    number,
                )

                stem_scores = compare_text(
                    original.stem,
                    second_stem,
                )

                alt_scores = {}

                for letter in "ABCD":
                    alt_scores[letter] = compare_text(
                        original.alternatives.get(
                            letter,
                            "",
                        ),
                        second_alts.get(
                            letter,
                            "",
                        ),
                    )

                original_complete = " ".join(
                    [original.stem]
                    + [
                        original.alternatives.get(
                            letter,
                            "",
                        )
                        for letter in "ABCD"
                    ]
                )

                second_complete = " ".join(
                    [second_stem]
                    + [
                        second_alts.get(
                            letter,
                            "",
                        )
                        for letter in "ABCD"
                    ]
                )

                numbers_a = extract_numbers(
                    original_complete
                )

                numbers_b = extract_numbers(
                    second_complete
                )

                numbers_match = (
                    numbers_a == numbers_b
                )

                alternatives_complete = (
                    set(second_alts.keys())
                    == {"A", "B", "C", "D"}
                )

                all_ratio = [
                    stem_scores["ratio"]
                ] + [
                    alt_scores[l]["ratio"]
                    for l in "ABCD"
                ]

                all_token = [
                    stem_scores[
                        "token_set_ratio"
                    ]
                ] + [
                    alt_scores[l][
                        "token_set_ratio"
                    ]
                    for l in "ABCD"
                ]

                min_ratio = min(all_ratio)
                min_token = min(all_token)

                if (
                    min_ratio >= 99
                    and numbers_match
                    and alternatives_complete
                ):
                    status = "EXACT_MATCH"

                elif (
                    min_token >= 99
                    and min_ratio >= 90
                    and numbers_match
                    and alternatives_complete
                ):
                    status = "HIGH_CONFIDENCE"

                elif (
                    min_token >= 98
                    and numbers_match
                    and alternatives_complete
                ):
                    status = "LAYOUT_VARIANCE"

                else:
                    status = "REVIEW"

                results.append(
                    {
                        "question_number": number,
                        "source_page": page_number,

                        "stem_scores":
                            stem_scores,

                        "alternative_scores":
                            alt_scores,

                        "minimum_ratio":
                            min_ratio,

                        "minimum_token_set_ratio":
                            min_token,

                        "numbers_match":
                            numbers_match,

                        "numbers_first_pass":
                            numbers_a,

                        "numbers_second_pass":
                            numbers_b,

                        "alternatives_complete":
                            alternatives_complete,

                        "status":
                            status,
                    }
                )

    finally:
        document.close()

    results.sort(
        key=lambda x:
        x["question_number"]
    )

    OUTPUT_PATH.write_text(
        json.dumps(
            results,
            ensure_ascii=False,
            indent=2,
        ),
        encoding="utf-8",
    )

    counts = {
        "EXACT_MATCH": 0,
        "HIGH_CONFIDENCE": 0,
        "LAYOUT_VARIANCE": 0,
        "REVIEW": 0,
    }

    for item in results:
        counts[item["status"]] += 1

    print()
    print("=" * 78)
    print("RECONFIRMAÇÃO V2")
    print("=" * 78)

    print(
        f"Questões analisadas: "
        f"{len(results)}"
    )

    for key, value in counts.items():
        print(f"{key}: {value}")

    print()

    review = [
        item
        for item in results
        if item["status"] == "REVIEW"
    ]

    if review:
        print("Questões ainda em REVIEW:")
        print()

        for item in review:
            print(
                f"Q{item['question_number']:03d}"
                f" | ratio="
                f"{item['minimum_ratio']:.2f}"
                f" | token="
                f"{item['minimum_token_set_ratio']:.2f}"
                f" | números="
                f"{item['numbers_match']}"
            )

    print()
    print(f"Relatório: {OUTPUT_PATH}")


if __name__ == "__main__":
    main()
