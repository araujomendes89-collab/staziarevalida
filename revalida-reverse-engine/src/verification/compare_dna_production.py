import argparse
import json
import re
import unicodedata
from collections import Counter
from pathlib import Path

from rapidfuzz import fuzz

from src.config.exams import DEFAULT_EXAM_ID, PROJECT_ROOT, get_exam_config


ROOT = PROJECT_ROOT


# Núcleo que define a classificação principal da questão.
MAIN_FIELDS = [
    "primary_area",
    "primary_subarea",
    "primary_competency",
    "cognitive_task",
]


# Campos controlados adicionais.
CONTEXT_FIELDS = [
    "care_setting",
    "patient_group",
    "urgency_level",
    "question_format",
    "protocol_or_guideline_dependency",
    "difficulty_estimate",
]


# Listas controladas.
LIST_FIELDS = [
    "secondary_competencies",
    "reasoning_types",
    "distractor_patterns",
]


def load(path, exam, pass_number):
    data = json.loads(
        path.read_text(
            encoding="utf-8"
        )
    )

    if data.get("exam_id") != exam.exam_id:
        raise RuntimeError(
            f"{path}: exam_id incompatível: {data.get('exam_id')!r}."
        )
    if data.get("source_dataset_version") != exam.dataset_version:
        raise RuntimeError(
            f"{path}: versão do dataset incompatível: "
            f"{data.get('source_dataset_version')!r}."
        )
    if data.get("classification_pass") != pass_number:
        raise RuntimeError(
            f"{path}: classification_pass deveria ser {pass_number}."
        )
    if data.get("taxonomy_version") != exam.classification_taxonomy_version:
        raise RuntimeError(f"{path}: versão da taxonomia incompatível.")

    records = {
        record["question_number"]: record
        for record in data["questions"]
    }
    if len(records) != len(data["questions"]):
        raise RuntimeError(f"{path}: números de questão duplicados.")
    return data, records


def normalize_text(value):
    if value is None:
        return ""

    text = str(value)

    text = unicodedata.normalize(
        "NFKD",
        text,
    )

    text = "".join(
        char
        for char in text
        if not unicodedata.combining(char)
    )

    text = text.lower()

    text = re.sub(
        r"[^a-z0-9\s]",
        " ",
        text,
    )

    return " ".join(
        text.split()
    )


def lexical_similarity(a, b):
    return round(
        fuzz.token_set_ratio(
            normalize_text(a),
            normalize_text(b),
        ),
        1,
    )


