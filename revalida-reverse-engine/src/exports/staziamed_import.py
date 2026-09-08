"""Consolida todas as edições verificadas em um pacote único de importação."""

import hashlib
import json
import shutil
from datetime import datetime, timezone
from pathlib import Path

from src.config.exams import PROJECT_ROOT, list_exam_configs
from src.exports.staziamed import validate_staziamed_package


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _atomic_text(path: Path, content: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(path.suffix + ".tmp")
    temporary.write_text(content, encoding="utf-8")
    temporary.replace(path)


def _read_jsonl(path: Path) -> list[dict]:
    return [
        json.loads(line)
        for line in path.read_text(encoding="utf-8").splitlines()
        if line.strip()
    ]


def build_staziamed_import_package(
    output_dir: Path,
    root: Path = PROJECT_ROOT,
):
    active_records = []
    all_records = []
    editions = []
    asset_hashes = {}
    seen_ids = set()
    for exam in list_exam_configs(root):
        source_dir = root / "data/exports/staziamed" / exam.exam_id
        verified = validate_staziamed_package(source_dir)
        manifest = json.loads((source_dir / "manifest.json").read_text(encoding="utf-8"))
        edition_all = _read_jsonl(source_dir / "questions_all.jsonl")
        for record in edition_all:
            if record["id"] in seen_ids:
                raise RuntimeError(f"ID duplicado no pacote consolidado: {record['id']}")
            seen_ids.add(record["id"])
            clone = json.loads(json.dumps(record, ensure_ascii=False))
            for asset in (clone.get("visual") or {}).get("assets", []):
                source = source_dir / asset["file"]
                relative = Path("assets") / exam.exam_id / source.name
                destination = output_dir / relative
                destination.parent.mkdir(parents=True, exist_ok=True)
                if not destination.is_file() or _sha256(destination) != _sha256(source):
                    shutil.copy2(source, destination)
                asset["file"] = relative.as_posix()
                asset["sha256"] = _sha256(destination)
                asset_hashes[relative.as_posix()] = asset["sha256"]
            all_records.append(clone)
            if clone["status"] == "ACTIVE":
                active_records.append(clone)
        editions.append(
            {
                "exam_id": exam.exam_id,
                "exam_name": exam.exam_name,
                "exam_family": exam.exam_family,
                "exam_year": exam.exam_year,
                "exam_edition": exam.exam_edition,
                "dataset_version": exam.dataset_version,
                "active_questions": verified["active_questions"],
                "all_questions": verified["all_questions"],
                "source_manifest": manifest,
            }
        )

    active_path = output_dir / "questions_active.jsonl"
    all_path = output_dir / "questions_all.jsonl"
    editions_path = output_dir / "editions.json"
    _atomic_text(
        active_path,
        "".join(json.dumps(item, ensure_ascii=False) + "\n" for item in active_records),
    )
    _atomic_text(
        all_path,
        "".join(json.dumps(item, ensure_ascii=False) + "\n" for item in all_records),
    )
    _atomic_text(editions_path, json.dumps(editions, ensure_ascii=False, indent=2))
    manifest = {
        "schema_version": "staziamed.revalida.import-package.v1",
        "status": "READY_FOR_STAZIAMED_IMPORT",
        "created_at_utc": datetime.now(timezone.utc).isoformat(),
        "edition_count": len(editions),
        "active_question_count": len(active_records),
        "all_question_count": len(all_records),
        "asset_count": len(asset_hashes),
        "historical_usage": "RECURRENCE_AND_REVERSE_ENGINEERING_ONLY",
        "tri_applied_to_historical_items": False,
        "files": {
            "questions_active.jsonl": _sha256(active_path),
            "questions_all.jsonl": _sha256(all_path),
            "editions.json": _sha256(editions_path),
        },
        "assets": dict(sorted(asset_hashes.items())),
    }
    manifest_path = output_dir / "manifest.json"
    _atomic_text(manifest_path, json.dumps(manifest, ensure_ascii=False, indent=2))
    validate_staziamed_import_package(output_dir)
    return output_dir, manifest


def validate_staziamed_import_package(output_dir: Path):
    manifest = json.loads((output_dir / "manifest.json").read_text(encoding="utf-8"))
    active = _read_jsonl(output_dir / "questions_active.jsonl")
    all_records = _read_jsonl(output_dir / "questions_all.jsonl")
    if len(active) != manifest["active_question_count"]:
        raise RuntimeError("Contagem ativa divergente no pacote consolidado.")
    if len(all_records) != manifest["all_question_count"]:
        raise RuntimeError("Contagem total divergente no pacote consolidado.")
    if len({item["id"] for item in all_records}) != len(all_records):
        raise RuntimeError("Há IDs duplicados no pacote consolidado.")
    if any(item["status"] != "ACTIVE" for item in active):
        raise RuntimeError("O arquivo ativo contém questão não ativa.")
    for name, digest in manifest["files"].items():
        if _sha256(output_dir / name) != digest:
            raise RuntimeError(f"Hash divergente no arquivo de importação: {name}")
    for relative, digest in manifest["assets"].items():
        path = output_dir / relative
        if not path.is_file() or _sha256(path) != digest:
            raise RuntimeError(f"Imagem ausente ou divergente: {relative}")
    return manifest

