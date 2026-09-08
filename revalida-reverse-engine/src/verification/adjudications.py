"""Registro seguro de decisões manuais para divergências entre passes."""

import json
from pathlib import Path

from src.classification.dna_validator import load_taxonomy


CORE_FIELDS = {
    "primary_area",
    "primary_subarea",
    "primary_competency",
    "cognitive_task",
}


def _allowed_values(taxonomy, field):
    if field == "primary_area":
        return set(taxonomy["primary_areas"])
    if field == "primary_subarea":
        return {
            subarea
            for area in taxonomy["primary_areas"].values()
            for subarea in area["subareas"]
        }
    if field == "primary_competency":
        return set(taxonomy["competencies"])
    if field == "cognitive_task":
        return set(taxonomy["cognitive_tasks"])
    raise RuntimeError(f"Campo não adjudicável: {field}")


def set_adjudication(exam, root: Path, question_number: int, field: str, value: str, dry_run=False):
    if field not in CORE_FIELDS:
        raise RuntimeError(f"Campo não adjudicável: {field}")

    queue_path = exam.adjudication_queue_path(root)
    if not queue_path.is_file():
        raise RuntimeError(f"Fila de adjudicação não encontrada: {queue_path}")
    queue = json.loads(queue_path.read_text(encoding="utf-8"))
    if queue.get("exam_id") != exam.exam_id:
        raise RuntimeError(f"{queue_path}: exam_id incompatível.")
    if queue.get("taxonomy_version") != exam.classification_taxonomy_version:
        raise RuntimeError(f"{queue_path}: taxonomia incompatível.")

    item = next(
        (
            candidate
            for candidate in queue.get("questions", [])
            if candidate.get("question_number") == question_number
        ),
        None,
    )
    if item is None:
        raise RuntimeError(f"Q{question_number:03d}: não está na fila de adjudicação.")
    if field not in item.get("differences", []):
        raise RuntimeError(f"Q{question_number:03d}: {field} não é divergente.")

    taxonomy = load_taxonomy(
        exam.canonical_taxonomy_path(root),
        expected_version=exam.canonical_taxonomy_version,
    )
    if value not in _allowed_values(taxonomy, field):
        raise RuntimeError(f"Valor inválido para {field}: {value}")

    output_path = exam.manual_adjudications_path(root)
    if output_path.exists():
        output = json.loads(output_path.read_text(encoding="utf-8"))
        expected = {
            "exam_id": exam.exam_id,
            "source_taxonomy_version": exam.classification_taxonomy_version,
            "canonical_taxonomy_version": exam.canonical_taxonomy_version,
        }
        for key, expected_value in expected.items():
            if output.get(key) != expected_value:
                raise RuntimeError(f"{output_path}: {key} incompatível.")
    else:
        output = {
            "exam_id": exam.exam_id,
            "source_taxonomy_version": exam.classification_taxonomy_version,
            "canonical_taxonomy_version": exam.canonical_taxonomy_version,
            "method": "HUMAN_RULE_BASED_ADJUDICATION",
            "questions": {},
        }

    questions = output.setdefault("questions", {})
    decisions = questions.setdefault(str(question_number), {})
    decisions[field] = value

    if not dry_run:
        output_path.parent.mkdir(parents=True, exist_ok=True)
        temporary = output_path.with_suffix(output_path.suffix + ".tmp")
        temporary.write_text(
            json.dumps(output, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )
        temporary.replace(output_path)

    return output_path, output
