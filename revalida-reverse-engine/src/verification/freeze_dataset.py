import hashlib
import json
from datetime import datetime, timezone
from pathlib import Path


FILES = {
    "master_dataset": Path(
        "data/processed/revalida_2026_1_master.json"
    ),
    "exam_pdf": Path(
        "data/raw/provas/revalida_2026_1_caderno_1.pdf"
    ),
    "answer_key_pdf": Path(
        "data/raw/gabaritos/2026_1_gabarito_definitivo_caderno1.pdf"
    ),
    "answer_key_first_pass": Path(
        "data/processed/revalida_2026_1_gabarito_definitivo.json"
    ),
    "answer_key_second_pass": Path(
        "data/processed/revalida_2026_1_gabarito_second_pass.json"
    ),
    "token_integrity": Path(
        "data/processed/revalida_2026_1_token_integrity.json"
    ),
}


OUTPUT = Path(
    "data/processed/revalida_2026_1_manifest.json"
)


def sha256(path: Path) -> str:
    digest = hashlib.sha256()

    with path.open("rb") as file:
        for chunk in iter(
            lambda: file.read(1024 * 1024),
            b"",
        ):
            digest.update(chunk)

    return digest.hexdigest()


def main():
    missing = [
        str(path)
        for path in FILES.values()
        if not path.exists()
    ]

    if missing:
        raise RuntimeError(
            f"Arquivos ausentes: {missing}"
        )

    manifest = {
        "exam_id": "revalida_2026_1",
        "dataset_version": "1.0.0",
        "status": "FROZEN",
        "created_at_utc": datetime.now(
            timezone.utc
        ).isoformat(),
        "files": {},
    }

    for name, path in FILES.items():
        manifest["files"][name] = {
            "path": str(path),
            "sha256": sha256(path),
            "size_bytes": path.stat().st_size,
        }

    OUTPUT.write_text(
        json.dumps(
            manifest,
            ensure_ascii=False,
            indent=2,
        ),
        encoding="utf-8",
    )

    print()
    print("=" * 78)
    print("DATASET FREEZE")
    print("=" * 78)
    print("Exam: revalida_2026_1")
    print("Versão: 1.0.0")
    print("Status: FROZEN")
    print()

    for name, info in manifest["files"].items():
        print(
            f"{name:<25} "
            f"{info['sha256'][:16]}..."
        )

    print()
    print(f"Manifesto: {OUTPUT}")


if __name__ == "__main__":
    main()
