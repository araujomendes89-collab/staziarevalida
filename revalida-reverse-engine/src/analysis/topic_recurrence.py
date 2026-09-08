"""Estatísticas locais de recorrência temática no corpus histórico."""

import csv
import json
import re
import unicodedata
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path

from rapidfuzz import fuzz

from src.config.exams import PROJECT_ROOT, list_exam_configs
from src.exports.staziamed import _preferred_dna


CONTROLLED_LABELS = {
    "CLINICAL_MEDICINE": "Clínica Médica",
    "GENERAL_SURGERY": "Cirurgia Geral",
    "OBSTETRICS_GYNECOLOGY": "Ginecologia e Obstetrícia",
    "PEDIATRICS": "Pediatria",
    "FAMILY_COMMUNITY_PUBLIC_HEALTH": "Medicina de Família, Comunidade e Saúde Coletiva",
    "ACUTE_ABDOMEN": "Abdome agudo",
    "CARDIOLOGY": "Cardiologia",
    "CLINICAL_EMERGENCIES": "Emergências clínicas",
    "COLOPROCTOLOGY": "Coloproctologia",
    "DERMATOLOGY": "Dermatologia",
    "ENDOCRINOLOGY": "Endocrinologia",
    "EPIDEMIOLOGY_BIOSTATISTICS": "Epidemiologia e bioestatística",
    "ETHICS_COMMUNICATION": "Ética e comunicação",
    "GASTROENTEROLOGY_HEPATOLOGY": "Gastroenterologia e hepatologia",
    "GYNECOLOGY": "Ginecologia",
    "HEALTH_SURVEILLANCE": "Vigilância em saúde",
    "HEMATOLOGY_ONCOLOGY": "Hematologia e oncologia",
    "HERNIAS": "Hérnias",
    "IMMUNIZATION": "Imunização",
    "IMMUNIZATION_PUBLIC_HEALTH": "Imunização em saúde coletiva",
    "INFECTIOUS_DISEASES": "Infectologia",
    "NEONATOLOGY": "Neonatologia",
    "NEPHROLOGY_ELECTROLYTES": "Nefrologia e distúrbios eletrolíticos",
    "NEUROLOGY": "Neurologia",
    "OBSTETRICS": "Obstetrícia",
    "ORTHOPEDICS_TRAUMA": "Ortopedia e trauma",
    "PEDIATRIC_EMERGENCIES": "Emergências pediátricas",
    "PEDIATRIC_ENDOCRINOLOGY": "Endocrinologia pediátrica",
    "PEDIATRIC_GASTRO_NUTRITION": "Gastroenterologia e nutrição pediátricas",
    "PEDIATRIC_INFECTIOUS_EXANTHEMS": "Infectologia e exantemas pediátricos",
    "PEDIATRIC_NEUROLOGY": "Neurologia pediátrica",
    "PEDIATRIC_RESPIRATORY": "Pneumologia pediátrica",
    "PERIOPERATIVE_CARE": "Cuidados perioperatórios",
    "PREVENTION_SCREENING": "Prevenção e rastreamento",
    "PRIMARY_CARE": "Atenção primária",
    "PSYCHIATRY": "Psiquiatria",
    "PULMONOLOGY": "Pneumologia",
    "RHEUMATOLOGY": "Reumatologia",
    "SUS_HEALTH_SYSTEM": "Sistema Único de Saúde",
    "TRAUMA_ATLS": "Trauma e atendimento inicial",
    "UROLOGY": "Urologia",
    "WELL_CHILD_CARE_GROWTH_DEVELOPMENT": "Puericultura, crescimento e desenvolvimento",
}


def _normalize(value: str) -> str:
    text = unicodedata.normalize("NFKD", str(value or ""))
    text = "".join(char for char in text if not unicodedata.combining(char))
    return " ".join(re.findall(r"[a-z0-9]+", text.lower()))


def _period(exam) -> tuple[int, int, str]:
    edition = 2 if exam.exam_family == "ENAMED" else exam.exam_edition
    return exam.exam_year, edition, exam.exam_id


def _load_records(root: Path):
    records = []
    exams = list_exam_configs(root)
    for exam in exams:
        path = exam.canonical_output_path(root)
        if not path.is_file():
            raise RuntimeError(f"DNA canônico ausente para {exam.exam_id}: {path}")
        canonical = json.loads(path.read_text(encoding="utf-8"))
        for item in canonical.get("questions", []):
            dna = _preferred_dna(item)
            records.append(
                {
                    "exam_id": exam.exam_id,
                    "period": _period(exam),
                    "recent": exam.exam_year >= 2024 or exam.exam_family == "ENAMED",
                    "question_number": item["question_number"],
                    "dna": dna,
                }
            )
    return exams, records


