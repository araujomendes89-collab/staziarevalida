import argparse
import json
from collections import Counter
from pathlib import Path

from src.config.exams import (
    DEFAULT_EXAM_ID,
    PROJECT_ROOT,
    get_exam_config,
    load_exam_master,
)


FIELDS = [
    "primary_area",
    "primary_subarea",
    "primary_competency",
    "cognitive_task",
]


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--exam-id", default=DEFAULT_EXAM_ID)
    args = parser.parse_args()
    try:
        exam = get_exam_config(args.exam_id)
    except ValueError as exc:
        parser.error(str(exc))

    queue_path = exam.adjudication_queue_path(PROJECT_ROOT)
    output_path = exam.divergence_inspection_path(PROJECT_ROOT)

    for label, path in (
        ("Fila de adjudicação", queue_path),
    ):
        if not path.is_file():
            parser.error(f"{label} não encontrado: {path}")

    try:
        master = load_exam_master(exam, PROJECT_ROOT)
    except RuntimeError as exc:
        parser.error(str(exc))

    queue = json.loads(
        queue_path.read_text(
            encoding="utf-8"
        )
    )

    if queue.get("exam_id") != exam.exam_id:
        parser.error(f"{queue_path}: exam_id incompatível.")

    master_map = {
        q["question_number"]: q
        for q in master["questions"]
    }

    questions = queue["questions"]

    signature_counter = Counter()
    field_counter = Counter()

    report = []

    print()
    print("=" * 100)
    print("INSPEÇÃO DAS DIVERGÊNCIAS — QUESTION DNA")
    print("=" * 100)

    print(
        f"Questões na fila: {len(questions)}"
    )

    print()

    for item in questions:
        number = item["question_number"]

        p1 = item["pass1"]
        p2 = item["pass2"]

        differences = item[
            "differences"
        ]

        for field in differences:
            field_counter[field] += 1

        signature = tuple(
            sorted(differences)
        )

        signature_counter[
            signature
        ] += 1

        if number not in master_map:
            raise RuntimeError(
                f"Q{number:03d}: questão da fila ausente no master."
            )
        source = master_map[number]

        stem = (
            source.get("clean_stem")
            or source.get("stem")
            or ""
        )

        alternatives = source.get(
            "alternatives",
            {}
        )

        record = {
            "question_number":
                number,

            "status":
                item["status"],

            "differences":
                differences,

            "stem":
                stem,

            "alternatives":
                alternatives,

            "official_answer":
                source.get(
                    "official_answer"
                ),

            "pass1": {
                field:
                    p1.get(field)
                for field in FIELDS
            },

            "pass2": {
                field:
                    p2.get(field)
                for field in FIELDS
            },

            "pass1_topic":
                p1.get("topic"),

            "pass2_topic":
                p2.get("topic"),

            "pass1_subtopic":
                p1.get("subtopic"),

            "pass2_subtopic":
                p2.get("subtopic"),

            "pass1_confidence":
                p1.get(
                    "classification_confidence"
                ),

            "pass2_confidence":
                p2.get(
                    "classification_confidence"
                ),
        }

        report.append(record)

        print()
        print("-" * 100)

        print(
            f"Q{number:03d} "
            f"→ {item['status']}"
        )

        print(
            "Divergências:",
            ", ".join(
                differences
            )
        )

        print()

        for field in FIELDS:
            value1 = p1.get(field)
            value2 = p2.get(field)

            marker = (
                "="
                if value1 == value2
                else "≠"
            )

            print(
                f"{field:<25}"
                f"P1: {value1}"
            )

            print(
                f"{'':<25}"
                f"{marker}  P2: {value2}"
            )

        print()

        print(
            "Tema P1:",
            p1.get("topic")
        )

        print(
            "Tema P2:",
            p2.get("topic")
        )

        print()

        print(
            "Confiança:",
            f"P1={p1.get('classification_confidence')}",
            f"P2={p2.get('classification_confidence')}",
        )

        print()

        compact_stem = " ".join(
            stem.split()
        )

        if len(compact_stem) > 500:
            compact_stem = (
                compact_stem[:500]
                + "..."
            )

        print(
            "Enunciado:",
            compact_stem
        )

        print()

        print(
            "Alternativas:"
        )

        if isinstance(
            alternatives,
            dict
        ):
            for letter in [
                "A",
                "B",
                "C",
                "D",
            ]:
                print(
                    f"  {letter}) "
                    f"{alternatives.get(letter, '')}"
                )

        print(
            "Gabarito:",
            source.get(
                "official_answer"
            )
        )

    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(
        json.dumps(
            {
                "exam_id":
                    exam.exam_id,

                "questions":
                    report,
            },
            ensure_ascii=False,
            indent=2,
        ),
        encoding="utf-8",
    )

    print()
    print("=" * 100)
    print("RESUMO DAS DIVERGÊNCIAS")
    print("=" * 100)

    print()
    print("POR CAMPO")

    for field in FIELDS:
        print(
            f"{field:<28}"
            f"{field_counter[field]}"
        )

    print()
    print("POR COMBINAÇÃO")

    for signature, count in (
        signature_counter.most_common()
    ):
        print(
            f"{count:>3} × "
            + " + ".join(signature)
        )

    print()
    print(
        "Relatório:",
        output_path
    )


if __name__ == "__main__":
    main()