def set_similarity(a, b):
    left = set(a or [])
    right = set(b or [])

    if not left and not right:
        return 1.0

    union = left | right

    if not union:
        return 1.0

    return round(
        len(left & right)
        / len(union),
        3,
    )


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--exam-id", default=DEFAULT_EXAM_ID)
    args = parser.parse_args()
    try:
        exam = get_exam_config(args.exam_id)
    except ValueError as exc:
        parser.error(str(exc))

    pass1_path = exam.production_output_path(ROOT, 1)
    pass2_path = exam.production_output_path(ROOT, 2)
    report_path = exam.agreement_report_path(ROOT)
    queue_path = exam.adjudication_queue_path(ROOT)

    if not pass1_path.exists():
        raise RuntimeError(
            f"Passe 1 não encontrado: {pass1_path}"
        )

    if not pass2_path.exists():
        raise RuntimeError(
            f"Passe 2 não encontrado: {pass2_path}"
        )

    metadata1, pass1 = load(pass1_path, exam, 1)
    metadata2, pass2 = load(pass2_path, exam, 2)

    if metadata1.get("taxonomy_version") != metadata2.get("taxonomy_version"):
        raise RuntimeError("Os passes usam versões diferentes da taxonomia.")

    expected = set(exam.classifiable_question_numbers)

    if set(pass1) != expected:
        raise RuntimeError(
            "Passe 1 não contém exatamente as questões classificáveis configuradas."
        )

    if set(pass2) != expected:
        raise RuntimeError(
            "Passe 2 não contém exatamente as questões classificáveis configuradas."
        )

    report = []
    adjudication_queue = []

    main_field_agreement = Counter()
    context_field_agreement = Counter()

    status_counts = Counter()

    print()
    print("=" * 78)
    print(
        "CONCORDÂNCIA QUESTION DNA — PRODUÇÃO"
    )
    print("=" * 78)

    for number in exam.classifiable_question_numbers:
        record1 = pass1[number]
        record2 = pass2[number]

        dna1 = record1["dna"]
        dna2 = record2["dna"]

        main_comparison = {}
        main_equal = 0

        for field in MAIN_FIELDS:
            equal = (
                dna1.get(field)
                == dna2.get(field)
            )

            main_comparison[field] = {
                "pass1": dna1.get(field),
                "pass2": dna2.get(field),
                "agreement": equal,
            }

            if equal:
                main_equal += 1
                main_field_agreement[field] += 1

        context_comparison = {}

        for field in CONTEXT_FIELDS:
            equal = (
                dna1.get(field)
                == dna2.get(field)
            )

            context_comparison[field] = {
                "pass1": dna1.get(field),
                "pass2": dna2.get(field),
                "agreement": equal,
            }

            if equal:
                context_field_agreement[field] += 1

        list_comparison = {}

        for field in LIST_FIELDS:
            list_comparison[field] = {
                "pass1": dna1.get(field, []),
                "pass2": dna2.get(field, []),
                "jaccard_similarity":
                    set_similarity(
                        dna1.get(field, []),
                        dna2.get(field, []),
                    ),
            }

        topic_similarity = lexical_similarity(
            dna1.get("topic"),
            dna2.get("topic"),
        )

        subtopic_similarity = lexical_similarity(
            dna1.get("subtopic"),
            dna2.get("subtopic"),
        )

        area_equal = main_comparison[
            "primary_area"
        ]["agreement"]

        subarea_equal = main_comparison[
            "primary_subarea"
        ]["agreement"]

        competency_equal = main_comparison[
            "primary_competency"
        ]["agreement"]

        task_equal = main_comparison[
            "cognitive_task"
        ]["agreement"]

        # -----------------------------------------------
        # Regra de adjudicação
        # -----------------------------------------------

        if (
            area_equal
            and subarea_equal
            and competency_equal
            and task_equal
        ):
            status = (
                "CONTROLLED_HIGH_AGREEMENT"
            )

        elif (
            area_equal
            and subarea_equal
            and (
                competency_equal
                or task_equal
            )
        ):
            status = (
                "ADJUDICATION_REQUIRED"
            )

        else:
            status = (
                "REVIEW_REQUIRED"
            )

        status_counts[status] += 1

        differences = [
            field
            for field in MAIN_FIELDS
            if not main_comparison[
                field
            ]["agreement"]
        ]

        item = {
            "question_number": number,

            "status": status,

            "main_agreement_count":
                main_equal,

            "main_agreement_rate":
                round(
                    main_equal
                    / len(MAIN_FIELDS),
                    3,
                ),

            "main_fields":
                main_comparison,

            "context_fields":
                context_comparison,

            "list_fields":
                list_comparison,

            "topic_similarity":
                topic_similarity,

            "subtopic_similarity":
                subtopic_similarity,

            "pass1_confidence":
                dna1.get(
                    "classification_confidence"
                ),

            "pass2_confidence":
                dna2.get(
                    "classification_confidence"
                ),

            "main_differences":
                differences,
        }

        report.append(item)

        if status != (
            "CONTROLLED_HIGH_AGREEMENT"
        ):
            adjudication_queue.append(
                {
                    "question_number":
                        number,

                    "status":
                        status,

                    "differences":
                        differences,

                    "pass1":
                        dna1,

                    "pass2":
                        dna2,
                }
            )

        if status != (
            "CONTROLLED_HIGH_AGREEMENT"
        ):
            print()
            print(
                f"Q{number:03d} → {status}"
            )

            print(
                f"  Concordância principal: "
                f"{main_equal}/4"
            )

            for field in differences:
                comparison = (
                    main_comparison[field]
                )

                print(
                    f"  DIFERENÇA {field}:"
                )

                print(
                    f"    P1: "
                    f"{comparison['pass1']}"
                )

                print(
                    f"    P2: "
                    f"{comparison['pass2']}"
                )

    output = {
        "exam_id":
            exam.exam_id,

        "taxonomy_version":
            metadata1["taxonomy_version"],

        "source_dataset_version":
            exam.dataset_version,

        "questions":
            report,

        "summary": {
            "total_questions":
                len(exam.classifiable_question_numbers),

            "controlled_high_agreement":
                status_counts[
                    "CONTROLLED_HIGH_AGREEMENT"
                ],

            "adjudication_required":
                status_counts[
                    "ADJUDICATION_REQUIRED"
                ],

            "review_required":
                status_counts[
                    "REVIEW_REQUIRED"
                ],

            "main_field_agreement": {
                field:
                    main_field_agreement[
                        field
                    ]
                for field in MAIN_FIELDS
            },

            "context_field_agreement": {
                field:
                    context_field_agreement[
                        field
                    ]
                for field in CONTEXT_FIELDS
            },
        },
    }

    report_path.parent.mkdir(parents=True, exist_ok=True)
    report_path.write_text(
        json.dumps(
            output,
            ensure_ascii=False,
            indent=2,
        ),
        encoding="utf-8",
    )

    queue_output = {
        "exam_id":
            exam.exam_id,

        "source_dataset_version":
            exam.dataset_version,

        "taxonomy_version":
            metadata1["taxonomy_version"],

        "questions":
            adjudication_queue,
    }

    queue_path.write_text(
        json.dumps(
            queue_output,
            ensure_ascii=False,
            indent=2,
        ),
        encoding="utf-8",
    )

    print()
    print("=" * 78)
    print("RESUMO")
    print("=" * 78)

    print(
        "Concordância total:",
        status_counts[
            "CONTROLLED_HIGH_AGREEMENT"
        ],
        f"/{len(exam.classifiable_question_numbers)}",
    )

    print(
        "Adjudicação:",
        status_counts[
            "ADJUDICATION_REQUIRED"
        ],
        f"/{len(exam.classifiable_question_numbers)}",
    )

    print(
        "Revisão forte:",
        status_counts[
            "REVIEW_REQUIRED"
        ],
        f"/{len(exam.classifiable_question_numbers)}",
    )

    print()
    print("CONCORDÂNCIA POR CAMPO PRINCIPAL")

    for field in MAIN_FIELDS:
        count = (
            main_field_agreement[field]
        )

        print(
            f"{field:<28} "
            f"{count:>3}/{len(exam.classifiable_question_numbers)}"
        )

    print()
    print("CONCORDÂNCIA DE CONTEXTO")

    for field in CONTEXT_FIELDS:
        count = (
            context_field_agreement[
                field
            ]
        )

        print(
            f"{field:<36} "
            f"{count:>3}/{len(exam.classifiable_question_numbers)}"
        )

    print()
    print(
        "Relatório:",
        report_path,
    )

    print(
        "Fila de adjudicação:",
        queue_path,
    )


if __name__ == "__main__":
    main()
