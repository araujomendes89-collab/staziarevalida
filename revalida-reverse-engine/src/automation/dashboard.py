"""Gera painel local de progresso e retomada do pipeline."""

import html
import json
from datetime import datetime, timezone
from pathlib import Path

from src.automation.status import COMPLETED_STAGES
from src.config.exams import PROJECT_ROOT, list_exam_configs


def _state(path: Path):
    if not path.is_file():
        return {}
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
        return value if isinstance(value, dict) else {}
    except (OSError, json.JSONDecodeError, UnicodeDecodeError):
        return {}


def build_progress_dashboard(
    output_dir: Path,
    root: Path = PROJECT_ROOT,
):
    rows = []
    for exam in list_exam_configs(root):
        state_path = root / "data/runs" / f"{exam.exam_id}_pipeline.json"
        state = _state(state_path)
        stages = state.get("stages", {}) if isinstance(state.get("stages"), dict) else {}
        completed = sum(stages.get(stage) == "COMPLETED" for stage in COMPLETED_STAGES)
        progress = round(100 * completed / len(COMPLETED_STAGES))
        status = state.get("status", "NOT_STARTED")
        if status == "PIPELINE_COMPLETED":
            next_action = "Nenhuma: edição concluída e verificada."
        else:
            next_action = state.get("next_command") or (
                f"./revalida reconcile-status --exam-id {exam.exam_id}; "
                "se ainda incompleta, repita o comando automate usado na importação."
            )
        manifest = state.get("staziamed_manifest") or {}
        rows.append(
            {
                "exam_id": exam.exam_id,
                "exam_name": exam.exam_name or exam.exam_id,
                "status": status,
                "progress_percent": progress,
                "completed_stages": completed,
                "total_stages": len(COMPLETED_STAGES),
                "active_questions": manifest.get("active_questions"),
                "all_questions": manifest.get("individual_question_files"),
                "next_action": next_action,
                "state_file": str(state_path),
                "updated_at_utc": state.get("updated_at_utc"),
            }
        )
    generated = []
    generated_root = root / "data/exports/generated/revalida_enamed_2026_2"
    if generated_root.is_dir():
        for path in sorted(generated_root.glob("*/manifest.json")):
            if path.name.startswith("._"):
                continue
            value = _state(path)
            generated.append(
                {
                    "name": path.parent.name,
                    "status": value.get("status", "EM_ANDAMENTO"),
                    "question_count": value.get("question_count", 0),
                    "path": str(path.parent),
                }
            )
    payload = {
        "schema_version": "revalida.progress-dashboard.v1",
        "generated_at_utc": datetime.now(timezone.utc).isoformat(),
        "summary": {
            "exam_count": len(rows),
            "completed_exam_count": sum(
                row["status"] == "PIPELINE_COMPLETED" for row in rows
            ),
            "active_question_count": sum(row["active_questions"] or 0 for row in rows),
        },
        "exams": rows,
        "generated_exams": generated,
    }
    output_dir.mkdir(parents=True, exist_ok=True)
    json_path = output_dir / "painel_progresso.json"
    json_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    table_rows = "".join(
        "<tr>"
        f"<td><strong>{html.escape(row['exam_name'])}</strong><br><code>{row['exam_id']}</code></td>"
        f"<td><span class='status'>{html.escape(row['status'])}</span></td>"
        f"<td><div class='bar'><i style='width:{row['progress_percent']}%'></i></div>{row['progress_percent']}%</td>"
        f"<td>{row['active_questions'] or 0} / {row['all_questions'] or 0}</td>"
        f"<td><code>{html.escape(row['next_action'])}</code></td>"
        "</tr>"
        for row in rows
    )
    html_text = f"""<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width">
<title>Painel Revalida Reverse Engine</title>
<style>
body{{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;background:#f3f6fa;color:#14253d;margin:0}}
header{{background:#17365d;color:white;padding:28px 5vw}} main{{padding:24px 5vw}}
.cards{{display:flex;gap:16px;flex-wrap:wrap;margin-bottom:22px}} .card{{background:white;padding:18px;border-radius:12px;min-width:180px;box-shadow:0 2px 10px #17365d18}}
.big{{font-size:28px;font-weight:700}} table{{width:100%;border-collapse:collapse;background:white;box-shadow:0 2px 10px #17365d18}}
th,td{{padding:11px;border-bottom:1px solid #dce3ec;text-align:left;vertical-align:top}} th{{background:#e7eef7}}
.bar{{height:9px;background:#d9e1ea;border-radius:8px;overflow:hidden;min-width:110px}} .bar i{{display:block;height:100%;background:#25865c}}
.status{{font-weight:700;color:#1d6c4a}} code{{white-space:normal;font-size:11px}} footer{{padding:20px 5vw;color:#607086}}
</style></head><body><header><h1>Painel Revalida Reverse Engine</h1><p>Progresso, integridade e retomada das edições.</p></header>
<main><div class="cards"><div class="card"><div class="big">{len(rows)}</div>Edições</div>
<div class="card"><div class="big">{payload['summary']['completed_exam_count']}</div>Concluídas</div>
<div class="card"><div class="big">{payload['summary']['active_question_count']}</div>Questões ativas</div></div>
<table><thead><tr><th>Edição</th><th>Estado</th><th>Progresso</th><th>Ativas / total</th><th>Retomada</th></tr></thead><tbody>{table_rows}</tbody></table></main>
<footer>Atualizado em {html.escape(payload['generated_at_utc'])}. Para atualizar, execute <code>./revalida progress-dashboard</code>.</footer></body></html>"""
    html_path = output_dir / "painel_progresso.html"
    html_path.write_text(html_text, encoding="utf-8")
    return html_path, json_path, payload

