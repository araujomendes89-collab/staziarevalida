import argparse
import json
from collections import Counter
from pathlib import Path

from src.config.exams import DEFAULT_EXAM_ID, PROJECT_ROOT, get_exam_config
from src.classification.dna_validator import load_taxonomy


CORE_FIELDS = [
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

    canonical_path = exam.canonical_output_path(PROJECT_ROOT)
    taxonomy_path = exam.canonical_taxonomy_path(PROJECT_ROOT)

    for label, path in (
        ("DNA canônico", canonical_path),
        ("Taxonomia", taxonomy_path),
    ):
        if not path.is_file():
            parser.error(f"{label} não encontrado: {path}")

    canonical = json.loads(
        canonical_path.read_text(
            encoding="utf-8"
        )
    )

    taxonomy = load_taxonomy(
        taxonomy_path,
        expected_version=exam.canonical_taxonomy_version,
    )

    if canonical.get("exam_id") != exam.exam_id:
        parser.error(f"{canonical_path}: exam_id incompatível.")
    if canonical.get("source_dataset_version") != exam.dataset_version:
        parser.error(f"{canonical_path}: versão do dataset incompatível.")
    if canonical.get("canonical_taxonomy_version") != exam.canonical_taxonomy_version:
        parser.error(f"{canonical_path}: taxonomia canônica incompatível.")

    questions = canonical[
        "questions"
    ]

    errors = []

    numbers = [
        q["question_number"]
        for q in questions
    ]

    expected = list(exam.classifiable_question_numbers)

    if sorted(numbers) != expected:
        errors.append(
            "Question numbers não são exatamente "
            "ao conjunto de questões classificáveis."
        )

    if len(numbers) != len(set(numbers)):
        errors.append(
            "Existem question_number duplicados."
        )

    area_counter = Counter()
    subarea_counter = Counter()
    competency_counter = Counter()
    task_counter = Counter()
    resolution_counter = Counter()
    provenance_counter = Counter()

    new_value_questions = []

    for q in questions:
        number = q[
            "question_number"
        ]

        dna = q[
            "controlled_dna"
        ]

        provenance = q[
            "controlled_provenance"
        ]

        for field in CORE_FIELDS:
            if field not in dna:
                errors.append(
                    f"Q{number:03d}: "
                    f"campo ausente: {field}"
                )

            if dna.get(field) in (
                None,
                "",
            ):
                errors.append(
                    f"Q{number:03d}: "
                    f"campo vazio: {field}"
                )

        area = dna.get(
            "primary_area"
        )

        subarea = dna.get(
            "primary_subarea"
        )

        competency = dna.get(
            "primary_competency"
        )

        task = dna.get(
            "cognitive_task"
        )

        areas = taxonomy[
            "primary_areas"
        ]

        if area not in areas:
            errors.append(
                f"Q{number:03d}: "
                f"área inválida: {area}"
            )

        else:
            allowed_subareas = areas[
                area
            ][
                "subareas"
            ]

            if (
                subarea
                not in allowed_subareas
            ):
                errors.append(
                    f"Q{number:03d}: "
                    f"subárea {subarea} "
                    f"não pertence a {area}"
                )

        area_counter[
            area
        ] += 1

        subarea_counter[
            subarea
        ] += 1

        competency_counter[
            competency
        ] += 1

        task_counter[
            task
        ] += 1

        resolution_counter[
            q.get(
                "resolution_method"
            )
        ] += 1

        for field, info in (
            provenance.items()
        ):
            method = info.get(
                "method"
            )

            if method == (
                "PASS_AGREEMENT"
            ):
                provenance_counter[
                    "PASS_AGREEMENT"
                ] += 1

                if (
                    info.get("pass1")
                    != info.get("pass2")
                ):
                    errors.append(
                        f"Q{number:03d}: "
                        f"{field} marcado "
                        "PASS_AGREEMENT "
                        "mas P1 != P2."
                    )

            elif method in {
                "HUMAN_RULE_BASED_ADJUDICATION",
                "LOCAL_RULE_BASED_ADJUDICATION",
            }:
                source = info.get(
                    "source"
                )

                provenance_counter[
                    source
                ] += 1

                canonical_value = (
                    dna.get(field)
                )

                if (
                    canonical_value
                    != info.get(
                        "canonical"
                    )
                ):
                    errors.append(
                        f"Q{number:03d}: "
                        f"{field} canonical "
                        "diverge da proveniência."
                    )

                if source == (
                    "ADJUDICATION_PASS1"
                ):
                    if (
                        canonical_value
                        != info.get(
                            "pass1"
                        )
                    ):
                        errors.append(
                            f"Q{number:03d}: "
                            f"{field} deveria "
                            "vir do Passe 1."
                        )

                elif source == (
                    "ADJUDICATION_PASS2"
                ):
                    if (
                        canonical_value
                        != info.get(
                            "pass2"
                        )
                    ):
                        errors.append(
                            f"Q{number:03d}: "
                            f"{field} deveria "
                            "vir do Passe 2."
                        )

                elif source == (
                    "ADJUDICATION_NEW_VALUE"
                ):
                    new_value_questions.append(
                        (
                            number,
                            field,
                            canonical_value,
                        )
                    )

                    if canonical_value in {
                        info.get("pass1"),
                        info.get("pass2"),
                    }:
                        errors.append(
                            f"Q{number:03d}: "
                            f"{field} marcado "
                            "NEW_VALUE, mas "
                            "é igual a um passe."
                        )

                else:
                    errors.append(
                        f"Q{number:03d}: "
                        f"source inválido: "
                        f"{source}"
                    )

            else:
                errors.append(
                    f"Q{number:03d}: "
                    f"proveniência inválida "
                    f"em {field}: {method}"
                )

    summary = canonical[
        "summary"
    ]

    if (
        summary.get(
            "total_questions"
        )
        != len(exam.classifiable_question_numbers)
    ):
        errors.append(
            "summary.total_questions != "
            f"{len(exam.classifiable_question_numbers)}"
        )

    if exam.expected_canonical_counts is not None:
        expected_automatic, expected_adjudicated, expected_fields = (
            exam.expected_canonical_counts
        )
        checks = (
            ("summary.automatic_questions", summary.get("automatic_questions"), expected_automatic),
            ("summary.adjudicated_questions", summary.get("adjudicated_questions"), expected_adjudicated),
            ("summary.adjudicated_fields", summary.get("adjudicated_fields"), expected_fields),
            ("Quantidade PASS_AGREEMENT", resolution_counter["PASS_AGREEMENT"], expected_automatic),
            ("Quantidade ADJUDICATED", resolution_counter["ADJUDICATED"], expected_adjudicated),
        )
        for label, actual, expected_value in checks:
            if actual != expected_value:
                errors.append(f"{label}: {actual}; esperado {expected_value}.")

    adjudicated_total = (
        provenance_counter[
            "ADJUDICATION_PASS1"
        ]
        + provenance_counter[
            "ADJUDICATION_PASS2"
        ]
        + provenance_counter[
            "ADJUDICATION_NEW_VALUE"
        ]
    )

    expected_fields = (
        exam.expected_canonical_counts[2]
        if exam.expected_canonical_counts is not None
        else summary.get("adjudicated_fields")
    )
    if adjudicated_total != expected_fields:
        errors.append(
            "Total de campos adjudicados "
            f"é {adjudicated_total}, "
            f"esperado {expected_fields}."
        )

    print()
    print("=" * 78)
    print(
        "AUDITORIA — CANONICAL QUESTION DNA"
    )
    print("=" * 78)

    print(
        "Questões:",
        len(questions)
    )

    print(
        "Erros:",
        len(errors)
    )

    print()

    print(
        "PASS_AGREEMENT:",
        resolution_counter[
            "PASS_AGREEMENT"
        ]
    )

    print(
        "ADJUDICATED:",
        resolution_counter[
            "ADJUDICATED"
        ]
    )

    print()

    print(
        "Campos por concordância:",
        provenance_counter[
            "PASS_AGREEMENT"
        ]
    )

    print(
        "ADJUDICATION_PASS1:",
        provenance_counter[
            "ADJUDICATION_PASS1"
        ]
    )

    print(
        "ADJUDICATION_PASS2:",
        provenance_counter[
            "ADJUDICATION_PASS2"
        ]
    )

    print(
        "ADJUDICATION_NEW_VALUE:",
        provenance_counter[
            "ADJUDICATION_NEW_VALUE"
        ]
    )

    print()
    print("NOVOS VALORES TAXONÔMICOS")

    if new_value_questions:
        for (
            number,
            field,
            value,
        ) in new_value_questions:
            print(
                f"Q{number:03d} "
                f"{field}: {value}"
            )
    else:
        print("Nenhum.")

    print()
    print("DISTRIBUIÇÃO POR ÁREA")

    for area, count in (
        area_counter.most_common()
    ):
        print(
            f"{count:>3}  {area}"
        )

    print()
    print("TOP 15 SUBÁREAS")

    for subarea, count in (
        subarea_counter.most_common(
            15
        )
    ):
        print(
            f"{count:>3}  {subarea}"
        )

    print()
    print("ERROS")

    if errors:
        for error in errors:
            print(
                "-",
                error
            )

        print()
        print(
            "STATUS: "
            "CANONICAL_DNA_INVALID"
        )

        raise SystemExit(1)

    print("Nenhum.")

    print()
    print(
        "STATUS: "
        "CANONICAL_DNA_VERIFIED"
    )


if __name__ == "__main__":
    main()
