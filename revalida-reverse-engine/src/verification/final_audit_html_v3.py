import html
import json
from pathlib import Path


MASTER_PATH = Path(
    "data/processed/revalida_2026_1_master_v1_1.json"
)

OUTPUT_PATH = Path(
    "data/processed/auditoria_final_2026_1_v3.html"
)

ASSET_DIR = Path(
    "data/processed/visual_assets_v2/revalida_2026_1"
)


def esc(value):
    if value is None:
        return ""
    return html.escape(str(value))


def html_src(path):
    """
    Converte um caminho do projeto para caminho
    relativo ao HTML salvo em data/processed/.
    """
    path = Path(path)

    try:
        return path.relative_to(
            OUTPUT_PATH.parent
        ).as_posix()
    except ValueError:
        return path.as_posix()


def asset_src(filename):
    path = ASSET_DIR / filename
    return html_src(path)


def build_assets(question):
    visual = question.get(
        "visual",
        {}
    )

    assets = visual.get(
        "assets",
        []
    )

    if not assets:
        return """
        <div class="no-assets">
            Nenhum asset visual específico isolado.
            O conteúdo visual completo permanece preservado
            no recorte original da questão.
        </div>
        """

    blocks = []

    for asset in assets:
        asset_type = asset.get(
            "asset_type",
            "VISUAL"
        )

        filename = asset.get(
            "file"
        )

        page = asset.get(
            "source_page",
            "—"
        )

        source_kind = asset.get(
            "source_kind",
            "—"
        )

        if filename:
            image = f"""
            <img
                class="asset-image"
                src="{esc(asset_src(filename))}"
                alt="{esc(asset_type)}"
            >
            """
        else:
            image = """
            <div class="missing">
                Arquivo não encontrado
            </div>
            """

        table_data = asset.get(
            "table_data"
        )

        table_html = ""

        if table_data:
            rows = []

            for row in table_data:
                cells = "".join(
                    f"<td>{esc(cell)}</td>"
                    for cell in row
                )

                rows.append(
                    f"<tr>{cells}</tr>"
                )

            table_html = f"""
            <div class="table-data-title">
                Dados estruturados da tabela
            </div>

            <div class="table-scroll">
                <table>
                    {''.join(rows)}
                </table>
            </div>
            """

        blocks.append(
            f"""
            <div class="asset-card">

                <div class="asset-header">
                    <strong>
                        {esc(asset_type)}
                    </strong>

                    <span>
                        Página {esc(page)}
                        · {esc(source_kind)}
                    </span>
                </div>

                <div class="asset-body">
                    {image}
                    {table_html}
                </div>

            </div>
            """
        )

    return "".join(blocks)


def build_inline_assets(question):
    visual = question.get(
        "visual",
        {}
    )

    assets = visual.get(
        "assets",
        []
    )

    if not assets:
        return ""

    # Mantém a ordem vertical original do PDF.
    assets = sorted(
        assets,
        key=lambda item:
            item.get(
                "bbox",
                {}
            ).get(
                "y0",
                0
            )
    )

    blocks = []

    for asset in assets:
        filename = asset.get(
            "file"
        )

        if not filename:
            continue

        asset_type = asset.get(
            "asset_type",
            "VISUAL"
        )

        image_path = asset_src(
            filename
        )

        css_type = (
            asset_type
            .lower()
            .replace("_", "-")
        )

        image = f"""
        <div class="inline-asset {css_type}">

            <img
                src="{esc(image_path)}"
                class="inline-asset-image"
                alt="{esc(asset_type)}"
            >

            <div class="inline-asset-caption">
                {esc(asset_type.replace("_", " "))}
            </div>

        </div>
        """

        blocks.append(image)

        table_data = asset.get(
            "table_data"
        )

        if table_data:
            rows = []

            for row in table_data:
                cells = "".join(
                    f"<td>{esc(cell)}</td>"
                    for cell in row
                )

                rows.append(
                    f"<tr>{cells}</tr>"
                )

            blocks.append(
                f"""
                <div class="inline-table-wrapper">
                    <table class="inline-table">
                        {''.join(rows)}
                    </table>
                </div>
                """
            )

    if not blocks:
        return ""

    return (
        '<div class="inline-assets">'
        + "".join(blocks)
        + '</div>'
    )


