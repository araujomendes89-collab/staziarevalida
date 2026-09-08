import html
from pathlib import Path

import pymupdf

from src.extraction.pdf_reader import read_pdf
from src.extraction.question_detector import detect_questions
from src.extraction.question_parser import parse_question


PDF_PATH = Path(
    "data/raw/provas/revalida_2026_1_caderno_1.pdf"
)

OUTPUT_DIR = Path(
    "data/processed/auditoria_visual"
)

HTML_PATH = OUTPUT_DIR / "auditoria_100_questoes.html"


def render_pages():
    OUTPUT_DIR.mkdir(
        parents=True,
        exist_ok=True
    )

    document = pymupdf.open(PDF_PATH)

    rendered = []

    try:
        for page_number in range(3, 27):

            page = document[page_number - 1]

            pix = page.get_pixmap(
                matrix=pymupdf.Matrix(2.0, 2.0),
                alpha=False
            )

            filename = (
                f"pagina_{page_number:02d}.png"
            )

            output = OUTPUT_DIR / filename

            pix.save(output)

            rendered.append(output)

            print(
                f"Página {page_number:02d} → {output}"
            )

    finally:
        document.close()

    return rendered


def build_html():
    pdf = read_pdf(PDF_PATH)

    raw_questions = detect_questions(
        pdf,
        start_page=3,
        end_page=26
    )

    questions = [
        parse_question(q)
        for q in raw_questions
    ]

    if len(questions) != 100:
        raise RuntimeError(
            f"Esperava 100 questões. "
            f"Encontrei {len(questions)}."
        )

    navigation = []

    sections = []

    for q in questions:

        navigation.append(
            f'<a href="#q{q.question_number}">'
            f'{q.question_number}'
            f'</a>'
        )

        alternatives = ""

        for letter in "ABCD":

            text = html.escape(
                q.alternatives.get(
                    letter,
                    ""
                )
            )

            alternatives += f"""
            <div class="alternative">
                <strong>({letter})</strong>
                {text}
            </div>
            """

        image_filename = (
            f"pagina_{q.page_start:02d}.png"
        )

        sections.append(
            f"""
            <section
                class="question"
                id="q{q.question_number}"
            >

                <div class="pdf-panel">

                    <h3>
                        PDF ORIGINAL —
                        PÁGINA {q.page_start}
                    </h3>

                    <div class="pdf-image">

                        <img
                            src="{image_filename}"
                            alt="Página original {q.page_start}"
                        >

                    </div>

                </div>


                <div class="extracted-panel">

                    <h2>
                        QUESTÃO {q.question_number}
                    </h2>

                    <div class="metadata">
                        ITEM {html.escape(str(q.item_code))}
                        |
                        V. {html.escape(str(q.version_code))}
                        |
                        Página {q.page_start}
                    </div>

                    <div class="stem">
                        {html.escape(q.stem)}
                    </div>

                    <div class="alternatives">
                        {alternatives}
                    </div>

                    <div class="audit">

                        <strong>
                            CONFERÊNCIA
                        </strong>

                        <label>
                            <input type="checkbox">
                            Enunciado completo
                        </label>

                        <label>
                            <input type="checkbox">
                            Valores numéricos corretos
                        </label>

                        <label>
                            <input type="checkbox">
                            Alternativas A–D corretas
                        </label>

                        <label>
                            <input type="checkbox">
                            Imagem/tabela/gráfico conferido
                        </label>

                    </div>

                </div>

            </section>
            """
        )

    document = f"""
<!DOCTYPE html>
<html lang="pt-BR">

<head>

<meta charset="UTF-8">

<title>
Auditoria Revalida 2026/1
</title>

<style>

body {{
    margin: 0;
    background: #ededed;
    font-family: Arial, sans-serif;
    color: #222;
}}

header {{
    position: sticky;
    top: 0;
    z-index: 100;
    background: white;
    padding: 15px 20px;
    border-bottom: 1px solid #ccc;
}}

nav {{
    margin-top: 10px;
}}

nav a {{
    display: inline-block;
    padding: 4px 7px;
    margin: 2px;
    border: 1px solid #ccc;
    text-decoration: none;
    color: black;
    border-radius: 4px;
}}

main {{
    max-width: 1900px;
    margin: 25px auto;
    padding: 0 15px;
}}

.question {{
    display: grid;
    grid-template-columns: 55% 45%;
    gap: 20px;
    background: white;
    margin-bottom: 30px;
    padding: 20px;
    border-radius: 8px;
}}

.pdf-panel {{
    min-width: 0;
}}

.pdf-image {{
    width: 100%;
    max-height: 950px;
    overflow: auto;
    border: 2px solid #444;
    background: #bbb;
}}

.pdf-image img {{
    display: block;
    width: 100%;
    height: auto;
}}

.extracted-panel {{
    padding: 10px 20px;
}}

.metadata {{
    color: #666;
    margin-bottom: 25px;
}}

.stem {{
    font-size: 17px;
    line-height: 1.6;
    margin-bottom: 25px;
}}

.alternative {{
    margin: 15px 0;
    font-size: 16px;
    line-height: 1.5;
}}

.audit {{
    margin-top: 30px;
    padding: 15px;
    background: #f7f7f7;
    border: 1px solid #ddd;
}}

.audit label {{
    display: block;
    margin-top: 10px;
}}

@media (max-width: 1000px) {{

    .question {{
        grid-template-columns: 1fr;
    }}

}}

</style>

</head>

<body>

<header>

<h2>
Auditoria — Revalida INEP 2026/1
</h2>

<nav>
{''.join(navigation)}
</nav>

</header>

<main>

{''.join(sections)}

</main>

</body>
</html>
"""

    HTML_PATH.write_text(
        document,
        encoding="utf-8"
    )

    print()
    print("HTML gerado:")
    print(HTML_PATH)


def main():

    print("Renderizando páginas do PDF...")
    rendered = render_pages()

    print()
    print(
        f"{len(rendered)} imagens PNG geradas."
    )

    print()
    print("Gerando HTML...")
    build_html()


if __name__ == "__main__":
    main()
