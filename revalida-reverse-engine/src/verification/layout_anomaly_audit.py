import json
import re
from pathlib import Path


MASTER_PATH = Path(
    "data/processed/revalida_2026_1_master_v1_1.json"
)

OVERRIDES_PATH = Path(
    "data/processed/revalida_2026_1_layout_overrides.json"
)

OUTPUT_PATH = Path(
    "data/processed/revalida_2026_1_layout_anomalies.json"
)


# Frases que sugerem realmente uma tabela/quadro apresentado
# ao candidato, e não apenas menção a exames.
STRONG_TABLE_PATTERNS = [
    r"\ba tabela apresenta\b",
    r"\bquadro abaixo\b",
    r"\btabela abaixo\b",
    r"\bno quadro abaixo\b",
    r"\ba tabela abaixo\b",
    r"\bExame\s+Resultado\s+Valor(?:es)?\s+de\s+[Rr]efer",
    r"\bComponente\s+Resultado\s+Valor\s+de\s+refer",
    r"\bTipo de Câncer\s+N[º°]\s+de casos",
]


# Frases que realmente indicam dependência de uma imagem,
# gráfico ou figura apresentada na questão.
STRONG_VISUAL_PATTERNS = [
    r"\bimagem abaixo\b",
    r"\bimagem a seguir\b",
    r"\bfigura abaixo\b",
    r"\bfigura a seguir\b",
    r"\bgráfico abaixo\b",
    r"\bgráfico a seguir\b",
    r"\bobserve a imagem\b",
    r"\bobserve a figura\b",
    r"\bobserve o gráfico\b",
    r"\brespectiva imagem\b",
    r"\bimagem da lesão\b",
    r"\bimagem apresentada\b",
    r"\bconforme a imagem\b",
    r"\bradiografia abaixo\b",
    r"\beletrocardiograma abaixo\b",
]


PREFIX_PATTERNS = [
    r"^\s*[A-Z]?\d{1,3}\.\s*ITEM\s+\d+",
    r"^\s*ITEM\s+\d+",
    r"^\s*QUEST[ÃA]O\s+\d+",
]


def match_any(patterns, text):
    return [
        pattern
        for pattern in patterns
        if re.search(
            pattern,
            text,
            flags=re.IGNORECASE,
        )
    ]


def main():
    master = json.loads(
        MASTER_PATH.read_text(
            encoding="utf-8"
        )
    )

    if OVERRIDES_PATH.exists():
        override_data = json.loads(
            OVERRIDES_PATH.read_text(
                encoding="utf-8"
            )
        )

        overrides = override_data.get(
            "questions",
            {}
        )

    else:
        overrides = {}

    results = []

    for question in master["questions"]:
        number = question[
            "question_number"
        ]

        stem = question.get(
            "stem",
            ""
        )

        visual = question.get(
            "visual",
            {}
        )

        table_matches = match_any(
            STRONG_TABLE_PATTERNS,
            stem,
        )

        visual_matches = match_any(
            STRONG_VISUAL_PATTERNS,
            stem,
        )

        prefix_matches = match_any(
            PREFIX_PATTERNS,
            stem,
        )

        has_override = (
            str(number) in overrides
        )

        has_assets = visual.get(
            "has_specific_assets",
            False,
        )

        reasons = []

        # Tabela realmente indicada pelo texto
        # e ainda sem regra de layout.
        if (
            table_matches
            and not has_override
        ):
            reasons.append(
                "POSSIBLE_FLATTENED_TABLE"
            )

        # Prefixo editorial nunca deve
        # permanecer no stem limpo.
        if prefix_matches:
            reasons.append(
                "POSSIBLE_METADATA_PREFIX"
            )

        # Só acusa visual ausente quando a linguagem
        # indica que o candidato precisava efetivamente
        # observar uma imagem/figura/gráfico.
        if (
            visual_matches
            and not has_assets
            and not has_override
        ):
            reasons.append(
                "MISSING_REQUIRED_VISUAL_ASSET"
            )

        if reasons:
            results.append(
                {
                    "question_number":
                        number,

                    "reasons":
                        reasons,

                    "has_layout_override":
                        has_override,

                    "has_specific_assets":
                        has_assets,

                    "table_patterns":
                        table_matches,

                    "visual_patterns":
                        visual_matches,

                    "prefix_patterns":
                        prefix_matches,

                    "stem":
                        stem,
                }
            )

    OUTPUT_PATH.write_text(
        json.dumps(
            results,
            ensure_ascii=False,
            indent=2,
        ),
        encoding="utf-8",
    )

    print()
    print("=" * 78)
    print(
        "AUDITORIA DE LAYOUT V2"
    )
    print("=" * 78)

    print(
        f"Questões analisadas: "
        f"{len(master['questions'])}"
    )

    print(
        f"Questões sinalizadas: "
        f"{len(results)}"
    )

    print()

    if not results:
        print(
            "Nenhuma anomalia automática pendente."
        )

    else:
        for item in results:
            print(
                f"Q"
                f"{item['question_number']:03d}"
                f" → "
                f"{', '.join(item['reasons'])}"
            )

    print()
    print(
        f"Relatório: {OUTPUT_PATH}"
    )


if __name__ == "__main__":
    main()
