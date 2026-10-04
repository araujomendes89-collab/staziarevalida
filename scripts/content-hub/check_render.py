"""
Conferência de um PDF gerado pela Central de Conteúdo: devolve o texto de cada página
(camada de texto selecionável) para o servidor comparar com o material de origem.

Uso:
    pdfpython scripts/content-hub/check_render.py ARQUIVO.pdf
Saída (stdout, JSON): {"pages": N, "page_texts": [...], "empty_pages": [...], "fonts": [...]}
"""

from __future__ import annotations

import json
import sys

import pymupdf


def main(path: str) -> int:
    doc = pymupdf.open(path)
    texts, empty, fonts = [], [], set()
    for i, page in enumerate(doc, start=1):
        text = page.get_text("text")
        texts.append(text)
        if not text.strip():
            empty.append(i)
        for f in page.get_fonts():
            fonts.add(f[3])
    print(json.dumps({"pages": doc.page_count, "page_texts": texts, "empty_pages": empty, "fonts": sorted(fonts)}, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1]))
