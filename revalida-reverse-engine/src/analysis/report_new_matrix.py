"""Gera uma síntese editorial determinística da nova matriz Revalida/Enamed."""

import hashlib
import json
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path

from src.analysis.compare_new_matrix import SCALAR_FIELDS, _load_pass
from src.config.exams import PROJECT_ROOT, get_exam_config


EXAM_IDS = ("revalida_2026_1", "enamed_2025")
LABELS = {
    "revalida_2026_1": "Revalida 2026/1",
    "enamed_2025": "Enamed 2025",
}


def _sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def _pooled_distribution(passes, field: str) -> Counter:
    values = Counter()
    for records in passes.values():
        for dna in records.values():
            values[str(getattr(dna, field))] += 0.5
    return values


def _percentage(value: float, total: int) -> str:
    return f"{100 * value / total:.1f}%".replace(".", ",")


def _decimal(value: float) -> str:
    return f"{value:.2f}".replace(".", ",")


def _top_lines(distribution: Counter, total: int, limit: int = 6) -> list[str]:
    return [
        f"- `{name}`: {value:g} itens equivalentes ({_percentage(value, total)})"
        for name, value in distribution.most_common(limit)
    ]


def main() -> None:
    comparison_path = PROJECT_ROOT / "data/processed/reports/new_matrix_comparison.json"
    comparison = json.loads(comparison_path.read_text(encoding="utf-8"))
    comparison_by_exam = {item["exam_id"]: item for item in comparison["exams"]}
    sections = []
    manifest_inputs = {"comparison": _sha256(comparison_path)}

    for exam_id in EXAM_IDS:
        exam = get_exam_config(exam_id)
        passes = {number: _load_pass(exam, number, PROJECT_ROOT) for number in (1, 2)}
        expected = len(exam.classifiable_question_numbers)
        if any(len(records) != expected for records in passes.values()):
            raise RuntimeError(f"{exam_id}: os dois passes precisam estar completos.")
        for number in (1, 2):
            path = exam.matrix_dna_output_path(PROJECT_ROOT, number)
            manifest_inputs[f"{exam_id}_pass{number}"] = _sha256(path)

        asks = _pooled_distribution(passes, "asks_for")
        diagnostic = _pooled_distribution(passes, "diagnostic_stage")
        management = _pooled_distribution(passes, "management_stage")
        depth = _pooled_distribution(passes, "knowledge_depth")
        complexity = _pooled_distribution(passes, "decision_complexity")
        protocol = _pooled_distribution(passes, "protocol_dependency")
        sus = _pooled_distribution(passes, "sus_dependency")
        competence_scores = [
            dna.competency_over_knowledge_score
            for records in passes.values()
            for dna in records.values()
        ]
        relevance_scores = [
            dna.generalist_relevance
            for records in passes.values()
            for dna in records.values()
        ]
        agreement = comparison_by_exam[exam_id]["agreement"]
        average_agreement = sum(
            agreement[field]["rate"] for field in SCALAR_FIELDS
        ) / len(SCALAR_FIELDS)

        sections.extend(
            [
                f"## {LABELS[exam_id]}",
                "",
                f"- Cobertura: {expected}/{expected} itens válidos em cada passe.",
                f"- Concordância média nos campos escalares: {_percentage(average_agreement, 1)}.",
                f"- Dependência de protocolo: {_percentage(protocol['True'], expected)}.",
                f"- Dependência explícita do SUS: {_percentage(sus['True'], expected)}.",
                "- Ênfase competência sobre memorização: "
                f"{_decimal(sum(competence_scores) / len(competence_scores))}/5.",
                "- Relevância para atuação generalista: "
                f"{_decimal(sum(relevance_scores) / len(relevance_scores))}/5.",
                "",
                "### O que a questão pede",
                "",
                *_top_lines(asks, expected),
                "",
                "### Estágio diagnóstico",
                "",
                *_top_lines(diagnostic, expected),
                "",
                "### Estágio de conduta",
                "",
                *_top_lines(management, expected),
                "",
                "### Profundidade do conhecimento",
                "",
                *_top_lines(depth, expected),
                "",
                "### Complexidade decisória",
                "",
                *_top_lines(complexity, expected),
                "",
            ]
        )

    agreement_rows = []
    for field in SCALAR_FIELDS:
        left = comparison_by_exam[EXAM_IDS[0]]["agreement"][field]["rate"]
        right = comparison_by_exam[EXAM_IDS[1]]["agreement"][field]["rate"]
        agreement_rows.append(
            f"| `{field}` | {_percentage(left, 1)} | {_percentage(right, 1)} |"
        )

    report = "\n".join(
        [
            "# Nova matriz Revalida/Enamed — relatório comparativo",
            "",
            "Relatório editorial produzido a partir de dois passes independentes do "
            "GPT-5.6 Luna por item. As distribuições usam a média dos votos dos dois "
            "passes; valores fracionários representam divergência entre eles.",
            "",
            "Esta análise não altera as provas oficiais e não estima parâmetros TRI. "
            "Os resultados descrevem padrões editoriais, não dificuldade psicométrica.",
            "",
            *sections,
            "## Estabilidade entre os passes",
            "",
            "| Campo | Revalida 2026/1 | Enamed 2025 |",
            "|---|---:|---:|",
            *agreement_rows,
            "",
            "## Leitura operacional",
            "",
            "- Em ambos os exames, o núcleo mais frequente está em decidir diagnóstico, "
            "próximo passo e tratamento, e não em simples recordação isolada.",
            "- A concordância entre passes deve orientar a confiança editorial: campos "
            "com menor estabilidade merecem revisão humana antes de virarem regras de geração.",
            "- Os modelos de erro dos distratores, pistas discriminadoras e sinais de "
            "alarme ficam preservados item a item nos arquivos `matrix_v1`.",
            "- Qualquer dificuldade-alvo ou TRI permanece reservada exclusivamente às "
            "questões inéditas e exige calibração empírica para ser tratada como parâmetro.",
            "",
        ]
    )
    output_path = PROJECT_ROOT / "data/processed/reports/new_matrix_comparison.md"
    output_path.write_text(report, encoding="utf-8")
    manifest_path = PROJECT_ROOT / "data/processed/reports/new_matrix_stage2_manifest.json"
    manifest = {
        "schema_version": "revalida.new-matrix-stage2-manifest.v1",
        "status": "COMPLETED",
        "exam_ids": list(EXAM_IDS),
        "independent_passes_per_exam": 2,
        "total_analyses": 380,
        "model": "gpt-5.6-luna",
        "psychometric_parameters_inferred": False,
        "created_at_utc": datetime.now(timezone.utc).isoformat(),
        "inputs_sha256": manifest_inputs,
        "outputs": {
            "comparison_json": str(comparison_path),
            "editorial_report": str(output_path),
            "editorial_report_sha256": _sha256(output_path),
        },
    }
    manifest_path.write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    print(f"Relatório editorial: {output_path}")
    print(f"Manifesto da etapa 2: {manifest_path}")
    print("STATUS: STAGE2_COMPLETED")


if __name__ == "__main__":
    main()