def _aggregate(records, extractor, total_exams, recent_total, historical_total):
    buckets = defaultdict(list)
    labels = defaultdict(Counter)
    for record in records:
        seen = set()
        for key, label in extractor(record):
            if not key or key in seen:
                continue
            seen.add(key)
            buckets[key].append(record)
            labels[key][label] += 1
    result = []
    for key, occurrences in buckets.items():
        exam_ids = sorted({item["exam_id"] for item in occurrences})
        recent_count = sum(item["recent"] for item in occurrences)
        historical_count = len(occurrences) - recent_count
        recent_rate = recent_count / recent_total if recent_total else 0.0
        historical_rate = historical_count / historical_total if historical_total else 0.0
        distinct = len(exam_ids)
        count = len(occurrences)
        if distinct >= 8 or count >= 20:
            recurrence = "MUITO_RECORRENTE"
        elif distinct >= 5 or count >= 10:
            recurrence = "RECORRENTE"
        elif distinct >= 2:
            recurrence = "REPETIDO"
        else:
            recurrence = "ISOLADO"
        ordered = sorted(occurrences, key=lambda item: item["period"])
        label = labels[key].most_common(1)[0][0]
        result.append(
            {
                "label": label,
                "normalized_key": key,
                "question_count": count,
                "question_share_percent": round(100 * count / len(records), 3),
                "distinct_exam_count": distinct,
                "exam_coverage_percent": round(100 * distinct / total_exams, 2),
                "recurrence_class": recurrence,
                "first_occurrence": ordered[0]["exam_id"],
                "last_occurrence": ordered[-1]["exam_id"],
                "recent_question_count": recent_count,
                "historical_question_count": historical_count,
                "recent_rate_percent": round(100 * recent_rate, 3),
                "historical_rate_percent": round(100 * historical_rate, 3),
                "trend_delta_percentage_points": round(
                    100 * (recent_rate - historical_rate), 3
                ),
                "editions": exam_ids,
                "question_refs": [
                    f"{item['exam_id']}_q{item['question_number']:03d}"
                    for item in ordered
                ],
            }
        )
    result.sort(
        key=lambda item: (
            -item["distinct_exam_count"],
            -item["question_count"],
            item["label"],
        )
    )
    return result


def _theme_clusters(records, threshold=88):
    by_subarea = defaultdict(list)
    for record in records:
        dna = record["dna"]
        topic = str(dna.get("topic", "")).strip()
        normalized = _normalize(topic)
        if topic and normalized:
            by_subarea[str(dna["primary_subarea"])].append((normalized, topic, record))
    output = []
    for subarea, values in sorted(by_subarea.items()):
        clusters = []
        for normalized, topic, record in sorted(
            values, key=lambda value: (value[0], value[2]["exam_id"], value[2]["question_number"])
        ):
            best_index, best_score = None, -1
            for index, cluster in enumerate(clusters):
                score = fuzz.token_set_ratio(normalized, cluster["anchor"])
                if score > best_score:
                    best_index, best_score = index, score
            if best_index is not None and best_score >= threshold:
                cluster = clusters[best_index]
            else:
                cluster = {
                    "anchor": normalized,
                    "labels": Counter(),
                    "records": [],
                }
                clusters.append(cluster)
            cluster["labels"][topic] += 1
            cluster["records"].append(record)
        for cluster in clusters:
            label = cluster["labels"].most_common(1)[0][0]
            output.append(
                (
                    f"{_normalize(subarea)}::{cluster['anchor']}",
                    label,
                    cluster["records"],
                )
            )
    return output


