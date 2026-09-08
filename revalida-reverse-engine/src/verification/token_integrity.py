import json
import re
import unicodedata
from collections import Counter
from pathlib import Path

import pymupdf

from src.extraction.pdf_reader import read_pdf
from src.extraction.question_detector import detect_questions
from src.extraction.question_parser import parse_question
from src.extraction.visual_asset_extractor import find_question_regions
from src.verification.second_pass import (
    PDF_PATH,
    extract_region_text,
    parse_second_pass,
)


OUTPUT_PATH = Path(
    "data/processed/revalida_2026_1_token_integrity.json"
)


def normalize_token(token: str) -> str:
    token = unicodedata.normalize(
        "NFKC",
        token,
    )

    return token.lower().strip()


def tokenize(text: str) -> list[str]:
    """
    Mantém palavras, números, unidades e símbolos
    clinicamente relevantes.

    A ordem não importa, mas a QUANTIDADE
    de cada token importa.
    """

    return [
        normalize_token(token)
        for token in re.findall(
            r"""
            \d+(?:[.,]\d+)*(?:/\d+(?:[.,]\d+)*)?%?
            |
            [A-Za-zÀ-ÖØ-öø-ÿµμ]+
            |
            [<>≤≥=±]
            """,
            text,
            flags=re.VERBOSE,
        )
    ]


def counter_similarity(
    text_a: str,
    text_b: str,
) -> dict:

    tokens_a = tokenize(text_a)
    tokens_b = tokenize(text_b)

    counter_a = Counter(tokens_a)
    counter_b = Counter(tokens_b)

    exact = counter_a == counter_b

    common = sum(
        (
            counter_a
            & counter_b
        ).values()
    )

    total_a = sum(
        counter_a.values()
    )

    total_b = sum(
        counter_b.values()
    )

    precision = (
        common / total_b
        if total_b
        else 0
    )

    recall = (
        common / total_a
        if total_a
        else 0
    )

    if precision + recall:
        f1 = (
            2
            * precision
            * recall
            / (
                precision
                + recall
            )
        )
    else:
        f1 = 0

    missing = list(
        (
            counter_a
            - counter_b
        ).elements()
    )

    extra = list(
        (
            counter_b
            - counter_a
        ).elements()
    )

    return {
        "exact_multiset":
            exact,

        "token_f1":
            round(
                f1 * 100,
                3,
            ),

        "token_count_first":
            total_a,

        "token_count_second":
            total_b,

        "missing_tokens":
            missing,

        "extra_tokens":
            extra,
    }


def main():

    pdf_data = read_pdf(
        PDF_PATH
    )

    raw_questions = detect_questions(
        pdf_data,
        start_page=3,
        end_page=26,
    )

    first_pass = {
        q.question_number:
            parse_question(q)
        for q in raw_questions
    }

    document = pymupdf.open(
        PDF_PATH
    )

    results = []

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

            for region in regions:

                number = region[
                    "question_number"
                ]

                if number not in first_pass:
                    continue

                q1 = first_pass[number]

                raw2 = (
                    extract_region_text(
                        page,
                        region["rect"],
                    )
                )

                stem2, alts2 = (
                    parse_second_pass(
                        raw2,
                        number,
                    )
                )

                stem_check = (
                    counter_similarity(
                        q1.stem,
                        stem2,
                    )
                )

                alt_checks = {}

                for letter in "ABCD":

                    alt_checks[letter] = (
                        counter_similarity(
                            q1.alternatives.get(
                                letter,
                                "",
                            ),
                            alts2.get(
                                letter,
                                "",
                            ),
                        )
                    )

                all_checks = [
                    stem_check
                ] + [
                    alt_checks[
                        letter
                    ]
                    for letter
                    in "ABCD"
                ]

                all_exact = all(
                    check[
                        "exact_multiset"
                    ]
                    for check
                    in all_checks
                )

                minimum_f1 = min(
                    check[
                        "token_f1"
                    ]
                    for check
                    in all_checks
                )

                if all_exact:
                    status = (
                        "TOKEN_MULTISET_EXACT"
                    )

                elif (
                    minimum_f1
                    >= 99.5
                ):
                    status = (
                        "TOKEN_NEAR_EXACT"
                    )

                else:
                    status = (
                        "VISUAL_CHECK"
                    )

                results.append(
                    {
                        "question_number":
                            number,

                        "source_page":
                            page_number,

                        "stem":
                            stem_check,

                        "alternatives":
                            alt_checks,

                        "minimum_token_f1":
                            minimum_f1,

                        "status":
                            status,
                    }
                )

    finally:
        document.close()

    results.sort(
        key=lambda item:
        item[
            "question_number"
        ]
    )

    OUTPUT_PATH.write_text(
        json.dumps(
            results,
            ensure_ascii=False,
            indent=2,
        ),
        encoding="utf-8",
    )

    counts = Counter(
        item["status"]
        for item
        in results
    )

    print()
    print("=" * 78)
    print(
        "INTEGRIDADE DE TOKENS"
    )
    print("=" * 78)

    print(
        f"Questões: "
        f"{len(results)}"
    )

    print(
        "TOKEN_MULTISET_EXACT:",
        counts[
            "TOKEN_MULTISET_EXACT"
        ],
    )

    print(
        "TOKEN_NEAR_EXACT:",
        counts[
            "TOKEN_NEAR_EXACT"
        ],
    )

    print(
        "VISUAL_CHECK:",
        counts[
            "VISUAL_CHECK"
        ],
    )

    visual = [
        item
        for item in results
        if item["status"]
        == "VISUAL_CHECK"
    ]

    if visual:

        print()
        print(
            "Revisão visual necessária:"
        )

        for item in visual:

            print(
                f"Q"
                f"{item['question_number']:03d}"
                f" | F1="
                f"{item['minimum_token_f1']:.3f}%"
            )

    print()
    print(
        "Relatório:",
        OUTPUT_PATH,
    )


if __name__ == "__main__":
    main()
