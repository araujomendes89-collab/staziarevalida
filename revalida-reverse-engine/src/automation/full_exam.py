"""Orquestra geração, revisão e PDFs de um simulado completo."""

import hashlib
import json
import re
from datetime import datetime, timezone
from pathlib import Path

from src.config.exams import PROJECT_ROOT
from src.exports.exam_pdf import build_exam_pdfs
from src.generation.full_exam import (
    run_full_exam_generation,
    run_structured_reviews,
    validate_full_exam_inputs,
)


def _sha256(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def run_complete_exam(
    updates_dir: Path,
    output_name: str,
    count: int = 100,
    theme: str | None = None,
    level: str | None = None,
    local_model: str = "qwen3:8b",
    local_base_url: str = "http://127.0.0.1:11434",
    generation_backend: str = "local",
    generation_model: str | None = None,
    review_backend: str = "local",
    review_model: str | None = None,
    review_workers: int = 1,
    allow_openai: bool = False,
    root: Path = PROJECT_ROOT,
):
    if not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9_.-]{0,79}", output_name):
        raise RuntimeError(
            "--output-name deve conter somente letras, números, ponto, hífen ou sublinhado."
        )
    if generation_backend not in {"local", "openai"} or review_backend not in {
        "local", "openai"
    }:
        raise RuntimeError("Motor de geração/revisão inválido: use local ou openai.")
    if "openai" in {generation_backend, review_backend} and not allow_openai:
        raise RuntimeError(
            "O uso da Luna exige autorização explícita com --allow-openai."
        )
    generation_model = generation_model or (
        "gpt-5.6-luna" if generation_backend == "openai" else local_model
    )
    review_model = review_model or (
        "gpt-5.6-luna" if review_backend == "openai" else local_model
    )
    output_dir = root / "data/exports/generated/revalida_enamed_2026_2" / output_name
    generated_path, _ = run_full_exam_generation(
        updates_dir=updates_dir,
        output_dir=output_dir,
        count=count,
        theme=theme,
        level=level,
        model=generation_model,
        backend=generation_backend,
        base_url=local_base_url,
        root=root,
    )
    reviewed_path, reviewed = run_structured_reviews(
        generated_path,
        updates_dir,
        model=review_model,
        backend=review_backend,
        base_url=local_base_url,
        root=root,
        workers=review_workers,
    )
    pdfs = build_exam_pdfs(reviewed_path, output_dir)
    manifest = {
        "schema_version": "staziamed.complete-exam-manifest.v1",
        "status": (
            "READY_FOR_HUMAN_APPROVAL"
            if reviewed["summary"]["revision_required"] == 0
            else "REVISION_REQUIRED"
        ),
        "title": reviewed["title"],
        "question_count": len(reviewed["questions"]),
        "theme_filter": theme,
        "level_filter": level,
        "generation_backend": generation_backend,
        "generation_model": generation_model,
        "review_backend": review_backend,
        "review_model": review_model,
        "review_workers": review_workers,
        "tri_scope": "NOVEL_QUESTIONS_ONLY",
        "empirically_calibrated": False,
        "created_at_utc": datetime.now(timezone.utc).isoformat(),
        "review_summary": reviewed["summary"],
        "files": {
            "generated_exam": {"path": str(generated_path), "sha256": _sha256(generated_path)},
            "reviewed_exam": {"path": str(reviewed_path), "sha256": _sha256(reviewed_path)},
            **{
                path.stem: {"path": str(path), "sha256": _sha256(path)}
                for path in pdfs
            },
        },
    }
    manifest_path = output_dir / "manifest.json"
    manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
    return output_dir, manifest


def validate_complete_exam(
    updates_dir: Path,
    output_name: str,
    count: int = 100,
    theme: str | None = None,
    level: str | None = None,
    local_model: str = "qwen3:8b",
    generation_backend: str = "local",
    generation_model: str | None = None,
    root: Path = PROJECT_ROOT,
):
    if not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9_.-]{0,79}", output_name):
        raise RuntimeError(
            "--output-name deve conter somente letras, números, ponto, hífen ou sublinhado."
        )
    generation_model = generation_model or (
        "gpt-5.6-luna" if generation_backend == "openai" else local_model
    )
    validation, _ = validate_full_exam_inputs(
        updates_dir, count, theme, level, generation_model, generation_backend, root
    )
    validation["output_dir"] = str(
        root / "data/exports/generated/revalida_enamed_2026_2" / output_name
    )
    validation["uses_openai_api"] = generation_backend == "openai"
    validation["starts_local_model"] = False
    return validation
