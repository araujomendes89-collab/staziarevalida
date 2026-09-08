import copy
import json
from pathlib import Path


MASTER_PATH = Path(
    "data/processed/revalida_2026_1_master.json"
)

VISUAL_PATH = Path(
    "data/processed/revalida_2026_1_visual_assets_v2.json"
)

OUTPUT_PATH = Path(
    "data/processed/revalida_2026_1_master_v1_1.json"
)


def main():
    master = json.loads(
        MASTER_PATH.read_text(
            encoding="utf-8"
        )
    )

    visual = json.loads(
        VISUAL_PATH.read_text(
            encoding="utf-8"
        )
    )

    enriched = copy.deepcopy(master)

    visual_map = {
        q["question_number"]: q
        for q in visual["questions"]
    }

    specific_count = 0
    asset_count = 0

    for question in enriched["questions"]:
        number = question["question_number"]

        visual_data = visual_map.get(
            number,
            {}
        )

        assets = visual_data.get(
            "assets",
            []
        )

        original = visual_data.get(
            "question_original"
        )

        if assets:
            specific_count += 1
            asset_count += len(assets)

        question["visual"] = {
            "question_original":
                original,

            "visual_source_preserved":
                bool(original),

            "has_specific_assets":
                bool(assets),

            "asset_count":
                len(assets),

            "assets":
                assets,
        }

    enriched["exam"][
        "dataset_version"
    ] = "1.1.0"

    enriched["verification"][
        "visual_layer"
    ] = "VISUAL_ASSETS_EXTRACTED"

    enriched["verification"][
        "visual_manifest_version"
    ] = visual.get(
        "visual_manifest_version"
    )

    enriched["verification"][
        "specific_visual_questions"
    ] = specific_count

    enriched["verification"][
        "specific_visual_assets"
    ] = asset_count

    OUTPUT_PATH.write_text(
        json.dumps(
            enriched,
            ensure_ascii=False,
            indent=2,
        ),
        encoding="utf-8",
    )

    print()
    print("=" * 78)
    print("DATASET VISUAL ENRICHMENT")
    print("=" * 78)

    print(
        f"Questões: "
        f"{len(enriched['questions'])}"
    )

    print(
        f"Questões com assets específicos: "
        f"{specific_count}"
    )

    print(
        f"Assets específicos: "
        f"{asset_count}"
    )

    missing_original = [
        q["question_number"]
        for q in enriched["questions"]
        if not q["visual"][
            "visual_source_preserved"
        ]
    ]

    print(
        f"Recortes originais ausentes: "
        f"{missing_original}"
    )

    print()
    print(
        "Versão: 1.1.0"
    )

    print(
        "STATUS: VISUAL_DATASET_READY"
    )

    print()
    print(
        f"Arquivo: {OUTPUT_PATH}"
    )


if __name__ == "__main__":
    main()
