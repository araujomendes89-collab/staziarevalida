"""Adjudicação local, determinística e auditável entre dois passes."""

import argparse
import json
from pathlib import Path

from src.classification.dna_validator import load_taxonomy
from src.config.exams import DEFAULT_EXAM_ID, PROJECT_ROOT, get_exam_config
from src.verification.adjudications import CORE_FIELDS, _allowed_values


ROOT = PROJECT_ROOT


def _atomic_json(path: Path, data) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(path.suffix + ".tmp")
    temporary.write_text(
        json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    temporary.replace(path)


def _choose_pass(item: dict) -> tuple[str, str]:
    pass1 = item["pass1"]
    pass2 = item["pass2"]
    review1 = bool(pass1.get("review_required"))
    review2 = bool(pass2.get("review_required"))
    if review1 != review2:
        selected = "pass2" if review1 else "pass1"
        return selected, "passe sem sinalização de revisão"

    confidence1 = float(pass1.get("classification_confidence", 0))
    confidence2 = float(pass2.get("classification_confidence", 0))
    if confidence1 != confidence2:
        selected = "pass1" if confidence1 > confidence2 else "pass2"
        return selected, "maior confiança validada"

    return "pass1", "empate resolvido de forma determinística pelo primeiro passe"


def auto_adjudicate(exam, root: Path = ROOT, overwrite: bool = False):
    queue_path = exam.adjudication_queue_path(root)
    if not queue_path.is_file():
        raise RuntimeError(f"Fila de adjudicação não encontrada: {queue_path}")
    queue = json.loads(queue_path.read_text(encoding="utf-8"))
    expected_metadata = {
        "exam_id": exam.exam_id,
        "source_dataset_version": exam.dataset_version,
        "taxonomy_version": exam.classification_taxonomy_version,
    }
    for field, expected in expected_metadata.items():
        if queue.get(field) != expected:
            raise RuntimeError(f"{queue_path}: {field} incompatível.")

    taxonomy = load_taxonomy(
        exam.canonical_taxonomy_path(root),
        expected_version=exam.canonical_taxonomy_version,
    )
    output_path = exam.manual_adjudications_path(root)
    if output_path.exists() and not overwrite:
        output = json.loads(output_path.read_text(encoding="utf-8"))
    else:
        output = {
            "exam_id": exam.exam_id,
            "source_taxonomy_version": exam.classification_taxonomy_version,
            "canonical_taxonomy_version": exam.canonical_taxonomy_version,
            "method": "LOCAL_RULE_BASED_ADJUDICATION",
            "questions": {},
        }

    audit = []
    for item in queue.get("questions", []):
        number = item["question_number"]
        saved = output.setdefault("questions", {}).setdefault(str(number), {})
        missing = [field for field in item["differences"] if field not in saved]
        if not missing:
            continue
        selected, reason = _choose_pass(item)
        selected_dna = item[selected]
        for field in missing:
            value = selected_dna[field]
            if value not in _allowed_values(taxonomy, field):
                raise RuntimeError(f"Q{number:03d}: valor inválido para {field}.")
            saved[field] = value

        area = saved.get("primary_area", selected_dna["primary_area"])
        subarea = saved.get("primary_subarea", selected_dna["primary_subarea"])
        if subarea not in taxonomy["primary_areas"][area]["subareas"]:
            raise RuntimeError(f"Q{number:03d}: área e subárea incompatíveis.")
        audit.append(
            {
                "question_number": number,
                "selected_pass": selected,
                "reason": reason,
                "decisions": {field: saved[field] for field in missing},
                "requires_optional_human_review": item["status"] == "REVIEW_REQUIRED",
            }
        )

    _atomic_json(output_path, output)
    audit_path = output_path.with_name(f"{exam.exam_id}_auto_adjudication_audit.json")
    _atomic_json(
        audit_path,
        {
            "exam_id": exam.exam_id,
            "method": "LOCAL_RULE_BASED_ADJUDICATION",
            "new_decisions": len(audit),
            "questions": audit,
        },
    )
    return output_path, audit_path, audit


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--exam-id", default=DEFAULT_EXAM_ID)
    parser.add_argument("--overwrite", action="store_true")
    args = parser.parse_args()
    try:
        exam = get_exam_config(args.exam_id)
        output, audit_path, decisions = auto_adjudicate(
            exam, ROOT, overwrite=args.overwrite
        )
    except (ValueError, RuntimeError) as exc:
        parser.error(str(exc))
    print(f"Edição: {exam.exam_id}")
    print(f"Novas adjudicações locais: {len(decisions)}")
    print(f"Decisões: {output}")
    print(f"Auditoria: {audit_path}")


if __name__ == "__main__":
    main()
