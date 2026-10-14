"""
Interatividade do PDF do aluno (aula): recebe o PDF gerado pelo Chromium e um JSON com as posições
(em pontos, origem no topo da página) e acrescenta, com PyMuPDF:
  - links internos (sumário, "voltar ao sumário", alternativas das questões, "tentar de novo", flashcards);
  - marcadores (bookmarks / sumário lateral do leitor);
  - caixas de marcar (checklists) e campos de texto (anotações), como widgets de formulário.
O desenho de cada caixa e campo já está no PDF (o Chromium desenhou): sem suporte a formulário, o leitor
mostra o quadrado e as linhas para marcar à mão. Imprime um relatório JSON.

Uso: pdfpython -I pdf_interativo.py entrada.pdf saida.pdf posicoes.json
"""
import json
import sys

import pymupdf


def main():
    src, dst, spec_path = sys.argv[1], sys.argv[2], sys.argv[3]
    spec = json.load(open(spec_path, encoding="utf-8"))
    doc = pymupdf.open(src)
    k = spec.get("scale", 0.75)

    def rect(r):
        return pymupdf.Rect(r["x"] * k, r["y"] * k, (r["x"] + r["w"]) * k, (r["y"] + r["h"]) * k)

    dests = spec["dests"]
    missing = []
    links = 0
    for ln in spec["links"]:
        d = dests.get(ln["to"])
        if d is None:
            missing.append(ln["to"])
            continue
        page = doc[ln["page"]]
        page.insert_link({"kind": pymupdf.LINK_GOTO, "from": rect(ln), "page": d["page"], "to": pymupdf.Point(0, max(0, d["y"] * k - 6)), "zoom": 0})
        links += 1

    toc = []
    for b in spec["bookmarks"]:
        d = dests.get(b["to"])
        if d is None:
            missing.append(b["to"])
            continue
        toc.append([b["level"], b["title"], d["page"] + 1, {"kind": pymupdf.LINK_GOTO, "page": d["page"], "to": pymupdf.Point(0, max(0, d["y"] * k - 6)), "zoom": 0}])
    if toc:
        doc.set_toc(toc)

    checks = texts = 0
    for w in spec["checks"]:
        page = doc[w["page"]]
        wd = pymupdf.Widget()
        wd.field_type = pymupdf.PDF_WIDGET_TYPE_CHECKBOX
        wd.field_name = w["name"]
        wd.field_label = w.get("label", "")[:200]
        wd.rect = rect(w)
        wd.field_value = False
        wd.border_width = 0
        wd.border_color = None
        wd.fill_color = None
        wd.text_color = (0.04, 0.15, 0.27)
        page.add_widget(wd)
        checks += 1
    for w in spec["fields"]:
        page = doc[w["page"]]
        wd = pymupdf.Widget()
        wd.field_type = pymupdf.PDF_WIDGET_TYPE_TEXT
        wd.field_name = w["name"]
        wd.field_label = w.get("label", "")[:200]
        wd.rect = rect(w)
        wd.field_flags = pymupdf.PDF_TX_FIELD_IS_MULTILINE
        wd.text_font = "Helv"
        wd.text_fontsize = 10
        wd.border_width = 0
        wd.border_color = None
        wd.fill_color = None
        wd.text_color = (0.08, 0.13, 0.2)
        page.add_widget(wd)
        texts += 1

    meta = doc.metadata or {}
    meta.update(spec.get("metadata", {}))
    doc.set_metadata(meta)
    doc.save(dst, garbage=3, deflate=True)
    doc.close()

    out = pymupdf.open(dst)
    report = {
        "pages": out.page_count,
        "links": sum(len(p.get_links()) for p in out),
        "links_inserted": links,
        "bookmarks": len(out.get_toc()),
        "widgets": {"checkbox": 0, "text": 0},
        "missing_dests": sorted(set(missing)),
        "form": out.is_form_pdf,
    }
    for p in out:
        for wd in p.widgets():
            if wd.field_type == pymupdf.PDF_WIDGET_TYPE_CHECKBOX:
                report["widgets"]["checkbox"] += 1
            elif wd.field_type == pymupdf.PDF_WIDGET_TYPE_TEXT:
                report["widgets"]["text"] += 1
    print(json.dumps(report, ensure_ascii=False))


if __name__ == "__main__":
    main()
