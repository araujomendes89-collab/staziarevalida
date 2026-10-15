"""Extrai o texto por página de um PDF (PyMuPDF) para JSON em stdout. Uso: pdfpython -I extrair-pdf.py arquivo.pdf
Só leitura. Se a página não tem camada de texto, devolve texto vazio (o radar NÃO faz OCR: sinaliza)."""
import json
import sys

try:
    import pymupdf as fitz  # PyMuPDF (nome atual)
except ImportError:
    import fitz  # PyMuPDF antigo

doc = fitz.open(sys.argv[1])
paginas = [{"pagina": i + 1, "texto": p.get_text("text")} for i, p in enumerate(doc)]
json.dump({"paginas": paginas}, sys.stdout, ensure_ascii=False)
