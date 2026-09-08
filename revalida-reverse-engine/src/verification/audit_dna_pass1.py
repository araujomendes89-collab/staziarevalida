import argparse
from collections import Counter

from src.classification.classify_dna_all import load_existing
from pydantic import ValidationError

from src.classification.dna_validator import load_taxonomy, validate_question_dna
from src.config.exams import (
    DEFAULT_EXAM_ID,
    PROJECT_ROOT,
    get_exam_config,
)
from src.models.question_dna import QuestionDNA


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--exam-id", default=DEFAULT_EXAM_ID)
    parser.add_argument("--pass-number", type=int, choices=[1, 2], default=1)
    args = parser.parse_args()
    try:
        exam = get_exam_config(args.exam_id)
    except ValueError as exc:
        parser.error(str(exc))

    taxonomy = load_taxonomy(
        exam.classification_taxonomy_path(PROJECT_ROOT),
        expected_version=exam.classification_taxonomy_version,
    )
    path = exam.production_output_path(PROJECT_ROOT, args.pass_number)
    records = load_existing(
        path,
        exam,
        args.pass_number,
        taxonomy["version"],
    )
    expected = set(exam.classifiable_question_numbers)
    if set(records) != expected:
        parser.error(
            f"{path}: deveria conter exatamente as questões classificáveis."
        )

    questions = [records[number] for number in sorted(records)]

    invalid = []
    for question in questions:
        errors = list(question.get("validation_errors") or [])
        try:
            dna = QuestionDNA.model_validate(question.get("dna"))
            errors.extend(validate_question_dna(dna, taxonomy))
        except ValidationError as exc:
            errors.append(f"QUESTION_DNA_SCHEMA_ERROR:{exc}")

        errors = list(dict.fromkeys(errors))
        if errors:
            audited = dict(question)
            audited["validation_errors"] = errors
            invalid.append(audited)

    reviews = [
        q
        for q in questions
        if q["dna"].get("review_required")
    ]

    confidences = [
        q["dna"].get(
            "classification_confidence",
            0
        )
        for q in questions
    ]

    bins = {
        ">= 0.95": 0,
        "0.90–0.949": 0,
        "0.85–0.899": 0,
        "0.80–0.849": 0,
        "0.70–0.799": 0,
        "< 0.70": 0,
    }

    for value in confidences:
        if value >= 0.95:
            bins[">= 0.95"] += 1
        elif value >= 0.90:
            bins["0.90–0.949"] += 1
        elif value >= 0.85:
            bins["0.85–0.899"] += 1
        elif value >= 0.80:
            bins["0.80–0.849"] += 1
        elif value >= 0.70:
            bins["0.70–0.799"] += 1
        else:
            bins["< 0.70"] += 1

    review_reasons = Counter(
        (
            q["dna"].get("review_reason")
            or "SEM_MOTIVO_EXPLÍCITO"
        )
        for q in reviews
    )

    area_counts = Counter(
        q["dna"]["primary_area"]
        for q in questions
    )

    subarea_counts = Counter(
        q["dna"]["primary_subarea"]
        for q in questions
    )

    competency_counts = Counter(
        q["dna"]["primary_competency"]
        for q in questions
    )

    task_counts = Counter(
        q["dna"]["cognitive_task"]
        for q in questions
    )

    print()
    print("=" * 78)
    print(f"AUDITORIA QUESTION DNA — PASSE {args.pass_number}")
    print("=" * 78)

    print(
        f"Questões: {len(questions)}"
    )

    print(
        f"Erros estruturais: {len(invalid)}"
    )

    print(
        f"Review required: {len(reviews)}"
    )

    print()

    print("=" * 78)
    print("ERROS ESTRUTURAIS")
    print("=" * 78)

    if not invalid:
        print("Nenhum.")

    for q in invalid:
        dna = q["dna"]

        print()
        print(
            f"Q{q['question_number']:03d}"
        )

        print(
            "Erros:",
            q["validation_errors"]
        )

        print(
            "Área:",
            dna["primary_area"]
        )

        print(
            "Subárea:",
            dna["primary_subarea"]
        )

        print(
            "Competência:",
            dna["primary_competency"]
        )

        print(
            "Competências secundárias:",
            dna["secondary_competencies"]
        )

        print(
            "Tarefa:",
            dna["cognitive_task"]
        )

    print()
    print("=" * 78)
    print("DISTRIBUIÇÃO DE CONFIANÇA")
    print("=" * 78)

    for label, count in bins.items():
        print(
            f"{label:<12} {count:>3}"
        )

    print()

    print(
        "Média:",
        round(
            sum(confidences)
            / len(confidences),
            3
        )
    )

    print(
        "Mínima:",
        min(confidences)
    )

    print(
        "Máxima:",
        max(confidences)
    )

    print()
    print("=" * 78)
    print("MOTIVOS DE REVIEW")
    print("=" * 78)

    for reason, count in review_reasons.most_common():
        print(
            f"{count:>3} × {reason}"
        )

    print()
    print("=" * 78)
    print("QUESTÕES COM CONFIANÇA < 0.75")
    print("=" * 78)

    low = [
        q
        for q in questions
        if q["dna"][
            "classification_confidence"
        ] < 0.75
    ]

    if not low:
        print("Nenhuma.")

    for q in low:
        dna = q["dna"]

        print(
            f"Q{q['question_number']:03d}"
            f" | {dna['classification_confidence']:.2f}"
            f" | {dna['primary_area']}"
            f" | {dna['primary_subarea']}"
            f" | {dna['topic']}"
        )

    print()
    print("=" * 78)
    print("DISTRIBUIÇÃO POR ÁREA")
    print("=" * 78)

    for key, count in area_counts.most_common():
        print(
            f"{count:>3}  {key}"
        )

    print()
    print("=" * 78)
    print("TOP 15 SUBÁREAS")
    print("=" * 78)

    for key, count in subarea_counts.most_common(15):
        print(
            f"{count:>3}  {key}"
        )

    print()
    print("=" * 78)
    print("COMPETÊNCIAS")
    print("=" * 78)

    for key, count in competency_counts.most_common():
        print(
            f"{count:>3}  {key}"
        )

    print()
    print("=" * 78)
    print("TAREFAS COGNITIVAS")
    print("=" * 78)

    for key, count in task_counts.most_common():
        print(
            f"{count:>3}  {key}"
        )


if __name__ == "__main__":
    main()
