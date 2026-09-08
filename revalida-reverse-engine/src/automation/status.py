"""Validação e reconciliação do estado de edições já processadas."""

import json
from datetime import datetime, timezone
from pathlib import Path

from src.config.exams import ExamConfig, load_exam_master
from src.exports.staziamed import validate_staziamed_package


COMPLETED_STAGES = (
    "intake",
    "classify_pass1",
    "classify_pass2",
    "compare",
    "auto_adjudicate",
    "build_canonical",
    "audit_canonical",
    "staziamed_export",
)


def _read_json(path: Path, label: str) -> dict:
    if not path.is_file():
        raise RuntimeError(f"{label} ausente: {path}")
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        raise RuntimeError(f"{label} contém JSON inválido: {path}") from exc
    if not isinstance(value, dict):
        raise RuntimeError(f"{label} deve conter um objeto JSON: {path}")
    return value


def _validate_exam_artifact(
    path: Path,
    label: str,
    exam: ExamConfig,
    expected_questions: tuple[int, ...] | None = None,
) -> dict:
    value = _read_json(path, label)
    if value.get("exam_id") != exam.exam_id:
        raise RuntimeError(f"{label} pertence a outra edição: {path}")
    if expected_questions is not None:
        questions = value.get("questions")
        if not isinstance(questions, list):
            raise RuntimeError(f"{label} não contém uma lista de questões: {path}")
        numbers = tuple(sorted(int(item["question_number"]) for item in questions))
        if numbers != expected_questions:
            raise RuntimeError(
                f"{label} não cobre exatamente as questões classificáveis de "
                f"{exam.exam_id}."
            )
    return value


def reconcile_pipeline_state(exam: ExamConfig, root: Path) -> tuple[Path, dict]:
    """Confirma os produtos finais e elimina estados antigos de falha."""
    load_exam_master(exam, root)
    expected = tuple(sorted(exam.classifiable_question_numbers))

    for pass_number in (1, 2):
        _validate_exam_artifact(
            exam.production_output_path(root, pass_number),
            f"Classificação do passe {pass_number}",
            exam,
            expected,
        )
    _validate_exam_artifact(exam.agreement_report_path(root), "Concordância", exam)
    _validate_exam_artifact(
        exam.manual_adjudications_path(root), "Adjudicações", exam
    )
    _validate_exam_artifact(
        exam.canonical_output_path(root), "DNA canônico", exam, expected
    )

    output_dir = root / "data/exports/staziamed" / exam.exam_id
    package = validate_staziamed_package(output_dir)
    if package["active_questions"] != len(expected):
        raise RuntimeError(
            f"Pacote StaziaMed de {exam.exam_id} possui quantidade ativa divergente."
        )
    if package["all_questions"] != exam.question_count:
        raise RuntimeError(
            f"Pacote StaziaMed de {exam.exam_id} possui total divergente."
        )

    state_path = root / "data/runs" / f"{exam.exam_id}_pipeline.json"
    previous = {}
    if state_path.is_file():
        try:
            previous = json.loads(state_path.read_text(encoding="utf-8"))
        except (json.JSONDecodeError, OSError):
            previous = {}
    state = previous if isinstance(previous, dict) else {}
    state.update(
        {
            "exam_id": exam.exam_id,
            "status": "PIPELINE_COMPLETED",
            "stages": {stage: "COMPLETED" for stage in COMPLETED_STAGES},
            "staziamed_output": str(output_dir),
            "staziamed_manifest": _read_json(
                output_dir / "manifest.json", "Manifesto StaziaMed"
            ),
            "updated_at_utc": datetime.now(timezone.utc).isoformat(),
        }
    )
    state.pop("error", None)
    state.pop("next_command", None)
    state_path.parent.mkdir(parents=True, exist_ok=True)
    temporary = state_path.with_suffix(state_path.suffix + ".tmp")
    temporary.write_text(
        json.dumps(state, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    temporary.replace(state_path)
    return state_path, state
