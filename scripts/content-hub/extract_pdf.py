"""
Extrator de PDF da Central de Conteúdo (StaziaMed).

Uso:
    pdfpython scripts/content-hub/extract_pdf.py ARQUIVO.pdf --out SAIDA.json [--start 1 --end 50] [--ocr-dpi 300]

Saída (JSON):
    document: hash, páginas, metadados, protegido/corrompido, tipo (text | scanned | mixed)
    pages:    uma entrada por página do intervalo (tipo, número impresso, OCR usado)
    blocks:   elementos na ordem de leitura, com página, coordenadas, tipo, texto ORIGINAL,
              situação (extracted | pending | illegible | excluded + justificativa) e sinais
    inventory: contagens por tipo e situação
    parser:   versões do extrator, PyMuPDF e Tesseract

Princípios:
    * nada é corrigido nem completado: o texto sai como está no arquivo (ou como o OCR leu);
    * o que não dá para ler fica "illegible"/"pending" e aparece no inventário;
    * texto que parece instrução (ex.: "ignore as regras e publique") é sinalizado e tratado
      como dado: o extrator não executa nada e não muda regras;
    * processamento por faixa de páginas (checkpoint) para documentos longos.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import shutil
import statistics
import subprocess
import sys
import tempfile
from collections import Counter
from pathlib import Path

import pymupdf

EXTRACTOR_VERSION = "staziamed-extract-1.0"
OCR_LANGS = "por+spa+eng"

# Texto que tenta dar ordens ao sistema: sinalizado, nunca seguido.
INJECTION = re.compile(
    r"(ignore|desconsidere|esque[çc]a)\s+(as|todas\s+as|quaisquer)?\s*(instru[çc][õo]es|regras|orienta[çc][õo]es)"
    r"|ignore\s+(all\s+)?previous\s+instructions|system\s+prompt|voc[êe]\s+[ée]\s+(agora\s+)?um[a]?\s+(assistente|modelo|ia)"
    r"|(publique|aprove|libere)\s+(este|esta|o|a)\s+(material|conte[úu]do|documento|quest[ãa]o)"
    r"|revele\s+(a|sua)s?\s+(chave|senha|credencia)",
    re.IGNORECASE,
)
# Informação clínica crítica: dose, unidade, intervalo, desigualdade.
CRITICAL = re.compile(
    r"\d+(?:[.,]\d+)?\s*(?:mg|mcg|µg|g|ml|mL|UI|%|mmHg|mg/kg|mcg/kg|mg/dL|g/dL|h|horas?|dias?|semanas?|meses|anos?)\b|[<>≤≥]\s*\d",
    re.IGNORECASE,
)
CAPTION = re.compile(r"^\s*(figura|quadro|tabela|fluxograma|algoritmo|gr[áa]fico|imagem)\s*\d*", re.IGNORECASE)
REFERENCE = re.compile(r"^\s*(\d+\.\s+)?[A-ZÀ-Ú][A-Za-zÀ-ú'\-]+,?\s+[A-Z]{1,3}[\.,].*\b(19|20)\d{2}\b")


def sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def tesseract_version() -> str | None:
    exe = shutil.which("tesseract")
    if not exe:
        return None
    out = subprocess.run([exe, "--version"], capture_output=True, text=True)
    return (out.stdout or out.stderr).splitlines()[0].strip() if (out.stdout or out.stderr) else None


def flags_for(text: str, ocr_conf: float | None = None) -> list[dict]:
    flags = []
    if INJECTION.search(text or ""):
        flags.append({"code": "possible_prompt_injection", "detail": "Trecho com forma de instrução ao sistema; tratado apenas como conteúdo."})
    if ocr_conf is not None and ocr_conf < 0.85 and CRITICAL.search(text or ""):
        flags.append({"code": "doubtful_ocr_critical", "detail": f"OCR com confiança {ocr_conf:.2f} em trecho com número/unidade."})
    return flags


def repeated_margin_lines(doc: pymupdf.Document, margin: float = 0.07) -> set[str]:
    """Linhas que se repetem nas margens superior/inferior em várias páginas (cabeçalho/rodapé)."""
    counter: Counter[str] = Counter()
    pages = min(doc.page_count, 40)
    for i in range(pages):
        page = doc[i]
        h = page.rect.height
        seen = set()
        for b in page.get_text("blocks"):
            x0, y0, x1, y1, text = b[0], b[1], b[2], b[3], b[4]
            if y1 < h * margin or y0 > h * (1 - margin):
                key = re.sub(r"\d+", "#", " ".join(text.split()))[:120]
                if key and key not in seen:
                    seen.add(key)
                    counter[key] += 1
    threshold = max(3, int(pages * 0.4))
    return {k for k, n in counter.items() if n >= threshold}


def repeated_images(doc: pymupdf.Document) -> set[tuple]:
    """Imagens na mesma posição em várias páginas (logotipo, cabeçalho, marca-d'água do próprio documento)."""
    counter: Counter[tuple] = Counter()
    pages = min(doc.page_count, 40)
    for i in range(pages):
        seen = set()
        for info in doc[i].get_image_info():
            key = tuple(round(v / 4) for v in info["bbox"])
            if key not in seen:
                seen.add(key)
                counter[key] += 1
    threshold = max(3, int(pages * 0.4))
    return {k for k, n in counter.items() if n >= threshold}


def page_kind(page: pymupdf.Page) -> tuple[str, float, int]:
    text = page.get_text("text").strip()
    area = page.rect.width * page.rect.height or 1
    covered = 0.0
    for info in page.get_image_info():
        r = pymupdf.Rect(info["bbox"]) & page.rect
        covered += max(r.width, 0) * max(r.height, 0)
    coverage = min(covered / area, 1.0)
    chars = len(text)
    if chars >= 40:
        return "text", coverage, chars
    if coverage > 0.3 or page.get_images():
        return "scanned", coverage, chars
    return "empty", coverage, chars


def ocr_page(page: pymupdf.Page, dpi: int) -> list[dict]:
    """OCR com Tesseract (por+spa+eng): blocos com texto, confiança média e coordenadas em pontos do PDF."""
    exe = shutil.which("tesseract")
    if not exe:
        return [{"text": "", "conf": 0.0, "bbox": [0, 0, page.rect.width, page.rect.height], "error": "Tesseract não instalado."}]
    pix = page.get_pixmap(dpi=dpi)
    scale = 72.0 / dpi
    with tempfile.TemporaryDirectory() as tmp:
        img = Path(tmp) / "p.png"
        pix.save(img)
        out = subprocess.run([exe, str(img), "stdout", "-l", OCR_LANGS, "--psm", "3", "tsv"], capture_output=True, text=True)
    blocks: dict[tuple, dict] = {}
    for line in out.stdout.splitlines()[1:]:
        cols = line.split("\t")
        if len(cols) < 12 or not cols[11].strip():
            continue
        conf = float(cols[10])
        if conf < 0:
            continue
        key = (int(cols[2]), int(cols[3]))  # bloco, parágrafo
        x, y, w, h = (int(c) for c in cols[6:10])
        b = blocks.setdefault(key, {"words": [], "confs": [], "x0": x, "y0": y, "x1": x + w, "y1": y + h, "line": int(cols[4]), "lines": []})
        b["words"].append(cols[11])
        b["confs"].append(conf)
        b["x0"], b["y0"] = min(b["x0"], x), min(b["y0"], y)
        b["x1"], b["y1"] = max(b["x1"], x + w), max(b["y1"], y + h)
    result = []
    for b in blocks.values():
        text = " ".join(b["words"]).strip()
        conf = statistics.mean(b["confs"]) / 100 if b["confs"] else 0.0
        result.append({"text": text, "conf": round(conf, 3), "bbox": [round(b["x0"] * scale, 1), round(b["y0"] * scale, 1), round(b["x1"] * scale, 1), round(b["y1"] * scale, 1)]})
    return sorted(result, key=lambda r: (r["bbox"][1], r["bbox"][0]))


def vector_figures(page: pymupdf.Page, table_rects: list) -> list:
    """Agrupa desenhos vetoriais (caixas e setas) em regiões; ignora linhas soltas e as grades de tabelas."""
    rects = []
    W, H = page.rect.width, page.rect.height
    for dr in page.get_drawings():
        r = pymupdf.Rect(dr["rect"])
        if r.width > W * 0.8 or r.height > H * 0.8:  # réguas e divisórias de coluna
            continue
        # linhas retas têm largura ou altura zero: engrossa para poderem ligar as caixas
        if r.width < 2:
            r.x0, r.x1 = r.x0 - 1, r.x1 + 1
        if r.height < 2:
            r.y0, r.y1 = r.y0 - 1, r.y1 + 1
        if r.width < 4 and r.height < 4:
            continue
        if any((r & t).get_area() > r.get_area() * 0.5 for t in table_rects) or any(t.contains(r) for t in table_rects):
            continue
        rects.append(r)
    is_box = lambda r: r.width >= 20 and r.height >= 12  # caixa de verdade (não é linha nem régua)
    clusters = [{"rect": pymupdf.Rect(r), "n": 1, "boxes": int(is_box(r))} for r in rects]
    merged = True
    while merged:  # junta até estabilizar (uma seta pode unir dois grupos)
        merged = False
        for i in range(len(clusters)):
            for j in range(i + 1, len(clusters)):
                a, b = clusters[i], clusters[j]
                if pymupdf.Rect(a["rect"].x0 - 6, a["rect"].y0 - 6, a["rect"].x1 + 6, a["rect"].y1 + 6).intersects(b["rect"]):
                    a["rect"] |= b["rect"]
                    a["n"] += b["n"]
                    a["boxes"] += b["boxes"]
                    clusters.pop(j)
                    merged = True
                    break
            if merged:
                break
    # um diagrama tem várias formas e ocupa uma área razoável
    return [c["rect"] for c in clusters if c["boxes"] >= 3 and c["n"] >= 4 and c["rect"].get_area() > page.rect.get_area() * 0.03]


def reading_order(blocks: list[dict], width: float) -> list[dict]:
    """Ordem de leitura com detecção simples de duas colunas: blocos estreitos à esquerda antes dos da direita,
    respeitando blocos de largura total como separadores."""
    def column(b):
        x0, _, x1, _ = b["bbox"]
        if (x1 - x0) > width * 0.6:
            return -1
        return 0 if (x0 + x1) / 2 < width / 2 else 1

    ordered: list[dict] = []
    band: list[dict] = []
    for b in sorted(blocks, key=lambda b: (b["bbox"][1], b["bbox"][0])):
        if column(b) == -1:
            ordered += sorted(band, key=lambda x: (column(x), x["bbox"][1]))
            band = []
            ordered.append(b)
        else:
            band.append(b)
    ordered += sorted(band, key=lambda x: (column(x), x["bbox"][1]))
    return ordered


def extract_text_page(page: pymupdf.Page, margins: set[str], page_no: int, repeated: set[tuple] = frozenset()) -> tuple[list[dict], str | None]:
    width, height = page.rect.width, page.rect.height
    raw: list[dict] = []

    # Tabelas primeiro: o texto de dentro delas não pode virar parágrafo solto.
    table_rects = []
    try:
        tables = page.find_tables()
        for t in tables.tables:
            rows = t.extract()
            if not rows or len(rows) < 2:
                continue
            rect = pymupdf.Rect(t.bbox)
            table_rects.append(rect)
            header = [c or "" for c in rows[0]]
            empty_cells = sum(1 for r in rows for c in r if c is None or not str(c).strip())
            raw.append({
                "type": "table",
                "bbox": [round(v, 1) for v in rect],
                "text": "\n".join(" | ".join("" if c is None else str(c) for c in r) for r in rows),
                "data": {"header": header, "rows": [["" if c is None else str(c) for c in r] for r in rows[1:]],
                         "n_rows": len(rows), "n_cols": len(rows[0]), "empty_cells": empty_cells},
            })
    except Exception as exc:  # find_tables falha em alguns PDFs; o texto continua como parágrafos
        raw.append({"type": "other", "bbox": [0, 0, width, height], "text": "", "status": "pending",
                    "flags": [{"code": "table_detection_failed", "detail": str(exc)[:200]}]})

    d = page.get_text("dict")
    text_rects = [pymupdf.Rect(b["bbox"]) for b in d["blocks"] if b["type"] == 0 and any(s["text"].strip() for l in b["lines"] for s in l["spans"])]
    page_area = width * height or 1
    sizes = [s["size"] for b in d["blocks"] if b["type"] == 0 for l in b["lines"] for s in l["spans"] if s["text"].strip()]
    body = statistics.median(sizes) if sizes else 10
    printed_no = None

    for b in d["blocks"]:
        rect = pymupdf.Rect(b["bbox"])
        if b["type"] == 1:  # imagem
            area = rect.get_area()
            covered_text = sum((rect & t).get_area() for t in text_rects)
            if tuple(round(v / 4) for v in b["bbox"]) in repeated:
                reason = "Imagem repetida na mesma posição em várias páginas (logotipo ou cabeçalho)."
            elif area > page_area * 0.25 and covered_text > 0:
                reason = "Imagem de fundo sob o texto (elemento decorativo)."
            elif area < page_area * 0.06 and any((rect & t).get_area() > t.get_area() * 0.6 for t in text_rects):
                reason = "Moldura decorativa atrás de um rótulo de texto."
            elif area < page_area * 0.002:
                reason = "Imagem muito pequena (ícone ou marcador)."
            else:
                reason = None
            if reason:
                raw.append({"type": "figure", "bbox": [round(v, 1) for v in rect], "text": "", "status": "excluded", "exclusion_reason": reason})
            else:
                raw.append({"type": "figure", "bbox": [round(v, 1) for v in rect], "text": "", "status": "pending",
                            "flags": [{"code": "figure_needs_review", "detail": "Figura: conteúdo visual precisa de descrição revisada."}],
                            "data": {"width": b.get("width"), "height": b.get("height")}})
            continue
        if any((rect & tr).get_area() > rect.get_area() * 0.6 for tr in table_rects):
            continue
        spans = [s for l in b["lines"] for s in l["spans"] if s["text"].strip()]
        if not spans:
            continue
        text = "\n".join("".join(s["text"] for s in l["spans"]).strip() for l in b["lines"] if "".join(s["text"] for s in l["spans"]).strip())
        max_size = max(s["size"] for s in spans)
        bold = all("bold" in s["font"].lower() or (s["flags"] & 16) for s in spans)
        key = re.sub(r"\d+", "#", " ".join(text.split()))[:120]
        in_margin = rect.y1 < height * 0.07 or rect.y0 > height * 0.93
        if in_margin and (key in margins or re.fullmatch(r"\s*\d{1,4}\s*", text)):
            if re.fullmatch(r"\s*\d{1,4}\s*", text):
                printed_no = text.strip()
            raw.append({"type": "other", "bbox": [round(v, 1) for v in rect], "text": text, "status": "excluded",
                        "exclusion_reason": "Cabeçalho, rodapé ou número de página repetido nas margens."})
            continue
        if CAPTION.match(text):
            kind = "caption"
        elif max_size >= body * 1.25 or (bold and len(text) < 120 and "\n" not in text.strip()):
            kind = "heading"
        elif rect.y0 > height * 0.8 and max_size < body * 0.9:
            kind = "footnote"
        elif REFERENCE.match(text):
            kind = "reference"
        elif re.match(r"^\s*([•\-–▪●]|\d+[\.\)])\s+", text):
            kind = "list"
        else:
            kind = "paragraph"
        raw.append({"type": kind, "bbox": [round(v, 1) for v in rect], "text": text,
                    "data": {"font_size": round(max_size, 1), "bold": bool(bold)}})

    for cluster in vector_figures(page, table_rects):
        inside = [t for t in raw if t["type"] in ("paragraph", "heading", "list") and pymupdf.Rect(t["bbox"]).intersects(cluster)]
        raw = [t for t in raw if t not in inside]  # o texto das caixas passa a fazer parte do diagrama (sem duplicar)
        raw.append({"type": "figure", "bbox": [round(v, 1) for v in cluster], "text": "\n".join(t["text"] for t in inside), "status": "pending",
                    "flags": [{"code": "vector_diagram", "detail": "Fluxograma ou diagrama desenhado: conferir a estrutura (setas, ordem, condições)."}],
                    "data": {"texts_inside": len(inside)}})
    ordered = reading_order(raw, width)
    for b in ordered:
        b.setdefault("status", "extracted")
        b["flags"] = b.get("flags", []) + flags_for(b.get("text", ""))
    return ordered, printed_no


def extract(path: Path, start: int, end: int | None, dpi: int) -> dict:
    result: dict = {"parser": {"extractor": EXTRACTOR_VERSION, "pymupdf": pymupdf.VersionBind, "tesseract": tesseract_version()}}
    try:
        doc = pymupdf.open(path)
    except Exception as exc:
        return {**result, "document": {"sha256": sha256_file(path), "error": f"Arquivo corrompido ou não é PDF: {exc}"}, "pages": [], "blocks": []}
    meta = doc.metadata or {}
    info = {"sha256": sha256_file(path), "page_count": doc.page_count, "encrypted": bool(doc.needs_pass),
            "metadata": {k: meta.get(k) for k in ("title", "author", "subject", "creator", "producer", "creationDate", "modDate") if meta.get(k)}}
    if doc.needs_pass:
        return {**result, "document": {**info, "error": "Documento protegido por senha: não é possível extrair."}, "pages": [], "blocks": []}

    end = min(end or doc.page_count, doc.page_count)
    info["repaired"] = bool(getattr(doc, "is_repaired", False))
    margins = repeated_margin_lines(doc)
    repeated = repeated_images(doc)
    pages, blocks = [], []
    kinds = Counter()
    for no in range(start, end + 1):
        page = doc[no - 1]
        kind, coverage, chars = page_kind(page)
        entry = {"page_no": no, "kind": kind, "width": round(page.rect.width, 1), "height": round(page.rect.height, 1),
                 "image_coverage": round(coverage, 3), "chars": chars, "ocr_used": False, "printed_no": None}
        page_blocks: list[dict] = []
        if kind == "text":
            page_blocks, entry["printed_no"] = extract_text_page(page, margins, no, repeated)
        elif kind == "scanned":
            entry["ocr_used"] = True
            ocr = ocr_page(page, dpi)
            texts = [o for o in ocr if o["text"]]
            if not texts:
                page_blocks = [{"type": "paragraph", "bbox": [0, 0, entry["width"], entry["height"]], "text": "", "status": "illegible",
                                "ocr_confidence": 0.0, "flags": [{"code": "ocr_no_text", "detail": ocr[0].get("error", "OCR não reconheceu texto.") if ocr else "OCR sem resultado."}]}]
            for o in texts:
                status = "extracted" if o["conf"] >= 0.6 else "illegible"
                page_blocks.append({"type": "paragraph", "bbox": o["bbox"], "text": o["text"], "status": status, "ocr_confidence": o["conf"],
                                    "flags": flags_for(o["text"], o["conf"]) + ([{"code": "low_ocr_confidence", "detail": f"Confiança {o['conf']:.2f}."}] if o["conf"] < 0.85 else [])})
        if info["repaired"]:
            page_blocks.append({"type": "other", "bbox": [0, 0, entry["width"], entry["height"]], "text": "", "status": "pending",
                                "flags": [{"code": "document_repaired", "detail": "O arquivo estava danificado ou cortado e precisou ser reparado na leitura: confira esta página com o original."}]})
        # página vazia: registrada no inventário sem blocos
        for i, b in enumerate(page_blocks):
            b["page_no"], b["idx"] = no, i
            blocks.append(b)
        kinds[kind] += 1
        pages.append(entry)

    non_empty = {k: v for k, v in kinds.items() if k != "empty"}
    info["text_kind"] = "mixed" if len(non_empty) > 1 else (next(iter(non_empty)) if non_empty else "text")
    info["range"] = [start, end]
    inventory = {"pages": len(pages), "by_type": Counter(b["type"] for b in blocks), "by_status": Counter(b["status"] for b in blocks),
                 "flags": Counter(f["code"] for b in blocks for f in b.get("flags", []))}
    return {**result, "document": info, "pages": pages, "blocks": blocks, "inventory": inventory}


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("pdf")
    ap.add_argument("--out", required=True)
    ap.add_argument("--start", type=int, default=1)
    ap.add_argument("--end", type=int, default=None)
    ap.add_argument("--ocr-dpi", type=int, default=300)
    args = ap.parse_args(argv)
    data = extract(Path(args.pdf), max(args.start, 1), args.end, args.ocr_dpi)
    Path(args.out).write_text(json.dumps(data, ensure_ascii=False, indent=1, default=dict), encoding="utf-8")
    doc = data["document"]
    if doc.get("error"):
        print(json.dumps({"ok": False, "error": doc["error"]}, ensure_ascii=False))
        return 2
    print(json.dumps({"ok": True, "pages": len(data["pages"]), "blocks": len(data["blocks"]), "text_kind": doc["text_kind"],
                      "inventory": data["inventory"]}, ensure_ascii=False, default=dict))
    return 0


if __name__ == "__main__":
    sys.exit(main())
