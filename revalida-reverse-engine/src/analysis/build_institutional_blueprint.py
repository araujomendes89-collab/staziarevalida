"""Consolida o corpus histórico em um blueprint editorial auditável."""

import hashlib
import json
import math
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path

from src.analysis.compare_new_matrix import _load_pass
from src.config.exams import PROJECT_ROOT, list_exam_configs
from src.exports.staziamed import _preferred_dna


TARGET_YEAR = 2026
TARGET_EDITION = 2
RECENCY_HALF_LIFE_PERIODS = 6.0
MODERN_MATRIX_EXAMS = ("revalida_2026_1", "enamed_2025")
TARGET_B_DISTRIBUTION = (
    (-1.20, 20),
    (-0.40, 50),
    (0.20, 25),
    (0.80, 5),
)


def _sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def _effective_edition(exam) -> int:
    # O Enamed 2025 ocorreu no ciclo que alimenta a transição para 2026/2.
    return 2 if exam.exam_family == "ENAMED" else exam.exam_edition


def recency_weight(exam) -> float:
    periods_ago = max(
        0,
        (TARGET_YEAR - exam.exam_year) * 2
        + (TARGET_EDITION - _effective_edition(exam)),
    )
    return 0.5 ** (periods_ago / RECENCY_HALF_LIFE_PERIODS)


def _largest_remainder(distribution: dict[str, float], total: int) -> dict[str, int]:
    denominator = sum(distribution.values())
    if denominator <= 0:
        raise RuntimeError("Distribuição vazia; não é possível alocar o blueprint.")
    quotas = {key: total * value / denominator for key, value in distribution.items()}
    allocation = {key: math.floor(value) for key, value in quotas.items()}
    missing = total - sum(allocation.values())
    order = sorted(quotas, key=lambda key: (quotas[key] - allocation[key], key), reverse=True)
    for key in order[:missing]:
        allocation[key] += 1
    return dict(sorted(allocation.items(), key=lambda item: (-item[1], item[0])))


def _normalized(counter: Counter) -> dict[str, float]:
    total = sum(counter.values())
    return {
        key: round(value / total, 6)
        for key, value in sorted(counter.items(), key=lambda item: (-item[1], item[0]))
    }


def _matrix_profile(exams_by_id) -> dict:
    fields = (
        "asks_for",
        "diagnostic_stage",
        "management_stage",
        "protocol_dependency",
        "sus_dependency",
        "knowledge_depth",
        "decision_complexity",
    )
    counters = {field: Counter() for field in fields}
    scores = {"competency_over_knowledge_score": [], "generalist_relevance": []}
    total = 0
    for exam_id in MODERN_MATRIX_EXAMS:
        exam = exams_by_id[exam_id]
        passes = {number: _load_pass(exam, number, PROJECT_ROOT) for number in (1, 2)}
        expected = len(exam.classifiable_question_numbers)
        if any(len(records) != expected for records in passes.values()):
            raise RuntimeError(f"Nova matriz incompleta para {exam_id}.")
        for records in passes.values():
            for dna in records.values():
                total += 1
                for field in fields:
                    counters[field][str(getattr(dna, field))] += 1
                for field in scores:
                    scores[field].append(getattr(dna, field))
    return {
        "source_analyses": total,
        "distributions": {field: _normalized(counter) for field, counter in counters.items()},
        "mean_scores": {
            field: round(sum(values) / len(values), 4) for field, values in scores.items()
        },
    }


