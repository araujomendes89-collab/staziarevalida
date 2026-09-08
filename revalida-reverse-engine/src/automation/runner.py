"""Orquestrador reiniciável do pipeline completo de uma edição."""

import json
import os
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

from src.automation.intake import prepare_exam_folder
from src.config.exams import PROJECT_ROOT
from src.exports.staziamed import export_staziamed_package
from src.generation.novel_questions import generate_novel_questions


def _atomic_json(path: Path, data) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(path.suffix + ".tmp")
    temporary.write_text(
        json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    temporary.replace(path)


def _load_previous_state(path: Path, exam_id: str) -> dict:
    if not path.is_file():
        return {}
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError):
        return {}
    if not isinstance(data, dict) or data.get("exam_id") != exam_id:
        return {}
    return data


def _run_module(module: str, arguments: list[str], root: Path) -> None:
    environment = dict(os.environ)
    environment.setdefault("PYTHONPYCACHEPREFIX", "/tmp/revalida_pycache")
    subprocess.run(
        [sys.executable, "-m", module, *arguments],
        cwd=root,
        env=environment,
        check=True,
    )


def run_automated_pipeline(
    input_dir: Path,
    root: Path = PROJECT_ROOT,
    allow_openai: bool = False,
    force: bool = False,
    generate_count: int = 0,
    updates_dir: Path | None = None,
    generation_target_b: float | None = None,
    classification_backend: str = "openai",
    local_model: str = "qwen3:8b",
    local_vision_model: str = "qwen3-vl:8b-instruct",
    review_model: str = "gpt-5.6-luna",
    max_openai_reviews: int = 40,
):
    if classification_backend not in {"openai", "local", "hybrid"}:
        raise ValueError("Motor de classificação inválido.")
    if max_openai_reviews < 0:
        raise ValueError("O limite de revisões OpenAI não pode ser negativo.")
    exam, intake = prepare_exam_folder(input_dir, root=root, force=force)
    state_path = root / "data/runs" / f"{exam.exam_id}_pipeline.json"
    previous_state = _load_previous_state(state_path, exam.exam_id)
    previous_stages = previous_state.get("stages", {})
    if not isinstance(previous_stages, dict):
        previous_stages = {}
    state = {
        "exam_id": exam.exam_id,
        "status": "LOCAL_DATASET_READY",
        "allow_openai": allow_openai,
        "stages": {**previous_stages, "intake": "COMPLETED"},
        "intake": intake,
        "updated_at_utc": datetime.now(timezone.utc).isoformat(),
    }
    for key in (
        "staziamed_output",
        "staziamed_manifest",
        "generated_questions",
        "generated_questions_path",
    ):
        if key in previous_state:
            state[key] = previous_state[key]
    _atomic_json(state_path, state)
    if classification_backend in {"openai", "hybrid"} and not allow_openai:
        if previous_state.get("status") == "PIPELINE_COMPLETED":
            state["status"] = "PIPELINE_COMPLETED"
            state.pop("next_command", None)
        else:
            state["status"] = "AWAITING_EXPLICIT_OPENAI_AUTHORIZATION"
            state["next_command"] = (
                f"./revalida automate {str(input_dir)!r} --backend "
                f"{classification_backend} --allow-openai"
            )
        _atomic_json(state_path, state)
        return exam, state, None

    stages = [
        (
            "classify_pass1",
            "src.classification.classify_dna_all",
            [
                "--exam-id",
                exam.exam_id,
                "--pass-number",
                "1",
                "--max-new-questions",
                str(len(exam.classifiable_question_numbers)),
                "--backend",
                classification_backend,
                "--local-model",
                local_model,
                "--local-vision-model",
                local_vision_model,
                "--review-model",
                review_model,
                "--max-openai-reviews",
                str(max_openai_reviews),
            ],
        ),
        (
            "classify_pass2",
            "src.classification.classify_dna_all",
            [
                "--exam-id",
                exam.exam_id,
                "--pass-number",
                "2",
                "--max-new-questions",
                str(len(exam.classifiable_question_numbers)),
                "--backend",
                classification_backend,
                "--local-model",
                local_model,
                "--local-vision-model",
                local_vision_model,
                "--review-model",
                review_model,
                "--max-openai-reviews",
                str(max_openai_reviews),
            ],
        ),
        (
            "compare",
            "src.verification.compare_dna_production",
            ["--exam-id", exam.exam_id],
        ),
        (
            "auto_adjudicate",
            "src.verification.auto_adjudicate",
            ["--exam-id", exam.exam_id],
        ),
        (
            "build_canonical",
            "src.ingestion.build_canonical_dna",
            ["--exam-id", exam.exam_id],
        ),
        (
            "audit_canonical",
            "src.verification.audit_canonical_dna",
            ["--exam-id", exam.exam_id],
        ),
    ]
    try:
        for name, module, arguments in stages:
            state["stages"][name] = "RUNNING"
            state["updated_at_utc"] = datetime.now(timezone.utc).isoformat()
            _atomic_json(state_path, state)
            _run_module(module, arguments, root)
            state["stages"][name] = "COMPLETED"
            _atomic_json(state_path, state)

        output_dir, manifest = export_staziamed_package(exam, root)
        state["stages"]["staziamed_export"] = "COMPLETED"
        if generate_count:
            if updates_dir is None:
                raise RuntimeError(
                    "--updates-dir é obrigatório quando --generate-count for usado."
                )
            generated_path, generated = generate_novel_questions(
                exam,
                generate_count,
                updates_dir,
                root,
                target_difficulty_b=generation_target_b,
            )
            state["stages"]["novel_question_generation"] = "COMPLETED"
            state["generated_questions"] = len(generated)
            state["generated_questions_path"] = str(generated_path)
        state["status"] = "PIPELINE_COMPLETED"
        state["staziamed_output"] = str(output_dir)
        state["staziamed_manifest"] = manifest
        state["updated_at_utc"] = datetime.now(timezone.utc).isoformat()
        _atomic_json(state_path, state)
        return exam, state, output_dir
    except Exception as exc:
        state["status"] = "FAILED_RESTARTABLE"
        state["error"] = str(exc)
        state["updated_at_utc"] = datetime.now(timezone.utc).isoformat()
        _atomic_json(state_path, state)
        raise
