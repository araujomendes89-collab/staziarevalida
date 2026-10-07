"""
Finaliza e confere o PDF de um material visual da Central de Conteúdo (cards, A4, story e flashcards).

  - Página no tamanho exato do modelo (o Chromium arredonda a altura para cima): feed e flashcard digital
    1080 x 1350 px, story 1080 x 1920 px, A4 210 x 297 mm.
  - Flashcard A6: página de 105 x 148 mm + sangria (o gerador já estende os fundos), com TrimBox (corte)
    e BleedBox (sangria) marcados para a gráfica; frente e verso em sequência, para virar no eixo longo.
  - Grava título, assunto e palavras-chave (card_id, especialidade, ordem) nos metadados.
  - Devolve o texto de cada página, as fontes usadas em cada trecho de texto, páginas vazias e as caixas.

Uso:
    pdfpython scripts/content-hub/visual_pdf.py ENTRADA.pdf SAIDA.pdf '{"physical": {...}, "metadata": {...}}'
Saída (stdout, JSON).
"""

from __future__ import annotations

import json
import sys

import pymupdf


def main(src: str, dst: str, spec_text: str) -> int:
    spec = json.loads(spec_text)
    doc = pymupdf.open(src)
    physical = spec.get("physical")
    if physical:
        out = pymupdf.open()
        for i in range(doc.page_count):
            page = out.new_page(width=physical["width"], height=physical["height"])
            # vetorial: o conteúdo é só reduzido, o texto continua texto e as fontes continuam embutidas
            clip = physical.get("clip")
            page.show_pdf_page(page.rect, doc, i, clip=pymupdf.Rect(*clip) if clip else None)
            trim = physical.get("trim")
            if trim:
                page.set_bleedbox(page.rect)
                page.set_trimbox(pymupdf.Rect(*trim))
        doc.close()
        doc = out
    meta = spec.get("metadata") or {}
    doc.set_metadata(
        {
            "title": meta.get("title", ""),
            "subject": meta.get("subject", ""),
            "keywords": meta.get("keywords", ""),
            "creator": "StaziaMed Revalida · Central de Conteúdo",
            "producer": "StaziaMed Revalida (Chromium + PyMuPDF)",
        }
    )
    doc.save(dst, garbage=3, deflate=True)
    doc.close()

    check = pymupdf.open(dst)
    pages, texts, empty, spans_fonts, foreign = [], [], [], set(), []
    for i, page in enumerate(check, start=1):
        text = page.get_text("text")
        texts.append(text)
        if not text.strip():
            empty.append(i)
        info = {
            "width": round(page.rect.width, 2),
            "height": round(page.rect.height, 2),
            "trim": [round(v, 2) for v in page.trimbox],
            "bleed": [round(v, 2) for v in page.bleedbox],
        }
        pages.append(info)
        for block in page.get_text("dict")["blocks"]:
            for line in block.get("lines", []):
                for span in line.get("spans", []):
                    if not span["text"].strip():
                        continue
                    font = span["font"]
                    spans_fonts.add(font)
                    low = font.lower()
                    if "barlow" not in low and "caveat" not in low:
                        foreign.append({"page": i, "font": font, "text": span["text"][:60]})
    embedded = True
    for pno in range(check.page_count):
        for f in check.get_page_fonts(pno, full=True):
            if f[1] in ("", "n/a"):
                embedded = False
    print(
        json.dumps(
            {
                "pages": check.page_count,
                "page_info": pages,
                "page_texts": texts,
                "empty_pages": empty,
                "fonts": sorted(spans_fonts),
                "foreign_fonts": foreign[:20],
                "embedded": embedded,
                "metadata": check.metadata,
            },
            ensure_ascii=False,
        )
    )
    check.close()
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1], sys.argv[2], sys.argv[3]))