def main() -> None:
    exams = list_exam_configs(PROJECT_ROOT)
    exams_by_id = {exam.exam_id: exam for exam in exams}
    counters = {
        field: Counter()
        for field in (
            "primary_area",
            "primary_subarea",
            "primary_competency",
            "cognitive_task",
            "care_setting",
            "patient_group",
            "urgency_level",
            "question_format",
        )
    }
    recent_subareas = Counter()
    historical_subareas = Counter()
    joint_patterns = Counter()
    recent_total = 0
    historical_total = 0
    exam_weights = {}
    input_hashes = {}
    total_items = 0

    for exam in exams:
        canonical_path = exam.canonical_output_path(PROJECT_ROOT)
        canonical = json.loads(canonical_path.read_text(encoding="utf-8"))
        records = canonical.get("questions", [])
        expected = len(exam.classifiable_question_numbers)
        if len(records) != expected:
            raise RuntimeError(f"DNA canônico incompleto para {exam.exam_id}.")
        weight = recency_weight(exam)
        # Cada prova contribui como uma unidade; a recência define o peso entre provas.
        item_weight = weight / expected
        exam_weights[exam.exam_id] = round(weight, 6)
        input_hashes[exam.exam_id] = _sha256(canonical_path)
        total_items += expected
        for record in records:
            dna = _preferred_dna(record)
            for field, counter in counters.items():
                counter[str(dna[field])] += item_weight
            joint_patterns[
                (
                    str(dna["primary_area"]),
                    str(dna["primary_subarea"]),
                    str(dna["primary_competency"]),
                    str(dna["cognitive_task"]),
                )
            ] += item_weight
            subarea = str(dna["primary_subarea"])
            if exam.exam_year >= 2024 or exam.exam_family == "ENAMED":
                recent_subareas[subarea] += 1
                recent_total += 1
            else:
                historical_subareas[subarea] += 1
                historical_total += 1

    trends = []
    for subarea in set(recent_subareas) | set(historical_subareas):
        recent_rate = recent_subareas[subarea] / recent_total
        historical_rate = historical_subareas[subarea] / historical_total
        if recent_subareas[subarea] + historical_subareas[subarea] < 5:
            continue
        trends.append(
            {
                "primary_subarea": subarea,
                "recent_items": recent_subareas[subarea],
                "historical_items": historical_subareas[subarea],
                "recent_rate": round(recent_rate, 6),
                "historical_rate": round(historical_rate, 6),
                "delta_percentage_points": round(100 * (recent_rate - historical_rate), 3),
            }
        )
    trends.sort(key=lambda item: (-item["delta_percentage_points"], item["primary_subarea"]))

    distributions = {field: _normalized(counter) for field, counter in counters.items()}
    area_slots = _largest_remainder(distributions["primary_area"], 100)
    plan_by_area = {}
    for area, slots in area_slots.items():
        area_patterns = {
            pattern: weight
            for pattern, weight in joint_patterns.items()
            if pattern[0] == area
        }
        allocation = _largest_remainder(area_patterns, slots)
        bucket = []
        for pattern, count in allocation.items():
            for _ in range(count):
                bucket.append(
                    {
                        "primary_area": pattern[0],
                        "primary_subarea": pattern[1],
                        "primary_competency": pattern[2],
                        "cognitive_task": pattern[3],
                    }
                )
        plan_by_area[area] = bucket
    generation_plan = []
    while any(plan_by_area.values()):
        for area in area_slots:
            if plan_by_area[area]:
                generation_plan.append(plan_by_area[area].pop(0))
    for index, slot in enumerate(generation_plan, start=1):
        slot["slot"] = index
    if len(generation_plan) != 100:
        raise RuntimeError("O plano editorial não fechou exatamente 100 posições.")
    target_values = [
        value
        for value, count in TARGET_B_DISTRIBUTION
        for _ in range(count)
    ]
    # Espalha as faixas de dificuldade ao longo da prova sem alterar as cotas.
    target_values = [target_values[(index * 37) % 100] for index in range(100)]
    for slot, target_b in zip(generation_plan, target_values, strict=True):
        slot["psychometric_target"] = {
            "irt_model": "RASCH_1PL",
            "target_difficulty_b": target_b,
            "target_status": "EDITORIAL_TARGET_UNCALIBRATED",
            "empirical_b": None,
        }
    blueprint = {
        "schema_version": "staziamed.revalida.institutional-blueprint.v1",
        "status": "READY_FOR_NOVEL_ITEM_GENERATION",
        "target_cycle": "REVALIDA_ENAMED_2026_2",
        "source_exam_count": len(exams),
        "source_active_items": total_items,
        "methodology": {
            "historical_exam_usage": (
                "AGGREGATED_RECURRENCE_AND_REVERSE_ENGINEERING_ONLY"
            ),
            "historical_stems_exported_to_blueprint": False,
            "historical_items_receive_tri_parameters": False,
            "recency_weight": "exponential_decay",
            "recency_half_life_exam_periods": RECENCY_HALF_LIFE_PERIODS,
            "each_exam_normalized_to_one_unit_before_recency_weight": True,
            "modern_matrix_passes_pooled": True,
            "exact_item_prediction_claimed": False,
            "psychometric_parameters_inferred": False,
        },
        "exam_recency_weights": exam_weights,
        "content_distributions": distributions,
        "suggested_100_item_area_slots": area_slots,
        "generation_plan_100": generation_plan,
        "modern_matrix_profile": _matrix_profile(exams_by_id),
        "subarea_trends": {
            "recent_definition": "Edições de 2024 em diante e Enamed 2025",
            "historical_definition": "Edições até 2023/2",
            "largest_increases": trends[:12],
            "largest_decreases": list(reversed(trends[-12:])),
        },
        "generation_constraints": {
            "language": "português do Brasil",
            "official_items_must_not_be_modified": True,
            "official_stems_must_not_be_copied": True,
            "historical_items_used_only_as_aggregate_patterns": True,
            "current_medical_sources_required": True,
            "human_medical_review_required": True,
            "human_pedagogical_review_required": True,
            "generated_items_initial_calibration_status": "UNCALIBRATED",
            "tri_required_for_next_revalida_inep_2026_drafts": True,
            "psychometric_model": "RASCH_1PL",
            "target_b_required_for_generated_items": True,
            "target_b_allowed_only_for_generated_items": True,
            "empirical_b_requires_candidate_responses": True,
        },
        "psychometric_plan": {
            "scope": "Questões inéditas para o próximo Revalida/Inep 2026",
            "model": "RASCH_1PL",
            "cut_reference_theta": -0.40,
            "target_b_distribution": [
                {"target_b": value, "planned_items": count}
                for value, count in TARGET_B_DISTRIBUTION
            ],
            "warning": (
                "Os valores são alvos editoriais. O parâmetro b empírico só pode "
                "ser calculado após aplicação e coleta de respostas reais."
            ),
        },
    }
    output_dir = PROJECT_ROOT / "data/processed/blueprints"
    output_dir.mkdir(parents=True, exist_ok=True)
    json_path = output_dir / "revalida_enamed_2026_2_blueprint_v1.json"
    json_path.write_text(json.dumps(blueprint, ensure_ascii=False, indent=2), encoding="utf-8")

    top_subareas = list(distributions["primary_subarea"].items())[:15]
    top_tasks = list(distributions["cognitive_task"].items())[:10]
    modern_asks = list(
        blueprint["modern_matrix_profile"]["distributions"]["asks_for"].items()
    )[:10]
    lines = [
        "# Blueprint institucional Revalida/Enamed 2026.2",
        "",
        f"Base: {len(exams)} provas e {total_items} questões ativas.",
        "",
        "Este é um planejamento editorial probabilístico. Ele não prevê questões "
        "específicas e não atribui parâmetros TRI às provas oficiais.",
        "",
        "## Distribuição sugerida para 100 questões inéditas",
        "",
        *[f"- `{key}`: {value}" for key, value in area_slots.items()],
        "",
        "## Subáreas historicamente mais representadas, com peso de recência",
        "",
        *[f"- `{key}`: {100 * value:.1f}%" for key, value in top_subareas],
        "",
        "## Tarefas cognitivas mais representadas",
        "",
        *[f"- `{key}`: {100 * value:.1f}%" for key, value in top_tasks],
        "",
        "## Pedidos predominantes na nova matriz",
        "",
        *[f"- `{key}`: {100 * value:.1f}%" for key, value in modern_asks],
        "",
        "## Restrições de uso",
        "",
        "- Cada questão inédita recebe um alvo editorial Rasch e permanece não calibrada.",
        "- Atualizações médicas precisam ser fornecidas e revisadas.",
        "- Revisões médica e pedagógica são obrigatórias antes de publicação.",
        "- A metodologia TRI/Rasch é obrigatória nas inéditas do próximo Revalida/Inep 2026.",
        "- O alvo `b` orienta a elaboração; o `b` empírico exige respostas reais.",
        "",
    ]
    markdown_path = output_dir / "revalida_enamed_2026_2_blueprint_v1.md"
    markdown_path.write_text("\n".join(lines), encoding="utf-8")

    manifest = {
        "schema_version": "revalida.stage3-manifest.v1",
        "status": "STAGE3_COMPLETED",
        "created_at_utc": datetime.now(timezone.utc).isoformat(),
        "source_exam_count": len(exams),
        "source_active_items": total_items,
        "api_accessed": False,
        "psychometric_parameters_inferred": False,
        "inputs_sha256": input_hashes,
        "outputs": {
            "blueprint_json": str(json_path),
            "blueprint_json_sha256": _sha256(json_path),
            "blueprint_markdown": str(markdown_path),
            "blueprint_markdown_sha256": _sha256(markdown_path),
        },
    }
    manifest_path = output_dir / "stage3_manifest.json"
    manifest_path.write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    print(f"Blueprint: {json_path}")
    print(f"Síntese: {markdown_path}")
    print(f"Manifesto: {manifest_path}")
    print("STATUS: STAGE3_COMPLETED")


if __name__ == "__main__":
    main()
