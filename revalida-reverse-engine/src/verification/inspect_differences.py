from src.extraction.pdf_reader import read_pdf
from src.extraction.question_detector import detect_questions
from src.extraction.question_parser import parse_question
from src.extraction.visual_asset_extractor import find_question_regions
from src.verification.second_pass import (
    extract_region_text,
    parse_second_pass,
    similarity,
    PDF_PATH,
)

import pymupdf


QUESTIONS_TO_INSPECT = [
    2, 4, 5, 11, 30, 34, 78, 88, 100
]


def main():
    pdf_data = read_pdf(PDF_PATH)

    raw = detect_questions(
        pdf_data,
        start_page=3,
        end_page=26,
    )

    first_pass = {
        q.question_number: parse_question(q)
        for q in raw
    }

    document = pymupdf.open(PDF_PATH)

    try:
        for page_index, page in enumerate(document):
            page_number = page_index + 1

            if not 3 <= page_number <= 26:
                continue

            regions = find_question_regions(page)

            for region in regions:
                n = region["question_number"]

                if n not in QUESTIONS_TO_INSPECT:
                    continue

                q1 = first_pass[n]

                raw2 = extract_region_text(
                    page,
                    region["rect"],
                )

                stem2, alts2 = parse_second_pass(
                    raw2,
                    n,
                )

                print("\n")
                print("=" * 100)
                print(f"QUESTÃO {n}")
                print("=" * 100)

                print(
                    f"STEM: "
                    f"{similarity(q1.stem, stem2):.2f}%"
                )

                for letter in "ABCD":
                    score = similarity(
                        q1.alternatives.get(letter, ""),
                        alts2.get(letter, ""),
                    )

                    print(
                        f"ALT {letter}: {score:.2f}%"
                    )

                print("\n--- PRIMEIRA EXTRAÇÃO / STEM ---")
                print(q1.stem)

                print("\n--- SEGUNDA EXTRAÇÃO / STEM ---")
                print(stem2)

                for letter in "ABCD":
                    score = similarity(
                        q1.alternatives.get(letter, ""),
                        alts2.get(letter, ""),
                    )

                    if score < 97:
                        print(
                            f"\n--- PRIMEIRA / {letter} ---"
                        )
                        print(
                            q1.alternatives.get(letter, "")
                        )

                        print(
                            f"\n--- SEGUNDA / {letter} ---"
                        )
                        print(
                            alts2.get(letter, "")
                        )

    finally:
        document.close()


if __name__ == "__main__":
    main()
