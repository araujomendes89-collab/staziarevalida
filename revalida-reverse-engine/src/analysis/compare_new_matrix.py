"""Compara o DNA da nova matriz entre Revalida e Enamed sem adjudicar."""

import argparse
import json
from collections import Counter
from pathlib import Path

from src.config.exams import PROJECT_ROOT, get_exam_config
from src.models.question_matrix_dna import QuestionMatrixDNA


SCALAR_FIELDS = (
    "diagnostic_stage",
    "management_stage",
    "asks_for",
    "protocol_dependency",
    "sus_dependency",
    "knowledge_depth",
    "decision_complexity",
    "guideline_year",
    "competency_over_knowledge_score",
    "generalist_relevance",
)


def _load_pass(exam, pass_number: int, root: Path) -> dict[int, QuestionMatrixDNA]:
    path = exam.matrix_dna_output_path(root, pass_number)
    if not path.is_file():
        return {}
    data = json.loads(path.read_text(encoding="utf-8"))
    if data.get("exam_id") != exam.exam_id or data.get("analysis_pass") != pass_number:
        raise RuntimeError(f"Metadados incompatíveis: {path}")
    return {
        int(record["question_number"]): QuestionMatrixDNA.model_validate(
            record["matrix_dna"]
        )
        for record in data.get("questions", [])
    }


def summarize_exam(exam, root: Path, allow_partial: bool) -> dict:
    passes = {number: _load_pass(exam, number, root) for number in (1, 2)}
    expected = set(exam.classifiable_question_numbers)
    joint = expected & set(passes[1]) & set(passes[2])
    if not allow_partial and joint != expected:
        missing1 = len(expected - set(passes[1]))
        missing2 = len(expected - set(passes[2]))
        raise RuntimeError(
            f"{exam.exam_id}: análise incompleta; faltam {missing1} no passe 1 "
            f"e {missing2} no passe 2. Use --allow-partial apenas para auditoria."
        )

    agreements = {}
    consensus_distributions = {}
    discrepancies = []
    for field in SCALAR_FIELDS:
        counter = Counter()
        agreement_count = 0
        for number in sorted(joint):
            value1 = getattr(passes[1][number], field)
            value2 = getattr(passes[2][number], field)
            if value1 == value2:
                agreement_count += 1
                counter[str(value1)] += 1
            else:
                discrepancies.append(
                    {
                        "question_number": number,
                        "field": field,
                        "pass1": value1,
                        "pass2": value2,
                    }
                )
        agreements[field] = {
            "count": agreement_count,
            "rate": round(agreement_count / len(joint), 4) if joint else None,
        }
        consensus_distributions[field] = dict(counter)

    return {
        "exam_id": exam.exam_id,
        "exam_family": exam.exam_family,
        "exam_year": exam.exam_year,
        "exam_edition": exam.exam_edition,
        "expected_valid_items": len(expected),
        "pass1_items": len(passes[1]),
        "pass2_items": len(passes[2]),
        "joint_items": len(joint),
        "complete": joint == expected,
        "agreement": agreements,
        "consensus_distributions": consensus_distributions,
        "discrepancies": discrepancies,
    }


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--exam-id",
        action="append",
        dest="exam_ids",
        help="Pode ser repetido; padrão: Revalida 2026.1 e Enamed 2025.",
    )
    parser.add_argument("--allow-partial", action="store_true")
    parser.add_argument(
        "--output",
        type=Path,
        default=PROJECT_ROOT / "data/processed/reports/new_matrix_comparison.json",
    )
    args = parser.parse_args()
    exam_ids = args.exam_ids or ["revalida_2026_1", "enamed_2025"]
    if len(exam_ids) < 2:
        parser.error("Informe ao menos duas edições para comparação.")
    summaries = [
        summarize_exam(get_exam_config(exam_id), PROJECT_ROOT, args.allow_partial)
        for exam_id in exam_ids
    ]
    report = {
        "schema_version": "revalida.new-matrix-comparison.v1",
        "exam_ids": exam_ids,
        "interpretation_warning": (
            "Acordos entre passes são classificações editoriais. Nenhum valor "
            "deste relatório representa dificuldade b ou proficiência TRI."
        ),
        "exams": summaries,
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    temporary = args.output.with_suffix(args.output.suffix + ".tmp")
    temporary.write_text(
        json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    temporary.replace(args.output)
    print(f"Relatório comparativo: {args.output}")


if __name__ == "__main__":
    main()
