"""Encontra questões tematicamente gêmeas em edições diferentes."""

import argparse
import json
import re
import unicodedata
from pathlib import Path

from rapidfuzz import fuzz

from src.config.exams import PROJECT_ROOT, list_exam_configs, load_exam_master
from src.exports.staziamed import _preferred_dna


def _normalize(text: str) -> str:
    value = unicodedata.normalize("NFKD", text or "")
    value = "".join(char for char in value if not unicodedata.combining(char))
    return " ".join(re.findall(r"[a-z0-9]+", value.lower()))


def _record_text(dna: dict) -> str:
    values = [
        dna.get("topic", ""),
        dna.get("subtopic", ""),
        dna.get("clinical_decision", ""),
        *dna.get("key_concepts", []),
        *dna.get("diagnoses_or_conditions", []),
    ]
    return _normalize(" ".join(str(value) for value in values))


def _text_similarity(left: str, right: str) -> float:
    left_value, right_value = _normalize(left), _normalize(right)
    if not left_value or not right_value:
        return 0.0
    return fuzz.token_set_ratio(left_value, right_value) / 100


def _list_similarity(left: list[str], right: list[str]) -> float:
    return _text_similarity(" ".join(left), " ".join(right))


def _similarity(left: dict, right: dict) -> tuple[float, dict]:
    dna1, dna2 = left["dna"], right["dna"]
    components = {
        "same_primary_area": float(dna1["primary_area"] == dna2["primary_area"]),
        "same_primary_subarea": float(dna1["primary_subarea"] == dna2["primary_subarea"]),
        "same_primary_competency": float(
            dna1["primary_competency"] == dna2["primary_competency"]
        ),
        "same_cognitive_task": float(dna1["cognitive_task"] == dna2["cognitive_task"]),
        "topic_similarity": _text_similarity(
            str(dna1.get("topic", "")), str(dna2.get("topic", ""))
        ),
        "clinical_decision_similarity": _text_similarity(
            str(dna1.get("clinical_decision", "")),
            str(dna2.get("clinical_decision", "")),
        ),
        "key_concepts_similarity": _list_similarity(
            dna1.get("key_concepts", []), dna2.get("key_concepts", [])
        ),
        "diagnoses_similarity": _list_similarity(
            dna1.get("diagnoses_or_conditions", []),
            dna2.get("diagnoses_or_conditions", []),
        ),
        "stem_similarity": max(
            fuzz.ratio(left["stem"], right["stem"]),
            fuzz.token_set_ratio(left["stem"], right["stem"]),
        ) / 100,
    }
    score = (
        0.05 * components["same_primary_area"]
        + 0.15 * components["same_primary_subarea"]
        + 0.05 * components["same_primary_competency"]
        + 0.05 * components["same_cognitive_task"]
        + 0.20 * components["topic_similarity"]
        + 0.18 * components["clinical_decision_similarity"]
        + 0.12 * components["key_concepts_similarity"]
        + 0.10 * components["diagnoses_similarity"]
        + 0.10 * components["stem_similarity"]
    )
    return round(score, 4), components


def _relationship(components: dict) -> str:
    if components["stem_similarity"] >= 0.88:
        return "REPETICAO_QUASE_LITERAL"
    if (
        components["stem_similarity"] >= 0.55
        and components["clinical_decision_similarity"] >= 0.65
    ):
        return "CASO_CLINICO_SEMELHANTE"
    return "GEMEA_TEMATICA"


def find_twins(theme: str | None = None, threshold: float = 0.68, limit: int = 200):
    records = []
    theme_normalized = _normalize(theme or "")
    for exam in list_exam_configs(PROJECT_ROOT):
        master = load_exam_master(exam, PROJECT_ROOT)
        masters = {item["question_number"]: item for item in master["questions"]}
        canonical = json.loads(
            exam.canonical_output_path(PROJECT_ROOT).read_text(encoding="utf-8")
        )
        for item in canonical["questions"]:
            dna = _preferred_dna(item)
            text = _record_text(dna)
            theme_values = [
                dna.get("primary_area", ""),
                dna.get("primary_subarea", ""),
                dna.get("topic", ""),
                dna.get("subtopic", ""),
                *dna.get("key_concepts", []),
                *dna.get("diagnoses_or_conditions", []),
            ]
            if theme_normalized and max(
                fuzz.partial_ratio(theme_normalized, _normalize(str(value)))
                for value in theme_values
                if value
            ) < 75:
                continue
            number = item["question_number"]
            records.append(
                {
                    "exam_id": exam.exam_id,
                    "question_number": number,
                    "id": f"{exam.exam_id}_q{number:03d}",
                    "dna": dna,
                    "text": text,
                    "stem": _normalize(masters[number]["clean_stem"]),
                    "stem_excerpt": masters[number]["clean_stem"][:320],
                }
            )

    pairs = []
    for index, left in enumerate(records):
        for right in records[index + 1 :]:
            if left["exam_id"] == right["exam_id"]:
                continue
            if left["dna"]["primary_area"] != right["dna"]["primary_area"]:
                continue
            score, components = _similarity(left, right)
            if score < threshold:
                continue
            pairs.append(
                {
                    "score": score,
                    "classification": (
                        "GEMEA_FORTE" if score >= 0.85 else "GEMEA_PROVAVEL"
                    ),
                    "relationship_type": _relationship(components),
                    "components": components,
                    "left": {key: left[key] for key in ("id", "exam_id", "question_number", "stem_excerpt")},
                    "right": {key: right[key] for key in ("id", "exam_id", "question_number", "stem_excerpt")},
                    "shared_dna": {
                        field: left["dna"][field]
                        for field in (
                            "primary_area",
                            "primary_subarea",
                            "primary_competency",
                            "cognitive_task",
                        )
                        if left["dna"][field] == right["dna"][field]
                    },
                }
            )
    pairs.sort(key=lambda item: (-item["score"], item["left"]["id"], item["right"]["id"]))
    return pairs[:limit], len(records)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--theme")
    parser.add_argument("--threshold", type=float, default=0.68)
    parser.add_argument("--limit", type=int, default=200)
    parser.add_argument(
        "--output",
        type=Path,
        default=PROJECT_ROOT / "data/processed/reports/twin_questions.json",
    )
    args = parser.parse_args()
    if not 0 <= args.threshold <= 1:
        parser.error("--threshold deve estar entre 0 e 1.")
    if args.limit < 1:
        parser.error("--limit deve ser positivo.")
    pairs, candidates = find_twins(args.theme, args.threshold, args.limit)
    result = {
        "schema_version": "revalida.twin-questions.v1",
        "historical_usage": "COMPARISON_AND_REVERSE_ENGINEERING_ONLY",
        "theme_filter": args.theme,
        "threshold": args.threshold,
        "candidate_questions": candidates,
        "pairs": pairs,
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Questões candidatas: {candidates}")
    print(f"Pares gêmeos: {len(pairs)}")
    print(f"Arquivo: {args.output}")


if __name__ == "__main__":
    main()
