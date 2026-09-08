import argparse

from src.classification.classify_dna_pilot import (
    alternatives_text,
)
from src.config.exams import (
    DEFAULT_EXAM_ID,
    get_exam_config,
    load_exam_master,
)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--exam-id", default=DEFAULT_EXAM_ID)
    args = parser.parse_args()
    try:
        exam = get_exam_config(args.exam_id)
    except ValueError as exc:
        parser.error(str(exc))

    try:
        data = load_exam_master(exam)
    except RuntimeError as exc:
        parser.error(str(exc))

    errors = []

    for question in data["questions"]:
        number = question["question_number"]

        try:
            text = alternatives_text(
                question
            )

            lines = [
                line.strip()
                for line in text.splitlines()
                if line.strip()
            ]

            if len(lines) != 4:
                raise RuntimeError(
                    f"esperadas 4 alternativas, "
                    f"encontradas {len(lines)}"
                )

            for expected, line in zip(
                ["A)", "B)", "C)", "D)"],
                lines,
            ):
                if not line.startswith(expected):
                    raise RuntimeError(
                        f"ordem/formato inválido: {line}"
                    )

            for line in lines:
                if len(
                    line.split(")", 1)[1].strip()
                ) == 0:
                    raise RuntimeError(
                        f"alternativa vazia: {line}"
                    )

        except Exception as exc:
            errors.append(
                {
                    "question_number": number,
                    "error": str(exc),
                }
            )

    print()
    print("=" * 78)
    print("AUDITORIA DAS ALTERNATIVAS PARA IA")
    print("=" * 78)

    total = len(data["questions"])
    valid = total - len(errors)

    print(
        f"Questões analisadas: {total}"
    )

    print(
        f"A/B/C/D completas: {valid}"
    )

    print(
        f"Problemas: {len(errors)}"
    )

    if errors:
        print()
        print("QUESTÕES COM PROBLEMA")
        print("-" * 78)

        for item in errors:
            print(
                f"Q{item['question_number']:03d}: "
                f"{item['error']}"
            )

        print()
        print(
            "STATUS: ALTERNATIVES_AI_HAS_ERRORS"
        )

    else:
        print()
        print(
            "STATUS: ALTERNATIVES_AI_READY"
        )


if __name__ == "__main__":
    main()
