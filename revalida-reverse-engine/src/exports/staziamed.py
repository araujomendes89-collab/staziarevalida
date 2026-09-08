"""Exporta uma edição em formato estável para o StaziaMed Revalida."""

import hashlib
import json
import shutil
from collections import Counter
from pathlib import Path

from src.config.exams import PROJECT_ROOT, load_exam_master


SCHEMA_VERSION = "staziamed.revalida.question-bank.v1"


def _write_json(path: Path, data) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(path.suffix + ".tmp")
    temporary.write_text(
        json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    temporary.replace(path)


def _write_jsonl(path: Path, records: list[dict]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(path.suffix + ".tmp")
    temporary.write_text(
        "".join(json.dumps(record, ensure_ascii=False) + "\n" for record in records),
        encoding="utf-8",
    )
    temporary.replace(path)


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _resolve_visual_source(asset_file: str, exam, root: Path) -> Path:
    source = Path(asset_file)
    candidates = [source] if source.is_absolute() else [
        root / source,
        exam.assets_dir(root) / source,
        exam.crops_dir(root) / source,
    ]
    for candidate in candidates:
        if candidate.is_file():
            return candidate
    attempted = ", ".join(str(candidate) for candidate in candidates)
    raise RuntimeError(
        f"Recurso visual não encontrado: {asset_file}. Caminhos verificados: "
        f"{attempted}"
    )


def _package_visuals(record: dict, output_dir: Path, root: Path, exam) -> None:
    visual = record.get("visual") or {}
    packaged_assets = []
    for asset in visual.get("assets", []):
        source = _resolve_visual_source(asset["file"], exam, root)
        relative = Path("assets") / source.name
        destination = output_dir / relative
        destination.parent.mkdir(parents=True, exist_ok=True)
        if not destination.exists() or _sha256(destination) != _sha256(source):
            shutil.copy2(source, destination)
        packaged = dict(asset)
        packaged["file"] = relative.as_posix()
        packaged["sha256"] = _sha256(destination)
        packaged_assets.append(packaged)
    visual["assets"] = packaged_assets
    record["visual"] = visual


def _preferred_dna(canonical: dict) -> dict:
    pass1 = canonical["source_dna"]["pass1"]
    pass2 = canonical["source_dna"]["pass2"]
    if pass1.get("review_required") and not pass2.get("review_required"):
        selected = pass2
    elif pass2.get("review_required") and not pass1.get("review_required"):
        selected = pass1
    else:
        confidence = canonical.get("classification_confidence", {})
        selected = pass1 if confidence.get("pass1", 0) >= confidence.get("pass2", 0) else pass2
    result = dict(selected)
    result.update(canonical["controlled_dna"])
    return result


def _build_record(exam, question: dict, canonical: dict | None) -> dict:
    number = question["question_number"]
    active = question["answer_status"] == "VALID"
    dna = _preferred_dna(canonical) if canonical is not None else None
    correct_letter = question["official_answer"] if active else None
    correct_text = (
        question["alternatives"].get(correct_letter, "") if correct_letter else None
    )
    correction = None
    if dna is not None:
        correction = {
            "answer": correct_letter,
            "answer_text": correct_text,
            "explanation": dna["correct_answer_concept"],
            "clinical_decision": dna["clinical_decision"],
            "key_concepts": dna["key_concepts"],
            "diagnoses_or_conditions": dna["diagnoses_or_conditions"],
            "diagnostic_tests": dna["diagnostic_tests"],
            "treatments_or_interventions": dna["treatments_or_interventions"],
        }
    return {
        "schema_version": SCHEMA_VERSION,
        "id": f"{exam.exam_id}_q{number:03d}",
        "source_type": f"OFFICIAL_{exam.exam_family}",
        "exam_id": exam.exam_id,
        "question_number": number,
        "status": (
            "ACTIVE"
            if active
            else (
                "EXCLUDED_STATISTICAL"
                if question["answer_status"] == "EXCLUDED_STATISTICAL"
                else "ANNULLED"
            )
        ),
        "stem": question["clean_stem"],
        "alternatives": question["alternatives"],
        "official_answer": question["official_answer"],
        "correction": correction,
        "dna": dna,
        "visual": question.get("visual", {}),
        "provenance": {
            "dataset_version": exam.dataset_version,
            "answer_key_type": question.get("answer_key_type"),
            "answer_status": question.get("answer_status"),
            "canonical_resolution": (
                canonical.get("resolution_method") if canonical else None
            ),
        },
    }


def _generation_profile(exam, active_records: list[dict]) -> dict:
    fields = (
        "primary_area",
        "primary_subarea",
        "primary_competency",
        "cognitive_task",
        "care_setting",
        "patient_group",
        "urgency_level",
        "question_format",
        "difficulty_estimate",
    )
    distributions = {
        field: dict(Counter(record["dna"][field] for record in active_records))
        for field in fields
    }
    blueprints = []
    combinations = Counter(
        (
            record["dna"]["primary_area"],
            record["dna"]["primary_subarea"],
            record["dna"]["primary_competency"],
            record["dna"]["cognitive_task"],
        )
        for record in active_records
    )
    for values, frequency in combinations.most_common():
        blueprints.append(
            {
                "primary_area": values[0],
                "primary_subarea": values[1],
                "primary_competency": values[2],
                "cognitive_task": values[3],
                "observed_frequency": frequency,
            }
        )
    return {
        "schema_version": "staziamed.revalida.generation-profile.v1",
        "exam_id": exam.exam_id,
        "source_questions": len(active_records),
        "distributions": distributions,
        "blueprints": blueprints,
        "generation_rules": {
            "language": "português do Brasil",
            "alternatives": 4,
            "must_be_original": True,
            "must_not_copy_source_stems": True,
            "requires_current_evidence_packet": True,
            "requires_answer_and_explanation": True,
        },
    }


def validate_staziamed_package(output_dir: Path) -> dict:
    manifest_path = output_dir / "manifest.json"
    if not manifest_path.is_file():
        raise RuntimeError(f"Manifesto StaziaMed ausente: {manifest_path}")
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    active = [
        json.loads(line)
        for line in (output_dir / "questions_active.jsonl")
        .read_text(encoding="utf-8")
        .splitlines()
        if line.strip()
    ]
    all_records = [
        json.loads(line)
        for line in (output_dir / "questions_all.jsonl")
        .read_text(encoding="utf-8")
        .splitlines()
        if line.strip()
    ]
    if len(active) != manifest["active_questions"]:
        raise RuntimeError("Quantidade de questões ativas divergente no pacote.")
    if len(all_records) != manifest["individual_question_files"]:
        raise RuntimeError("Quantidade total de questões divergente no pacote.")
    if len({record["id"] for record in all_records}) != len(all_records):
        raise RuntimeError("O pacote contém IDs de questão duplicados.")
    if len(all_records) != (
        manifest["active_questions"]
        + manifest["annulled_questions"]
        + manifest.get("statistically_excluded_questions", 0)
    ):
        raise RuntimeError(
            "Contagem de ativas, anuladas e excluídas estatisticamente não fecha o total."
        )
    for record in all_records:
        individual = output_dir / "questions" / f"q{record['question_number']:03d}.json"
        if not individual.is_file():
            raise RuntimeError(f"Arquivo individual ausente: {individual}")
    for record in active:
        if record.get("status") != "ACTIVE":
            raise RuntimeError(f"{record.get('id')}: status inválido no arquivo ativo.")
        if not record.get("correction") or not record.get("dna"):
            raise RuntimeError(f"{record['id']}: correção ou DNA ausente.")
        answer = record["official_answer"]
        if answer not in record["alternatives"]:
            raise RuntimeError(f"{record['id']}: resposta não existe nas alternativas.")
        for asset in (record.get("visual") or {}).get("assets", []):
            asset_path = output_dir / asset["file"]
            if not asset_path.is_file():
                raise RuntimeError(f"Recurso visual empacotado ausente: {asset_path}")
            if asset.get("sha256") != _sha256(asset_path):
                raise RuntimeError(f"Hash visual incompatível: {asset_path}")
    profile = json.loads(
        (output_dir / "generation_profile.json").read_text(encoding="utf-8")
    )
    if not isinstance(profile, dict) or not profile.get("blueprints"):
        raise RuntimeError("Perfil de geração ausente ou sem blueprints.")
    return {
        "active_questions": len(active),
        "all_questions": len(all_records),
        "status": "STAZIAMED_PACKAGE_VERIFIED",
    }
def export_staziamed_package(exam, root: Path = PROJECT_ROOT) -> tuple[Path, dict]:
    master = load_exam_master(exam, root)
    canonical_path = exam.canonical_output_path(root)
    if not canonical_path.is_file():
        raise RuntimeError(f"DNA canônico não encontrado: {canonical_path}")
    canonical_data = json.loads(canonical_path.read_text(encoding="utf-8"))
    if canonical_data.get("exam_id") != exam.exam_id:
        raise RuntimeError(f"{canonical_path}: exam_id incompatível.")
    canonical_by_number = {
        item["question_number"]: item for item in canonical_data["questions"]
    }
    if set(canonical_by_number) != set(exam.classifiable_question_numbers):
        raise RuntimeError("DNA canônico não contém todas as questões classificáveis.")

    output_dir = root / "data/exports/staziamed" / exam.exam_id
    records = [
        _build_record(
            exam,
            question,
            canonical_by_number.get(question["question_number"]),
        )
        for question in master["questions"]
    ]
    for record in records:
        _package_visuals(record, output_dir, root, exam)
    active = [record for record in records if record["status"] == "ACTIVE"]
    annulled = [record for record in records if record["status"] == "ANNULLED"]
    statistically_excluded = [
        record for record in records
        if record["status"] == "EXCLUDED_STATISTICAL"
    ]

    _write_jsonl(output_dir / "questions_active.jsonl", active)
    _write_jsonl(output_dir / "questions_all.jsonl", records)
    _write_json(output_dir / "question_bank.json", {
        "schema_version": SCHEMA_VERSION,
        "exam_id": exam.exam_id,
        "dataset_version": exam.dataset_version,
        "active_count": len(active),
        "annulled_count": len(annulled),
        "statistically_excluded_count": len(statistically_excluded),
        "questions": records,
    })
    questions_dir = output_dir / "questions"
    for record in records:
        _write_json(questions_dir / f"q{record['question_number']:03d}.json", record)

    profile = _generation_profile(exam, active)
    _write_json(output_dir / "generation_profile.json", profile)
    manifest = {
        "schema_version": "staziamed.revalida.export-manifest.v1",
        "exam_id": exam.exam_id,
        "active_questions": len(active),
        "annulled_questions": len(annulled),
        "statistically_excluded_questions": len(statistically_excluded),
        "individual_question_files": len(records),
        "files": {
            "question_bank": "question_bank.json",
            "active_jsonl": "questions_active.jsonl",
            "all_jsonl": "questions_all.jsonl",
            "generation_profile": "generation_profile.json",
            "questions_directory": "questions",
        },
    }
    _write_json(output_dir / "manifest.json", manifest)
    validate_staziamed_package(output_dir)
    return output_dir, manifest