def build_recurrence_report(root: Path = PROJECT_ROOT, limit: int = 100):
    if limit < 1:
        raise RuntimeError("O limite deve ser positivo.")
    exams, records = _load_records(root)
    recent_total = sum(record["recent"] for record in records)
    historical_total = len(records) - recent_total

    def field(name):
        def extract(record):
            value = str(record["dna"].get(name, ""))
            return [(_normalize(value), CONTROLLED_LABELS.get(value, value))]

        return extract

    def list_field(name):
        return lambda record: [
            (_normalize(value), str(value)) for value in record["dna"].get(name, [])
        ]

    dimensions = {
        "primary_areas": _aggregate(
            records, field("primary_area"), len(exams), recent_total, historical_total
        ),
        "primary_subareas": _aggregate(
            records, field("primary_subarea"), len(exams), recent_total, historical_total
        ),
        "key_concepts": _aggregate(
            records, list_field("key_concepts"), len(exams), recent_total, historical_total
        ),
        "diagnoses_or_conditions": _aggregate(
            records,
            list_field("diagnoses_or_conditions"),
            len(exams),
            recent_total,
            historical_total,
        ),
    }
    cluster_records = []
    for key, label, occurrences in _theme_clusters(records):
        for occurrence in occurrences:
            clone = dict(occurrence)
            clone["theme_key"] = key
            clone["theme_label"] = label
            cluster_records.append(clone)
    dimensions["themes"] = _aggregate(
        cluster_records,
        lambda record: [(record["theme_key"], record["theme_label"])],
        len(exams),
        recent_total,
        historical_total,
    )
    report = {
        "schema_version": "revalida.topic-recurrence.v1",
        "created_at_utc": datetime.now(timezone.utc).isoformat(),
        "historical_usage": "RECURRENCE_AND_REVERSE_ENGINEERING_ONLY",
        "tri_applied_to_historical_items": False,
        "source_exam_count": len(exams),
        "source_question_count": len(records),
        "recent_question_count": recent_total,
        "historical_question_count": historical_total,
        "methodology": {
            "recent_definition": "Edições a partir de 2024 e Enamed 2025",
            "theme_grouping": "Mesmo subarea e similaridade token-set do tópico >= 88%",
            "recurrence_uses": "contagem de questões e cobertura entre edições",
            "trend": "frequência recente menos frequência histórica em pontos percentuais",
        },
        **{name: rows[:limit] for name, rows in dimensions.items()},
    }
    return report


def write_recurrence_report(
    output_dir: Path,
    root: Path = PROJECT_ROOT,
    limit: int = 100,
):
    report = build_recurrence_report(root, limit)
    output_dir.mkdir(parents=True, exist_ok=True)
    json_path = output_dir / "topic_recurrence.json"
    json_path.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")

    csv_path = output_dir / "topic_recurrence.csv"
    with csv_path.open("w", encoding="utf-8", newline="") as stream:
        fields = (
            "label", "question_count", "question_share_percent",
            "distinct_exam_count", "exam_coverage_percent", "recurrence_class",
            "first_occurrence", "last_occurrence", "recent_question_count",
            "historical_question_count", "trend_delta_percentage_points",
        )
        writer = csv.DictWriter(stream, fieldnames=("dimension", *fields))
        writer.writeheader()
        for dimension, rows in (
            ("tema", report["themes"]),
            ("subárea", report["primary_subareas"]),
            ("conceito-chave", report["key_concepts"]),
            ("diagnóstico ou condição", report["diagnoses_or_conditions"]),
        ):
            for row in rows:
                writer.writerow(
                    {"dimension": dimension, **{field: row[field] for field in fields}}
                )

    markdown_path = output_dir / "topic_recurrence.md"
    lines = [
        "# Recorrência temática — Revalida/Enamed",
        "",
        f"Corpus: {report['source_question_count']} questões de "
        f"{report['source_exam_count']} edições.",
        "",
        "As provas históricas são usadas somente para recorrência e engenharia reversa; "
        "nenhum parâmetro TRI foi atribuído a elas.",
        "",
        "## Temas mais recorrentes",
        "",
        "| Tema | Questões | Edições | Cobertura | Tendência (p.p.) |",
        "|---|---:|---:|---:|---:|",
    ]
    for row in report["themes"][:30]:
        lines.append(
            f"| {row['label']} | {row['question_count']} | "
            f"{row['distinct_exam_count']} | {row['exam_coverage_percent']:.2f}% | "
            f"{row['trend_delta_percentage_points']:+.3f} |"
        )
    lines.extend(
        [
            "",
            "## Subáreas mais recorrentes",
            "",
            "| Subárea | Questões | Edições | Cobertura | Tendência (p.p.) |",
            "|---|---:|---:|---:|---:|",
        ]
    )
    for row in report["primary_subareas"]:
        lines.append(
            f"| {row['label']} | {row['question_count']} | "
            f"{row['distinct_exam_count']} | {row['exam_coverage_percent']:.2f}% | "
            f"{row['trend_delta_percentage_points']:+.3f} |"
        )
    markdown_path.write_text("\n".join(lines) + "\n", encoding="utf-8")
    return json_path, csv_path, markdown_path, report