def build_question(question):
    number = question[
        "question_number"
    ]

    correct = question[
        "official_answer"
    ]

    visual = question.get(
        "visual",
        {}
    )

    original = visual.get(
        "question_original"
    )

    if original:
        original_html = f"""
        <img
            class="original-image"
            src="{esc(html_src(original))}"
            alt="Questão {number}"
        >
        """
    else:
        original_html = """
        <div class="missing">
            Recorte original ausente
        </div>
        """

    alternatives = ""

    for letter in "ABCD":
        text = question[
            "alternatives"
        ].get(
            letter,
            ""
        )

        correct_class = (
            " correct"
            if letter == correct
            else ""
        )

        badge = (
            '<span class="badge">GABARITO</span>'
            if letter == correct
            else ""
        )

        alternatives += f"""
        <div class="alternative{correct_class}">
            <div class="letter">
                {letter}
            </div>

            <div class="alt-text">
                {esc(text)}
            </div>

            {badge}
        </div>
        """

    verification = question.get(
        "verification",
        {}
    )

    inline_assets_html = (
        build_inline_assets(
            question
        )
    )

    return f"""
    <section
        class="question"
        id="q{number:03d}"
    >

        <header class="question-header">

            <div>
                <div class="qtitle">
                    QUESTÃO {number}
                </div>

                <div class="metadata">
                    ITEM {esc(question.get('item_code') or '—')}
                    · V. {esc(question.get('version_code') or '—')}
                    · Página {esc(question.get('page_start'))}
                </div>
            </div>

            <div class="answer-box">
                Gabarito
                <strong>
                    {esc(correct)}
                </strong>
            </div>

        </header>

        <div class="main-grid">

            <div class="original-panel">

                <div class="panel-title">
                    ORIGINAL DA QUESTÃO
                </div>

                <div class="original-scroll">
                    {original_html}
                </div>

            </div>

            <div class="structured-panel">

                <div class="panel-title">
                    EXTRAÇÃO ESTRUTURADA
                </div>

                <div class="stem">
                    {esc(question['stem'])}
                </div>

                {inline_assets_html}

                <div class="alternatives">
                    {alternatives}
                </div>

                <details class="technical-details">

                    <summary>
                        Detalhes técnicos
                    </summary>

                    <div class="technical-content">

                        <div>
                            <span>Texto</span>
                            <strong>
                                {esc(
                                    verification.get(
                                        'text',
                                        '—'
                                    )
                                )}
                            </strong>
                        </div>

                        <div>
                            <span>Integridade</span>
                            <strong>
                                {esc(
                                    verification.get(
                                        'token_integrity',
                                        '—'
                                    )
                                )}
                            </strong>
                        </div>

                        <div>
                            <span>Gabarito</span>
                            <strong>
                                {esc(
                                    verification.get(
                                        'answer_key',
                                        '—'
                                    )
                                )}
                            </strong>
                        </div>

                    </div>

                </details>

            </div>

        </div>

        <footer class="footer">

            <a href="#top">
                ↑ topo
            </a>

            {
                f'<a href="#q{number + 1:03d}">'
                f'próxima questão →'
                f'</a>'
                if number < 100
                else ''
            }

        </footer>

    </section>
    """


def main():
    data = json.loads(
        MASTER_PATH.read_text(
            encoding="utf-8"
        )
    )

    questions = data[
        "questions"
    ]

    navigation = "".join(
        f'<a href="#q{q["question_number"]:03d}">'
        f'{q["question_number"]}'
        f'</a>'
        for q in questions
    )

    cards = "\n".join(
        build_question(q)
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
Auditoria Visual V3 — Revalida 2026/1
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
    position: sticky;
    top: 0;
    z-index: 100;
    background: white;
    border-bottom: 1px solid #ddd;
    padding: 18px 24px;
}}

.top h1 {{
    margin: 0;
    font-size: 21px;
}}

.top p {{
    margin: 5px 0 0;
    color: #667085;
    font-size: 13px;
}}

