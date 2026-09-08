"""Audita o blueprint editorial da etapa 3 sem acessar serviços externos."""

import hashlib
import json
from collections import Counter

from src.config.exams import PROJECT_ROOT, list_exam_configs


def _sha256(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main() -> None:
    directory = PROJECT_ROOT / "data/processed/blueprints"
    blueprint_path = directory / "revalida_enamed_2026_2_blueprint_v1.json"
    manifest_path = directory / "stage3_manifest.json"
    blueprint = json.loads(blueprint_path.read_text(encoding="utf-8"))
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))

    if blueprint.get("source_exam_count") != 13:
        raise RuntimeError("O blueprint não cobre as 13 provas esperadas.")
    if blueprint.get("source_active_items") != 1217:
        raise RuntimeError("O blueprint não cobre as 1.217 questões ativas.")
    if blueprint.get("methodology", {}).get("psychometric_parameters_inferred") is not False:
        raise RuntimeError("O blueprint não preserva a separação psicométrica.")
    if blueprint.get("methodology", {}).get("historical_exam_usage") != (
        "AGGREGATED_RECURRENCE_AND_REVERSE_ENGINEERING_ONLY"
    ):
        raise RuntimeError("A finalidade das provas históricas está incorreta.")
    if blueprint.get("methodology", {}).get("historical_stems_exported_to_blueprint") is not False:
        raise RuntimeError("O blueprint não pode exportar enunciados históricos.")
    plan = blueprint.get("generation_plan_100", [])
    if len(plan) != 100 or [item.get("slot") for item in plan] != list(range(1, 101)):
        raise RuntimeError("O plano de geração não contém 100 posições contínuas.")
    actual_areas = Counter(item.get("primary_area") for item in plan)
    if dict(actual_areas) != blueprint.get("suggested_100_item_area_slots"):
        raise RuntimeError("As áreas do plano divergem da alocação declarada.")
    required = {
        "primary_area",
        "primary_subarea",
        "primary_competency",
        "cognitive_task",
        "slot",
        "psychometric_target",
    }
    if any(set(item) != required for item in plan):
        raise RuntimeError("Uma posição do plano possui contrato inválido.")
    targets = Counter(
        item["psychometric_target"]["target_difficulty_b"] for item in plan
    )
    if targets != Counter({-1.2: 20, -0.4: 50, 0.2: 25, 0.8: 5}):
        raise RuntimeError("A distribuição dos alvos Rasch está divergente.")
    if any(
        item["psychometric_target"].get("empirical_b") is not None
        for item in plan
    ):
        raise RuntimeError("O plano contém parâmetro b empírico sem respostas reais.")

    exams = list_exam_configs(PROJECT_ROOT)
    for exam in exams:
        path = exam.canonical_output_path(PROJECT_ROOT)
        expected_hash = manifest.get("inputs_sha256", {}).get(exam.exam_id)
        if expected_hash != _sha256(path):
            raise RuntimeError(f"Hash divergente para {exam.exam_id}.")
    outputs = manifest.get("outputs", {})
    if outputs.get("blueprint_json_sha256") != _sha256(blueprint_path):
        raise RuntimeError("Hash divergente para o blueprint JSON.")
    markdown_path = directory / "revalida_enamed_2026_2_blueprint_v1.md"
    if outputs.get("blueprint_markdown_sha256") != _sha256(markdown_path):
        raise RuntimeError("Hash divergente para a síntese do blueprint.")

    print("Provas históricas: 13")
    print("Questões ativas: 1217")
    print("Posições editoriais: 100")
    print("OpenAI API: não acessada")
    print("Parâmetros TRI inferidos: não")
    print("STATUS: INSTITUTIONAL_BLUEPRINT_VERIFIED")


if __name__ == "__main__":
    main()
