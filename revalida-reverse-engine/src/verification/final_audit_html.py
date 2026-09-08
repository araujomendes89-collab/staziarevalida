import html
import json
from pathlib import Path


MASTER_PATH = Path(
    "data/processed/revalida_2026_1_master.json"
)

OUTPUT_PATH = Path(
    "data/processed/auditoria_final_2026_1.html"
)


def esc(value):
    if value is None:
        return ""

    return html.escape(
        str(value)
    )


def build_question_card(question):
    number = question["question_number"]

    correct = question[
        "official_answer"
    ]

    visual = question.get(
        "visual",
        {}
    )

    verification = question.get(
        "verification",
        {}
    )

    crop = visual.get(
        "question_crop"
    )

    if crop:
        crop_path = Path(crop)

        try:
            relative_crop = crop_path.relative_to(
                "data/processed"
            )

            image_src = (
                relative_crop.as_posix()
            )

        except ValueError:
            image_src = crop_path.as_posix()

        image_html = f"""
        <img
            src="{esc(image_src)}"
            class="question-image"
            alt="Questão {number}"
        >
        """
    else:
        image_html = """
        <div class="missing-image">
            Recorte visual não encontrado
        </div>
        """

    alternatives_html = ""

    for letter in "ABCD":
        text = question[
            "alternatives"
        ].get(
            letter,
            ""
        )

        is_correct = (
            letter == correct
        )

        css_class = (
            "alternative correct"
            if is_correct
            else "alternative"
        )

        badge = (
            '<span class="answer-badge">'
            'GABARITO'
            '</span>'
            if is_correct
            else ""
        )

        alternatives_html += f"""
        <div class="{css_class}">
            <div class="letter">
                {letter}
            </div>

            <div class="alternative-text">
                {esc(text)}
            </div>

            {badge}
        </div>
        """

    item_code = (
        question.get("item_code")
        or "—"
    )

    version_code = (
        question.get("version_code")
        or "—"
    )

    page_start = question.get(
        "page_start",
        "—"
    )

    page_end = question.get(
        "page_end",
        "—"
    )

    if (
        page_start
        and page_end
        and page_start != page_end
    ):
        page_label = (
            f"{page_start}–{page_end}"
        )
    else:
        page_label = page_start

    text_status = verification.get(
        "text",
        "—"
    )

    token_status = verification.get(
        "token_integrity",
        "—"
    )

    answer_status = verification.get(
        "answer_key",
        "—"
    )

    return f"""
    <section
        class="question-card"
        id="q{number:03d}"
    >

        <div class="question-header">

            <div>
                <div class="question-number">
                    QUESTÃO {number}
                </div>

                <div class="metadata">
                    ITEM {esc(item_code)}
                    &nbsp;•&nbsp;
                    V. {esc(version_code)}
                    &nbsp;•&nbsp;
                    Página {esc(page_label)}
                </div>
            </div>

            <div class="official-answer">
                Gabarito
                <strong>
                    {esc(correct)}
                </strong>
            </div>

        </div>

        <div class="question-body">

            <div class="source-panel">

                <div class="panel-title">
                    ORIGINAL DO PDF
                </div>

                <div class="image-wrapper">
                    {image_html}
                </div>

            </div>

            <div class="structured-panel">

                <div class="panel-title">
                    EXTRAÇÃO ESTRUTURADA
                </div>

                <div class="stem">
                    {esc(question["stem"])}
                </div>

                <div class="alternatives">
                    {alternatives_html}
                </div>

                <div class="verification">

                    <span>
                        Texto:
                        <strong>
                            {esc(text_status)}
                        </strong>
                    </span>

                    <span>
                        Tokens:
                        <strong>
                            {esc(token_status)}
                        </strong>
                    </span>

                    <span>
                        Gabarito:
                        <strong>
                            {esc(answer_status)}
                        </strong>
                    </span>

                </div>

            </div>

        </div>

        <div class="card-footer">

            <a href="#top">
                ↑ voltar ao topo
            </a>

            {
                f'<a href="#q{number + 1:03d}">'
                f'próxima →'
                f'</a>'
                if number < 100
                else ''
            }

        </div>

    </section>
    """