.nav {{
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    margin-top: 12px;
}}

.nav a {{
    width: 29px;
    height: 29px;
    display: flex;
    align-items: center;
    justify-content: center;
    text-decoration: none;
    background: #eef2f6;
    color: #344054;
    border-radius: 5px;
    font-size: 11px;
    font-weight: 700;
}}

.container {{
    max-width: 1500px;
    margin: 0 auto;
    padding: 24px;
}}

.question {{
    background: white;
    border: 1px solid #dfe4ea;
    border-radius: 12px;
    overflow: hidden;
    margin-bottom: 32px;
    box-shadow:
        0 2px 8px
        rgba(0,0,0,.05);
}}

.question-header {{
    padding: 17px 20px;
    display: flex;
    justify-content: space-between;
    align-items: center;
    border-bottom:
        1px solid #e5e7eb;
}}

.qtitle {{
    font-size: 20px;
    font-weight: 800;
}}

.metadata {{
    color: #667085;
    font-size: 12px;
    margin-top: 4px;
}}

.answer-box {{
    background: #eefaf1;
    border: 1px solid #a7d9b5;
    border-radius: 8px;
    padding: 7px 10px;
    font-size: 12px;
}}

.answer-box strong {{
    margin-left: 7px;
    background: #1d7f42;
    color: white;
    border-radius: 50%;
    width: 28px;
    height: 28px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    font-size: 16px;
}}

.main-grid {{
    display: grid;
    grid-template-columns:
        minmax(0, 1fr)
        minmax(0, 1fr);
}}

.original-panel {{
    background: #f8f9fb;
    border-right:
        1px solid #e5e7eb;
}}

.panel-title,
.assets-title {{
    font-size: 11px;
    font-weight: 800;
    letter-spacing: .07em;
    color: #667085;
    padding: 11px 15px;
    border-bottom:
        1px solid #e5e7eb;
}}

.original-scroll {{
    padding: 15px;
    text-align: center;
    overflow: auto;
    max-height: 850px;
}}

.original-image {{
    max-width: 100%;
    height: auto;
    background: white;
    box-shadow:
        0 1px 5px
        rgba(0,0,0,.12);
}}

.stem {{
    padding: 20px;
    font-size: 15px;
    line-height: 1.55;
}}

.alternatives {{
    padding: 0 20px 20px;
}}

.alternative {{
    display: grid;
    grid-template-columns:
        36px 1fr auto;
    gap: 10px;
    padding: 12px;
    border: 1px solid #e1e5ea;
    border-radius: 8px;
    margin-bottom: 9px;
    line-height: 1.4;
}}

.alternative.correct {{
    border: 2px solid #32a15a;
    background: #effaf2;
}}

.letter {{
    width: 29px;
    height: 29px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: #eef1f4;
    border-radius: 50%;
    font-weight: 800;
}}

.correct .letter {{
    background: #208846;
    color: white;
}}

.alt-text {{
    padding-top: 3px;
}}

.badge {{
    background: #208846;
    color: white;
    font-size: 9px;
    font-weight: 800;
    padding: 4px 6px;
    border-radius: 4px;
    height: fit-content;
}}

.technical-details {{
    margin: 4px 20px 20px;
    border-top: 1px solid #eef0f2;
    padding-top: 10px;
}}

.technical-details summary {{
    cursor: pointer;
    color: #7a828d;
    font-size: 11px;
    user-select: none;
}}

.technical-details summary:hover {{
    color: #344054;
}}

.technical-content {{
    margin-top: 10px;
    padding: 10px 12px;
    background: #f8f9fb;
    border: 1px solid #e5e7eb;
    border-radius: 7px;
    font-size: 10px;
}}

.technical-content div {{
    display: flex;
    justify-content: space-between;
    gap: 15px;
    padding: 4px 0;
}}

.technical-content span {{
    color: #667085;
}}

.technical-content strong {{
    color: #344054;
    font-weight: 600;
}}


.assets-section {{
    border-top:
        1px solid #e5e7eb;
}}

