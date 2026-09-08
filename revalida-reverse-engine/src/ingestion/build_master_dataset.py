import json
from pathlib import Path

from src.extraction.pdf_reader import read_pdf
from src.extraction.question_detector import detect_questions
from src.extraction.question_parser import parse_question


EXAM_ID = "revalida_2026_1"

QUESTION_PDF = Path(
    "data/raw/provas/revalida_2026_1_caderno_1.pdf"
)

ANSWER_KEY_PDF = Path(
    "data/raw/gabaritos/2026_1_gabarito_definitivo_caderno1.pdf"
)

ANSWER_KEY_PATH = Path(
    "data/processed/revalida_2026_1_gabarito_definitivo.json"
)

ANSWER_KEY_SECOND_PASS = Path(
    "data/processed/revalida_2026_1_gabarito_second_pass.json"
)

TOKEN_INTEGRITY_PATH = Path(
    "data/processed/revalida_2026_1_token_integrity.json"
)

VISUAL_MANIFEST_PATH = Path(
    "data/processed/visual_assets/"
    "revalida_2026_1/"
    "question_visual_assets.json"
)

QUESTION_CROP_DIR = Path(
    "data/processed/question_crops/"
    "revalida_2026_1"
)

OUTPUT_PATH = Path(
    "data/processed/revalida_2026_1_master.json"
)


def load_json(path):
    if not path.exists():
        return None

    return json.loads(
        path.read_text(
            encoding="utf-8"
        )
    )


def validate_answer_keys(
    first_pass,
    second_pass,
):
    first_map = {
        item["question_number"]:
            item["official_answer"]
        for item in first_pass
    }

    second_map = {
        item["question_number"]:
            item["official_answer"]
        for item in second_pass
    }

    differences = []

    for number in range(1, 101):
        if (
            first_map.get(number)
            != second_map.get(number)
        ):
            differences.append(number)

    if differences:
        raise RuntimeError(
            "Divergência entre os dois "
            f"gabaritos: {differences}"
        )

    return first_map


def validate_token_integrity(data):
    if data is None:
        raise RuntimeError(
            "Relatório de integridade "
            "de tokens não encontrado."
        )

    by_number = {
        item["question_number"]: item
        for item in data
    }

    failures = []

    for number in range(1, 101):
        item = by_number.get(number)

        if item is None:
            failures.append(number)
            continue

        if (
            item["status"]
            != "TOKEN_MULTISET_EXACT"
        ):
            failures.append(number)

    if failures:
        raise RuntimeError(
            "Questões sem validação textual "
            f"exata: {failures}"
        )

    return by_number


def load_visual_manifest():
    data = load_json(
        VISUAL_MANIFEST_PATH
    )

    if data is None:
        return {}

    return {
        item["question_number"]: item
        for item in data
    }


