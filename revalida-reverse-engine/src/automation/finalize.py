"""Fechamento operacional, reconciliação, painel e pacote StaziaMed."""

from pathlib import Path

from src.automation.dashboard import build_progress_dashboard
from src.automation.status import reconcile_pipeline_state
from src.config.exams import PROJECT_ROOT, list_exam_configs
from src.exports.staziamed_import import build_staziamed_import_package


def finalize_operation(root: Path = PROJECT_ROOT):
    reconciled = []
    errors = []
    for exam in list_exam_configs(root):
        try:
            state_path, state = reconcile_pipeline_state(exam, root)
            reconciled.append(
                {
                    "exam_id": exam.exam_id,
                    "state_path": str(state_path),
                    "status": state["status"],
                }
            )
        except RuntimeError as exc:
            errors.append({"exam_id": exam.exam_id, "error": str(exc)})
    if errors:
        details = "; ".join(f"{item['exam_id']}: {item['error']}" for item in errors)
        raise RuntimeError(
            "Não foi possível criar o pacote definitivo porque há edições incompletas: "
            + details
        )
    import_dir, import_manifest = build_staziamed_import_package(
        root / "data/exports/staziamed_import_ready/v1", root
    )
    dashboard_html, dashboard_json, dashboard = build_progress_dashboard(
        root / "data/processed/dashboard", root
    )
    return {
        "reconciled": reconciled,
        "import_dir": str(import_dir),
        "import_manifest": import_manifest,
        "dashboard_html": str(dashboard_html),
        "dashboard_json": str(dashboard_json),
        "dashboard_summary": dashboard["summary"],
    }