.assets-grid {{
    padding: 18px;
    display: grid;
    grid-template-columns:
        repeat(
            auto-fit,
            minmax(280px, 1fr)
        );
    gap: 16px;
}}

.asset-card {{
    border: 1px solid #dfe4ea;
    border-radius: 9px;
    overflow: hidden;
}}

.asset-header {{
    background: #f7f8fa;
    border-bottom: 1px solid #ddd;
    padding: 9px 12px;
    display: flex;
    justify-content: space-between;
    gap: 10px;
    font-size: 11px;
}}

.asset-header span {{
    color: #667085;
}}

.asset-body {{
    padding: 12px;
    text-align: center;
}}

.asset-image {{
    max-width: 100%;
    max-height: 600px;
    object-fit: contain;
}}

.no-assets {{
    padding: 18px;
    background: #fafafa;
    border: 1px dashed #ccc;
    border-radius: 7px;
    color: #667085;
    font-size: 12px;
    grid-column: 1 / -1;
}}

.table-data-title {{
    margin-top: 14px;
    font-weight: 700;
    font-size: 12px;
    text-align: left;
}}

.table-scroll {{
    overflow-x: auto;
    margin-top: 7px;
}}

table {{
    width: 100%;
    border-collapse: collapse;
    font-size: 11px;
}}

td {{
    border: 1px solid #ddd;
    padding: 5px;
    text-align: left;
}}

.footer {{
    display: flex;
    justify-content: space-between;
    padding: 11px 18px;
    border-top:
        1px solid #e5e7eb;
}}

.footer a {{
    color: #175cd3;
    text-decoration: none;
    font-size: 12px;
}}

.missing {{
    color: #b42318;
    padding: 30px;
}}

.inline-assets {{
    padding:
        0 24px
        20px 24px;

    display: flex;
    flex-direction: column;
    align-items: center;

    gap: 14px;
}}

.inline-asset {{
    width: 100%;
    display: flex;
    flex-direction: column;
    align-items: center;

    margin:
        4px 0
        14px 0;
}}

.inline-asset-image {{
    display: block;

    max-width: 72%;
    max-height: 520px;

    width: auto;
    height: auto;

    object-fit: contain;

    background: white;
}}

.inline-asset.clinical-image
.inline-asset-image {{
    max-width: 68%;
}}

.inline-asset.radiology
.inline-asset-image {{
    max-width: 78%;
}}

.inline-asset.ecg
.inline-asset-image {{
    max-width: 92%;
}}

.inline-asset.diagram
.inline-asset-image {{
    max-width: 82%;
}}

.inline-asset-caption {{
    margin-top: 6px;

    font-size: 9px;
    color: #858b94;

    text-align: center;

    text-transform: uppercase;
    letter-spacing: .04em;
}}

.inline-table-wrapper {{
    width: 92%;

    overflow-x: auto;

    margin:
        4px auto
        18px auto;
}}

.inline-table {{
    width: 100%;

    border-collapse:
        collapse;

    font-size: 11px;
}}

.inline-table td {{
    border:
        1px solid #9fa7b2;

    padding:
        5px 7px;

    text-align:
        center;
}}


@media (
    max-width: 900px
) {{

    .main-grid {{
        grid-template-columns: 1fr;
    }}

    .original-panel {{
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
        Auditoria Visual V3 — Revalida 2026/1
    </h1>

    <p>
        Original × extração × gabarito × assets visuais
    </p>

    <nav class="nav">
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
        encoding="utf-8"
    )

    questions_with_assets = sum(
        1
        for q in questions
        if q.get(
            "visual",
            {}
        ).get(
            "has_specific_assets",
            False
        )
    )

    print()
    print("=" * 78)
    print("AUDITORIA VISUAL V3 — ESTILO INEP")
    print("=" * 78)

    print(
        f"Questões: "
        f"{len(questions)}"
    )

    print(
        f"Questões com assets: "
        f"{questions_with_assets}"
    )

    print()
    print(
        f"Arquivo: "
        f"{OUTPUT_PATH}"
    )

    print()
    print(
        "STATUS: VISUAL_AUDIT_V3_READY"
    )


if __name__ == "__main__":
    main()