def main():
    print()
    print("=" * 78)
    print(
        "CONSTRUÇÃO DO DATASET MESTRE"
    )
    print("=" * 78)

    #
    # 1. Questões
    #
    pdf_data = read_pdf(
        QUESTION_PDF
    )

    raw_questions = detect_questions(
        pdf_data,
        start_page=3,
        end_page=26,
    )

    parsed = [
        parse_question(q)
        for q in raw_questions
    ]

    if len(parsed) != 100:
        raise RuntimeError(
            f"Esperadas 100 questões, "
            f"encontradas {len(parsed)}."
        )

    question_numbers = [
        q.question_number
        for q in parsed
    ]

    if question_numbers != list(
        range(1, 101)
    ):
        raise RuntimeError(
            "Numeração das questões "
            "não corresponde a 1-100."
        )

    #
    # 2. Gabarito
    #
    answer_first = load_json(
        ANSWER_KEY_PATH
    )

    answer_second = load_json(
        ANSWER_KEY_SECOND_PASS
    )

    if answer_first is None:
        raise RuntimeError(
            "Primeiro gabarito "
            "não encontrado."
        )

    if answer_second is None:
        raise RuntimeError(
            "Segundo gabarito "
            "não encontrado."
        )

    answer_map = validate_answer_keys(
        answer_first,
        answer_second,
    )

    #
    # 3. Integridade textual
    #
    token_integrity = load_json(
        TOKEN_INTEGRITY_PATH
    )

    token_map = validate_token_integrity(
        token_integrity
    )

    #
    # 4. Assets visuais
    #
    visual_map = (
        load_visual_manifest()
    )

    #
    # 5. Montagem
    #
    questions = []

    for q in parsed:
        number = q.question_number

        alternatives = {
            letter:
                q.alternatives.get(
                    letter,
                    ""
                )
            for letter in "ABCD"
        }

        crop_path = (
            QUESTION_CROP_DIR
            / f"q{number:03d}_question.png"
        )

        visual_data = visual_map.get(
            number,
            {}
        )

        visual_assets = (
            visual_data.get(
                "visual_assets",
                []
            )
        )

        question = {
            "exam_id":
                EXAM_ID,

            "exam_year":
                2026,

            "exam_edition":
                1,

            "exam_stage":
                "FIRST_PHASE",

            "booklet":
                1,

            "question_number":
                number,

            "item_code":
                q.item_code,

            "version_code":
                q.version_code,

            "page_start":
                q.page_start,

            "page_end":
                q.page_end,

            "stem":
                q.stem,

            "alternatives":
                alternatives,

            "official_answer":
                answer_map[number],

            "answer_status":
                "VALID",

            "answer_key_type":
                "DEFINITIVE",

            "visual": {
                "question_crop":
                    str(crop_path)
                    if crop_path.exists()
                    else None,

                "has_specific_assets":
                    bool(
                        visual_assets
                    ),

                "assets":
                    visual_assets,
            },

            "verification": {
                "structure":
                    True,

                "text":
                    "TEXT_EXTRACTION_VERIFIED",

                "token_integrity":
                    token_map[
                        number
                    ]["status"],

                "answer_key":
                    "ANSWER_KEY_VERIFIED",

                "visual_source_preserved":
                    crop_path.exists(),

                "status":
                    "DATASET_READY",
            },

            "source": {
                "exam_pdf":
                    str(
                        QUESTION_PDF
                    ),

                "answer_key_pdf":
                    str(
                        ANSWER_KEY_PDF
                    ),

                "institution":
                    "INEP",
            },
        }

        questions.append(
            question
        )

    #
    # 6. Validações finais
    #
    if len(questions) != 100:
        raise RuntimeError(
            "Dataset final não possui "
            "100 questões."
        )

    answers = [
        q["official_answer"]
        for q in questions
    ]

    invalid_answers = [
        q["question_number"]
        for q in questions
        if q["official_answer"]
        not in {"A", "B", "C", "D"}
    ]

    if invalid_answers:
        raise RuntimeError(
            "Respostas oficiais "
            "inválidas nas questões: "
            f"{invalid_answers}"
        )

    crops_missing = [
        q["question_number"]
        for q in questions
        if not q[
            "verification"
        ][
            "visual_source_preserved"
        ]
    ]

    dataset = {
        "exam": {
            "exam_id":
                EXAM_ID,

            "name":
                "Revalida INEP 2026/1",

            "year":
                2026,

            "edition":
                1,

            "stage":
                "FIRST_PHASE",

            "booklet":
                1,

            "total_questions":
                100,
        },

        "verification": {
            "question_count":
                len(questions),

            "text_verified":
                True,

            "answer_key_verified":
                True,

            "answer_key_double_pass":
                True,

            "dataset_status":
                "DATASET_READY",
        },

        "questions":
            questions,
    }

    OUTPUT_PATH.write_text(
        json.dumps(
            dataset,
            ensure_ascii=False,
            indent=2,
        ),
        encoding="utf-8",
    )

    print()
    print(
        f"Questões: "
        f"{len(questions)}"
    )

    print(
        "Texto verificado: 100/100"
    )

    print(
        "Gabarito verificado: 100/100"
    )

    print(
        f"Recortes visuais ausentes: "
        f"{crops_missing}"
    )

    print()
    print(
        "Distribuição do gabarito:"
    )

    for letter in "ABCD":
        print(
            f"{letter}: "
            f"{answers.count(letter)}"
        )

    print()
    print(
        "STATUS: DATASET_READY"
    )

    print()
    print(
        f"Arquivo: {OUTPUT_PATH}"
    )


if __name__ == "__main__":
    main()