def main():
    if not MASTER_PATH.exists():
        raise FileNotFoundError(
            f"Dataset não encontrado: "
            f"{MASTER_PATH}"
        )

    data = json.loads(
        MASTER_PATH.read_text(
            encoding="utf-8"
        )
    )

    questions = data[
        "questions"
    ]

    if len(questions) != 100:
        raise RuntimeError(
            f"Esperadas 100 questões, "
            f"encontradas {len(questions)}."
        )

    navigation = ""

    for q in questions:
        number = q[
            "question_number"
        ]

        navigation += (
            f'<a href="#q{number:03d}">'
            f'{number}'
            f'</a>'
        )

    cards = "\n".join(
        build_question_card(q)
        for q in questions
    )

    document = f"""<!DOCTYPE html>
<html lang="pt-BR">

<head>

<meta charset="utf-8">

<meta
    name="viewport"
    content="width=device-width, initial-scale=1"
>

<title>
    Auditoria Final — Revalida 2026/1
</title>

<style>

* {{
    box-sizing: border-box;
}}

body {{
    margin: 0;
    background: #f2f4f7;
    color: #17202a;
    font-family:
        -apple-system,
        BlinkMacSystemFont,
        "Segoe UI",
        Arial,
        sans-serif;
}}

.top {{
    background: white;
    border-bottom: 1px solid #dfe4ea;
    padding: 24px;
    position: sticky;
    top: 0;
    z-index: 100;
}}

.top h1 {{
    margin: 0 0 6px 0;
    font-size: 22px;
}}

.subtitle {{
    color: #667085;
    font-size: 14px;
}}

.navigation {{
    display: flex;
    flex-wrap: wrap;
    gap: 5px;
    margin-top: 16px;
}}

.navigation a {{
    display: flex;
    align-items: center;
    justify-content: center;
    width: 31px;
    height: 31px;
    border-radius: 6px;
    background: #eef2f6;
    color: #344054;
    text-decoration: none;
    font-size: 12px;
    font-weight: 600;
}}

.navigation a:hover {{
    background: #dfe7ef;
}}

.container {{
    max-width: 1500px;
    margin: 0 auto;
    padding: 28px;
}}

.question-card {{
    background: white;
    border: 1px solid #dfe4ea;
    border-radius: 12px;
    margin-bottom: 30px;
    overflow: hidden;
    box-shadow:
        0 2px 7px
        rgba(0,0,0,0.05);
}}

.question-header {{
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 20px;
    padding: 18px 22px;
    border-bottom: 1px solid #e5e7eb;
}}

.question-number {{
    font-weight: 800;
    font-size: 20px;
}}

.metadata {{
    margin-top: 5px;
    color: #667085;
    font-size: 13px;
}}

.official-answer {{
    flex-shrink: 0;
    border: 1px solid #a6d8b5;
    background: #ecf9f0;
    border-radius: 9px;
    padding: 8px 12px;
    font-size: 13px;
}}

.official-answer strong {{
    display: inline-flex;
    margin-left: 7px;
    background: #147a38;
    color: white;
    width: 28px;
    height: 28px;
    align-items: center;
    justify-content: center;
    border-radius: 50%;
    font-size: 16px;
}}

.question-body {{
    display: grid;
    grid-template-columns:
        minmax(0, 1fr)
        minmax(0, 1fr);
    min-height: 600px;
}}

.source-panel,
.structured-panel {{
    min-width: 0;
}}

.source-panel {{
    border-right: 1px solid #e5e7eb;
    background: #f7f8fa;
}}

.panel-title {{
    padding: 11px 16px;
    font-size: 11px;
    font-weight: 800;
    letter-spacing: 0.08em;
    color: #667085;
    border-bottom: 1px solid #e5e7eb;
}}

.image-wrapper {{
    overflow: auto;
    max-height: 850px;
    padding: 18px;
    text-align: center;
}}

.question-image {{
    max-width: 100%;
    height: auto;
    background: white;
    box-shadow:
        0 1px 5px
        rgba(0,0,0,0.12);
}}

.missing-image {{
    padding: 60px;
    color: #b42318;
}}

.structured-panel {{
    padding-bottom: 20px;
}}

.stem {{
    padding: 22px;
    line-height: 1.6;
    font-size: 16px;
    white-space: normal;
}}

.alternatives {{
    padding: 0 22px;
}}

.alternative {{
    display: grid;
    grid-template-columns:
        38px 1fr auto;
    gap: 12px;
    align-items: start;
    border: 1px solid #e3e6ea;
    border-radius: 9px;
    padding: 13px;
    margin-bottom: 10px;
    line-height: 1.45;
}}

.alternative.correct {{
    border: 2px solid #35a45b;
    background: #effaf2;
}}

.letter {{
    display: flex;
    align-items: center;
    justify-content: center;
    width: 31px;
    height: 31px;
    border-radius: 50%;
    background: #eef1f4;
    font-weight: 800;
}}

.correct .letter {{
    background: #208846;
    color: white;
}}

.alternative-text {{
    padding-top: 4px;
}}

.answer-badge {{
    display: inline-block;
    background: #208846;
    color: white;
    border-radius: 5px;
    padding: 4px 7px;
    font-size: 10px;
    font-weight: 800;
    letter-spacing: .05em;
}}

.verification {{
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin: 22px;
    padding: 13px;
    background: #f6f8fa;
    border-radius: 8px;
    font-size: 11px;
}}

.verification span {{
    border: 1px solid #dfe4ea;
    border-radius: 5px;
    padding: 5px 7px;
    background: white;
}}

.card-footer {{
    display: flex;
    justify-content: space-between;
    border-top: 1px solid #e5e7eb;
    padding: 12px 20px;
}}

.card-footer a {{
    color: #175cd3;
    text-decoration: none;
    font-size: 13px;
}}

@media (
    max-width: 900px
) {{

    .question-body {{
        grid-template-columns: 1fr;
    }}

    .source-panel {{
        border-right: 0;
        border-bottom:
            1px solid #e5e7eb;
    }}

}}

</style>

</head>

<body>

<header
    class="top"
    id="top"
>

    <h1>
        Auditoria Final — Revalida 2026/1
    </h1>

    <div class="subtitle">
        Questão original × extração estruturada × gabarito definitivo
    </div>

    <nav class="navigation">
        {navigation}
    </nav>

</header>

<main class="container">
    {cards}
</main>

</body>
</html>
"""

    OUTPUT_PATH.write_text(
        document,
        encoding="utf-8",
    )

    print()
    print("=" * 78)
    print("AUDITORIA FINAL")
    print("=" * 78)

    print(
        f"Questões: "
        f"{len(questions)}"
    )

    print(
        f"HTML: {OUTPUT_PATH}"
    )

    print()
    print(
        "STATUS: AUDIT_HTML_READY"
    )


if __name__ == "__main__":
    main()
