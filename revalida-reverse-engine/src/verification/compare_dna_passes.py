import argparse
import json
import re
import unicodedata
from pathlib import Path

from rapidfuzz import fuzz

from src.config.exams import DEFAULT_EXAM_ID, PROJECT_ROOT, get_exam_config


MAIN_FIELDS = [
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
]


def normalize(text):
    if not text:
        return ""

    text = unicodedata.normalize(
        "NFKD",
        str(text),
    )

    text = "".join(
        c
        for c in text
        if not unicodedata.combining(c)
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


def similarity(a, b):
    return round(
        fuzz.token_set_ratio(
            normalize(a),
            normalize(b),
        ),
        1,
    )


def load(path, exam, pass_number):
    data = json.loads(
        path.read_text(
            encoding="utf-8"
        )
    )

    if data.get("exam_id") != exam.exam_id:
        raise RuntimeError(f"{path}: exam_id incompatível.")
    if data.get("source_dataset_version") != exam.dataset_version:
        raise RuntimeError(f"{path}: versão do dataset incompatível.")
    if data.get("taxonomy_version") != exam.classification_taxonomy_version:
        raise RuntimeError(f"{path}: versão da taxonomia incompatível.")

    declared_pass = data.get("classification_pass")
    if declared_pass is not None and declared_pass != pass_number:
        raise RuntimeError(
            f"{path}: classification_pass deveria ser {pass_number}."
        )

    records = {
        q["question_number"]: q["dna"]
        for q in data["questions"]
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

    pass1_path = exam.pilot_output_path(PROJECT_ROOT, 1)
    pass2_path = exam.pilot_output_path(PROJECT_ROOT, 2)
    output_path = exam.pilot_agreement_path(PROJECT_ROOT)

    if not pass1_path.exists():
        raise RuntimeError(
            f"Passe 1 ausente: {pass1_path}"
        )

    if not pass2_path.exists():
        raise RuntimeError(
            f"Passe 2 ausente: {pass2_path}"
        )

    metadata1, p1 = load(pass1_path, exam, 1)
    metadata2, p2 = load(pass2_path, exam, 2)

    if set(p1) != set(p2):
        raise RuntimeError("Os pilotos não contêm o mesmo conjunto de questões.")
    if metadata1.get("taxonomy_version") != metadata2.get("taxonomy_version"):
        raise RuntimeError(
            "Os pilotos usam versões diferentes da taxonomia: "
            f"{metadata1.get('taxonomy_version')} e "
            f"{metadata2.get('taxonomy_version')}."
        )

    report = []

    print()
    print("=" * 78)
    print("CONCORDÂNCIA QUESTION DNA — PASSE 1 × PASSE 2")
    print("=" * 78)

    for number in sorted(p1):
        a = p1[number]
        b = p2[number]

        comparisons = {}
        agreement_count = 0

        for field in MAIN_FIELDS:
            equal = (
                a.get(field)
                == b.get(field)
            )

            comparisons[field] = {
                "pass1": a.get(field),
                "pass2": b.get(field),
                "agreement": equal,
            }

            if equal:
                agreement_count += 1

        controlled_score = round(
            agreement_count
            / len(MAIN_FIELDS),
            2,
        )

        topic_score = similarity(
            a.get("topic"),
            b.get("topic"),
        )

        subtopic_score = similarity(
            a.get("subtopic"),
            b.get("subtopic"),
        )

        context = {}

        for field in CONTEXT_FIELDS:
            context[field] = {
                "pass1": a.get(field),
                "pass2": b.get(field),
                "agreement":
                    a.get(field)
                    == b.get(field),
            }

        if controlled_score == 1.0:
            status = "CONTROLLED_HIGH_AGREEMENT"

        elif controlled_score >= 0.75:
            status = "ADJUDICATION_REQUIRED"

        else:
            status = "REVIEW_REQUIRED"

        item = {
            "question_number": number,
            "controlled_agreement":
                controlled_score,
            "topic_lexical_similarity":
                topic_score,
            "subtopic_lexical_similarity":
                subtopic_score,
            "status":
                status,
            "main_fields":
                comparisons,
            "context_fields":
                context,
            "pass1_confidence":
                a.get(
                    "classification_confidence"
                ),
            "pass2_confidence":
                b.get(
                    "classification_confidence"
                ),
            "pass1_review":
                a.get(
                    "review_required"
                ),
            "pass2_review":
                b.get(
                    "review_required"
                ),
        }

        report.append(item)

        print()
        print(f"Q{number:03d}")

        print(
            f"  Área/Subárea/Competência/Tarefa: "
            f"{agreement_count}/4"
        )

        print(
            f"  Concordância controlada: "
            f"{controlled_score:.0%}"
        )

        print(
            f"  Similaridade do tema: "
            f"{topic_score:.1f}%"
        )

        print(
            f"  Similaridade do subtema: "
            f"{subtopic_score:.1f}%"
        )

        print(
            f"  Status: {status}"
        )

        for field in MAIN_FIELDS:
            result = comparisons[field]

            if not result["agreement"]:
                print(
                    f"    DIFERENÇA {field}:"
                )
                print(
                    f"      P1: {result['pass1']}"
                )
                print(
                    f"      P2: {result['pass2']}"
                )

    high = sum(
        1
        for item in report
        if item["status"] == "CONTROLLED_HIGH_AGREEMENT"
    )

    review = len(report) - high

    output = {
        "exam_id": exam.exam_id,
        "source_dataset_version": exam.dataset_version,
        "taxonomy_version": metadata1["taxonomy_version"],
        "questions": report,
        "summary": {
            "questions": len(report),
            "high_agreement": high,
            "review": review,
        },
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
        f"Alta concordância: "
        f"{high}/{len(report)}"
    )

    print(
        f"Precisam revisão: "
        f"{review}/{len(report)}"
    )

    print()
    print(
        f"Relatório: {output_path}"
    )


if __name__ == "__main__":
    main()
