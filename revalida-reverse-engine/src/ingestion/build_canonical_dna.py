import argparse
import json
from collections import Counter
from pathlib import Path

from src.config.exams import DEFAULT_EXAM_ID, PROJECT_ROOT, get_exam_config
from src.classification.dna_validator import load_taxonomy


ROOT = PROJECT_ROOT


CORE_FIELDS = [
    "primary_area",
    "primary_subarea",
    "primary_competency",
    "cognitive_task",
]


CONTEXT_FIELDS = [
    "care_setting",
    "patient_group",
    "urgency_level",
    "question_format",
    "protocol_or_guideline_dependency",
    "difficulty_estimate",
]


LIST_FIELDS = [
    "secondary_competencies",
    "reasoning_types",
    "distractor_patterns",
]


def load_json(path):
    return json.loads(
        path.read_text(
            encoding="utf-8"
        )
    )


def load_pass(path, exam, pass_number):
    data = load_json(path)

    if data.get("exam_id") != exam.exam_id:
        raise RuntimeError(f"{path}: exam_id incompatível.")
    if data.get("source_dataset_version") != exam.dataset_version:
        raise RuntimeError(f"{path}: versão do dataset incompatível.")
    if data.get("classification_pass") != pass_number:
        raise RuntimeError(
            f"{path}: classification_pass deveria ser {pass_number}."
        )
    if data.get("taxonomy_version") != exam.classification_taxonomy_version:
        raise RuntimeError(f"{path}: versão da taxonomia incompatível.")

    records = {
        int(item["question_number"]): item
        for item in data["questions"]
    }
    if len(records) != len(data["questions"]):
        raise RuntimeError(f"{path}: números de questão duplicados.")
    return data, records


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
    adjudication_path = exam.manual_adjudications_path(ROOT)
    taxonomy_path = exam.canonical_taxonomy_path(ROOT)
    output_path = exam.canonical_output_path(ROOT)

    for path in [
        pass1_path,
        pass2_path,
        adjudication_path,
        taxonomy_path,
    ]:
        if not path.exists():
            raise RuntimeError(
                f"Arquivo não encontrado: {path}"
            )

    metadata1, pass1 = load_pass(pass1_path, exam, 1)

    metadata2, pass2 = load_pass(pass2_path, exam, 2)

    if metadata1.get("taxonomy_version") != metadata2.get("taxonomy_version"):
        raise RuntimeError("Os passes usam versões diferentes da taxonomia.")

    adjudication_data = load_json(
        adjudication_path
    )

    if adjudication_data.get("exam_id") != exam.exam_id:
        raise RuntimeError(
            f"{adjudication_path}: exam_id incompatível."
        )
    if (
        adjudication_data.get("source_taxonomy_version")
        != metadata1.get("taxonomy_version")
    ):
        raise RuntimeError(
            f"{adjudication_path}: taxonomia de origem incompatível."
        )
    if (
        adjudication_data.get("canonical_taxonomy_version")
        != exam.canonical_taxonomy_version
    ):
        raise RuntimeError(
            f"{adjudication_path}: taxonomia canônica incompatível."
        )
    adjudication_method = adjudication_data.get("method")
    if adjudication_method not in {
        "HUMAN_RULE_BASED_ADJUDICATION",
        "LOCAL_RULE_BASED_ADJUDICATION",
    }:
        raise RuntimeError(f"{adjudication_path}: método de adjudicação inválido.")

    adjudications = {
        int(number): values
        for number, values
        in adjudication_data[
            "questions"
        ].items()
    }

    taxonomy = load_taxonomy(
        taxonomy_path,
        expected_version=exam.canonical_taxonomy_version,
    )

    expected_questions = set(exam.classifiable_question_numbers)

    if set(pass1) != expected_questions:
        raise RuntimeError(
            "Passe 1 não contém exatamente as questões classificáveis configuradas."
        )

    if set(pass2) != expected_questions:
        raise RuntimeError(
            "Passe 2 não contém exatamente as questões classificáveis configuradas."
        )

    canonical_questions = []

    automatic_questions = 0
    adjudicated_questions = 0
    adjudicated_fields = 0

    provenance_counter = Counter()

    used_adjudications = set()

    for number in exam.classifiable_question_numbers:
        p1 = pass1[number]["dna"]
        p2 = pass2[number]["dna"]

        canonical_core = {}
        provenance = {}

        differing_fields = []

        for field in CORE_FIELDS:
            value1 = p1.get(field)
            value2 = p2.get(field)

            if value1 == value2:
                canonical_core[field] = value1

                provenance[field] = {
                    "method": "PASS_AGREEMENT",
                    "pass1": value1,
                    "pass2": value2,
                }

                provenance_counter[
                    "PASS_AGREEMENT"
                ] += 1

            else:
                differing_fields.append(
                    field
                )

                if number not in adjudications:
                    raise RuntimeError(
                        f"Q{number:03d}: "
                        f"divergência em {field} "
                        "sem adjudicação."
                    )

                decision = adjudications[
                    number
                ]

                if field not in decision:
                    raise RuntimeError(
                        f"Q{number:03d}: "
                        f"campo {field} divergente "
                        "sem decisão."
                    )

                canonical_value = decision[
                    field
                ]

                canonical_core[field] = (
                    canonical_value
                )

                if canonical_value == value1:
                    source = (
                        "ADJUDICATION_PASS1"
                    )

                elif canonical_value == value2:
                    source = (
                        "ADJUDICATION_PASS2"
                    )

                else:
                    source = (
                        "ADJUDICATION_NEW_VALUE"
                    )

                provenance[field] = {
                    "method":
                        adjudication_method,

                    "source":
                        source,

                    "pass1":
                        value1,

                    "pass2":
                        value2,

                    "canonical":
                        canonical_value,
                }

                provenance_counter[
                    source
                ] += 1

                adjudicated_fields += 1

                used_adjudications.add(
                    (number, field)
                )

        # -----------------------------------
        # Validação área ↔ subárea
        # -----------------------------------

        area = canonical_core[
            "primary_area"
        ]

        subarea = canonical_core[
            "primary_subarea"
        ]

        areas = taxonomy[
            "primary_areas"
        ]

        if area not in areas:
            raise RuntimeError(
                f"Q{number:03d}: "
                f"área inválida: {area}"
            )

        allowed_subareas = areas[
            area
        ][
            "subareas"
        ]

        if subarea not in allowed_subareas:
            raise RuntimeError(
                f"Q{number:03d}: "
                f"{subarea} não pertence "
                f"a {area} na taxonomia 2.1."
            )

        if differing_fields:
            adjudicated_questions += 1
            resolution_method = (
                "ADJUDICATED"
            )
        else:
            automatic_questions += 1
            resolution_method = (
                "PASS_AGREEMENT"
            )

        context = {}

        for field in CONTEXT_FIELDS:
            value1 = p1.get(field)
            value2 = p2.get(field)

            context[field] = {
                "pass1": value1,
                "pass2": value2,
                "agreement":
                    value1 == value2,
            }

        list_fields = {}

        for field in LIST_FIELDS:
            value1 = p1.get(
                field,
                []
            )

            value2 = p2.get(
                field,
                []
            )

            list_fields[field] = {
                "pass1": value1,
                "pass2": value2,
                "agreement_as_set":
                    set(value1 or [])
                    == set(value2 or []),
            }

        canonical_questions.append(
            {
                "question_number":
                    number,

                "resolution_method":
                    resolution_method,

                "controlled_dna":
                    canonical_core,

                "controlled_provenance":
                    provenance,

                "original_differences":
                    differing_fields,

                "topic_raw": {
                    "pass1":
                        p1.get("topic"),

                    "pass2":
                        p2.get("topic"),
                },

                "subtopic_raw": {
                    "pass1":
                        p1.get("subtopic"),

                    "pass2":
                        p2.get("subtopic"),
                },

                "context_comparison":
                    context,

                "list_comparison":
                    list_fields,

                "classification_confidence": {
                    "pass1":
                        p1.get(
                            "classification_confidence"
                        ),

                    "pass2":
                        p2.get(
                            "classification_confidence"
                        ),
                },

                "source_dna": {
                    "pass1": p1,
                    "pass2": p2,
                },
            }
        )

    # -----------------------------------
    # Garantir que nenhuma decisão manual
    # ficou sem uso.
    # -----------------------------------

    provided = set()

    for number, decisions in (
        adjudications.items()
    ):
        for field in decisions:
            provided.add(
                (number, field)
            )

    unused = (
        provided
        - used_adjudications
    )

    if unused:
        raise RuntimeError(
            "Adjudicações não utilizadas: "
            + repr(
                sorted(unused)
            )
        )

    if exam.expected_canonical_counts is not None:
        expected_counts = exam.expected_canonical_counts
        actual_counts = (
            automatic_questions,
            adjudicated_questions,
            adjudicated_fields,
        )
        if actual_counts != expected_counts:
            raise RuntimeError(
                "Contagens canônicas divergentes do congelamento: "
                f"esperado={expected_counts}, encontrado={actual_counts}."
            )

    output = {
        "exam_id":
            exam.exam_id,

        "canonical_dna_version":
            "1.0.0",

        "source_dataset_version":
            exam.dataset_version,

        "source_taxonomy_version":
            metadata1["taxonomy_version"],

        "canonical_taxonomy_version":
            exam.canonical_taxonomy_version,

        "methodology": {
            "passes": 2,

            "automatic_rule":
                "4 controlled fields identical "
                "between independent passes",

            "adjudication_rule":
                adjudication_method,

            "topic_status":
                "RAW_NOT_CANONICALIZED",

            "subtopic_status":
                "RAW_NOT_CANONICALIZED",
        },

        "summary": {
            "total_questions":
                len(exam.classifiable_question_numbers),

            "automatic_questions":
                automatic_questions,

            "adjudicated_questions":
                adjudicated_questions,

            "adjudicated_fields":
                adjudicated_fields,

            "provenance_counts":
                dict(
                    provenance_counter
                ),
        },

        "questions":
            canonical_questions,
    }

    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(
        json.dumps(
            output,
            ensure_ascii=False,
            indent=2,
        ),
        encoding="utf-8",
    )

    print()
    print("=" * 78)
    print(
        "QUESTION DNA — CANONICAL BUILD"
    )
    print("=" * 78)

    print(
        "Questões:",
        len(canonical_questions)
    )

    print(
        "Aceitas por concordância:",
        automatic_questions
    )

    print(
        "Questões adjudicadas:",
        adjudicated_questions
    )

    print(
        "Campos adjudicados:",
        adjudicated_fields
    )

    print()

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

    print(
        "Arquivo:",
        output_path
    )

    print()
    print(
        "STATUS: CANONICAL_DNA_READY"
    )


if __name__ == "__main__":
    main()
