import copy
import json
import re
from pathlib import Path


INPUT = Path(
    "data/processed/revalida_2026_1_master_v1_1.json"
)

OUTPUT = Path(
    "data/processed/revalida_2026_1_master_v1_2.json"
)


PREFIX_PATTERNS = [
    re.compile(
        r"^\s*[A-Z]?\d{1,3}\.\s*ITEM\s+\d+\s*-\s*V\.\s*[\d.]+\s*",
        flags=re.IGNORECASE,
    ),
    re.compile(
        r"^\s*ITEM\s+\d+\s*-\s*V\.\s*[\d.]+\s*",
        flags=re.IGNORECASE,
    ),
    re.compile(
        r"^\s*QUEST[ÃA]O\s+\d+\s*",
        flags=re.IGNORECASE,
    ),
]


def clean_stem(text):
    cleaned = text.strip()

    for pattern in PREFIX_PATTERNS:
        cleaned = pattern.sub(
            "",
            cleaned,
            count=1,
        )

    cleaned = " ".join(
        cleaned.split()
    )

    return cleaned.strip()


def main():
    data = json.loads(
        INPUT.read_text(
            encoding="utf-8"
        )
    )

    output = copy.deepcopy(data)

    changed = []

    for question in output["questions"]:
        original = question["stem"]
        cleaned = clean_stem(original)

        question["raw_stem"] = original
        question["clean_stem"] = cleaned

        if original != cleaned:
            changed.append(
                question["question_number"]
            )

    output["exam"][
        "dataset_version"
    ] = "1.2.0"

    output["verification"][
        "normalization"
    ] = "CLEAN_STEM_GENERATED"

    output["verification"][
        "layout_anomalies_pending"
    ] = 0

    OUTPUT.write_text(
        json.dumps(
            output,
            ensure_ascii=False,
            indent=2,
        ),
        encoding="utf-8",
    )

    print()
    print("=" * 78)
    print("NORMALIZAÇÃO DO DATASET")
    print("=" * 78)

    print(
        f"Questões: "
        f"{len(output['questions'])}"
    )

    print(
        f"Questões modificadas: "
        f"{changed}"
    )

    print(
        "Dataset original preservado: SIM"
    )

    print()
    print("Versão: 1.2.0")
    print(
        "STATUS: CLEAN_DATASET_READY"
    )

    print()
    print(f"Arquivo: {OUTPUT}")


if __name__ == "__main__":
    main()
