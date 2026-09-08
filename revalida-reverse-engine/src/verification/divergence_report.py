import json
from pathlib import Path


INPUT = Path(
    "data/processed/revalida_2026_1_token_integrity.json"
)

OUTPUT = Path(
    "data/processed/revalida_2026_1_divergences.txt"
)


def describe_component(name, data):
    if data["exact_multiset"]:
        return None

    missing = data.get("missing_tokens", [])
    extra = data.get("extra_tokens", [])

    return {
        "name": name,
        "f1": data["token_f1"],
        "first_count": data["token_count_first"],
        "second_count": data["token_count_second"],
        "missing": missing,
        "extra": extra,
    }


def main():
    data = json.loads(
        INPUT.read_text(encoding="utf-8")
    )

    flagged = [
        q for q in data
        if q["status"] == "VISUAL_CHECK"
    ]

    lines = []

    lines.append("=" * 100)
    lines.append("RELATÓRIO DE DIVERGÊNCIAS — REVALIDA 2026/1")
    lines.append("=" * 100)
    lines.append("")
    lines.append(
        f"Questões marcadas para análise: {len(flagged)}"
    )
    lines.append("")

    for q in flagged:
        differences = []

        stem = describe_component(
            "STEM",
            q["stem"],
        )

        if stem:
            differences.append(stem)

        for letter in "ABCD":
            result = describe_component(
                f"ALTERNATIVA {letter}",
                q["alternatives"][letter],
            )

            if result:
                differences.append(result)

        differences.sort(
            key=lambda x: x["f1"]
        )

        lines.append("")
        lines.append("=" * 100)
        lines.append(
            f"QUESTÃO {q['question_number']:03d}"
        )
        lines.append(
            f"F1 mínimo: {q['minimum_token_f1']:.3f}%"
        )
        lines.append(
            f"Componentes divergentes: {len(differences)}"
        )
        lines.append("-" * 100)

        for diff in differences:
            lines.append("")
            lines.append(
                f"{diff['name']} — F1 {diff['f1']:.3f}%"
            )

            lines.append(
                f"Tokens A/B: "
                f"{diff['first_count']} / "
                f"{diff['second_count']}"
            )

            lines.append(
                "Faltando na segunda extração:"
            )

            if diff["missing"]:
                lines.append(
                    "  " + repr(diff["missing"])
                )
            else:
                lines.append("  []")

            lines.append(
                "Extras na segunda extração:"
            )

            if diff["extra"]:
                lines.append(
                    "  " + repr(diff["extra"])
                )
            else:
                lines.append("  []")

    OUTPUT.write_text(
        "\n".join(lines),
        encoding="utf-8",
    )

    print()
    print(
        f"Questões analisadas: {len(flagged)}"
    )

    print(
        f"Relatório criado: {OUTPUT}"
    )

    print()
    print("Resumo das divergências:")
    print()

    for q in flagged:
        candidates = []

        stem = describe_component(
            "STEM",
            q["stem"],
        )

        if stem:
            candidates.append(stem)

        for letter in "ABCD":
            result = describe_component(
                letter,
                q["alternatives"][letter],
            )

            if result:
                candidates.append(result)

        weakest = min(
            candidates,
            key=lambda x: x["f1"],
        )

        print(
            f"Q{q['question_number']:03d} | "
            f"{weakest['name']:<12} | "
            f"F1={weakest['f1']:6.2f}% | "
            f"faltando={weakest['missing']} | "
            f"extra={weakest['extra']}"
        )


if __name__ == "__main__":
    main()
