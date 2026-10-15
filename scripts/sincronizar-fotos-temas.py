#!/usr/bin/env python3
"""Sincroniza as fotos dos Temas Essenciais (imagens geradas, PNG 16:9) com o site.

Para cada GR-xxx.png da pasta de origem:
  - converte para WebP 1280x720 (corte 16:9 centrado), qualidade 80, baixando a qualidade até caber em 180 KB;
  - grava em public/temas/foto/GR-xxx.webp;
  - registra no manifesto src/novo/app/study/fotos-temas.json (arquivo, tipo, risco médico, estado, impressão do PNG).

Regras:
  - tema com estado "aprovada" no manifesto NUNCA é sobrescrito (nem o arquivo, nem a linha);
  - PNG igual ao já convertido (mesma impressão) é pulado;
  - estado de foto nova ou trocada: "pendente de revisão médica" (ninguém aprova por aqui);
  - nada é apagado.

Uso (na raiz do projeto):
  pdfpython scripts/sincronizar-fotos-temas.py [--origem PASTA] [--prompts prompts.json] [--seco]
"""
import argparse
import hashlib
import io
import json
import re
import sys
from datetime import date
from pathlib import Path

from PIL import Image

RAIZ = Path(__file__).resolve().parent.parent
ORIGEM_PADRAO = Path("/Volumes/StaziaMed/.tmp-aulas/imagens-temas/img")
PROMPTS_PADRAO = Path("/Volumes/StaziaMed/.tmp-aulas/imagens-temas/prompts.json")
DESTINO = RAIZ / "public" / "temas" / "foto"
MANIFESTO = RAIZ / "src" / "novo" / "app" / "study" / "fotos-temas.json"
LARGURA, ALTURA = 1280, 720
QUALIDADE_INICIAL, QUALIDADE_MINIMA = 80, 50
LIMITE_BYTES = 180 * 1024
PENDENTE = "pendente de revisão médica"
CODIGO = re.compile(r"^GR-\d{3}$")


def impressao(caminho: Path) -> str:
    h = hashlib.sha256()
    with caminho.open("rb") as f:
        for bloco in iter(lambda: f.read(1 << 20), b""):
            h.update(bloco)
    return h.hexdigest()[:16]


def recorte_16_9(img: Image.Image) -> Image.Image:
    w, h = img.size
    alvo = 16 / 9
    if abs(w / h - alvo) < 0.01:
        return img
    if w / h > alvo:  # larga demais: corta dos lados, mantendo a direita (assunto à direita)
        nova = round(h * alvo)
        return img.crop((w - nova, 0, w, h))
    nova = round(w / alvo)
    topo = (h - nova) // 2
    return img.crop((0, topo, w, topo + nova))


def webp(caminho: Path) -> tuple[bytes, int]:
    with Image.open(caminho) as bruto:
        img = recorte_16_9(bruto.convert("RGB")).resize((LARGURA, ALTURA), Image.LANCZOS)
    q = QUALIDADE_INICIAL
    while True:
        buf = io.BytesIO()
        img.save(buf, "WEBP", quality=q, method=6)
        dados = buf.getvalue()
        if len(dados) <= LIMITE_BYTES or q <= QUALIDADE_MINIMA:
            return dados, q
        q -= 5


def main() -> int:
    ap = argparse.ArgumentParser(description="Sincroniza as fotos dos Temas Essenciais.")
    ap.add_argument("--origem", type=Path, default=ORIGEM_PADRAO)
    ap.add_argument("--prompts", type=Path, default=PROMPTS_PADRAO)
    ap.add_argument("--seco", action="store_true", help="só mostra o que faria")
    a = ap.parse_args()

    if not a.origem.is_dir():
        print(f"Pasta de origem não encontrada: {a.origem}", file=sys.stderr)
        return 1
    info = {}
    if a.prompts.is_file():
        for p in json.loads(a.prompts.read_text(encoding="utf-8")):
            info[p["codigo"]] = p
    manifesto = json.loads(MANIFESTO.read_text(encoding="utf-8")) if MANIFESTO.is_file() else {}
    DESTINO.mkdir(parents=True, exist_ok=True)

    novos = trocados = pulados = aprovados = 0
    for png in sorted(a.origem.glob("GR-*.png")):
        codigo = png.stem
        if not CODIGO.match(codigo):
            continue
        atual = manifesto.get(codigo)
        if atual and atual.get("estado") == "aprovada":
            aprovados += 1
            continue
        imp = impressao(png)
        arquivo = DESTINO / f"{codigo}.webp"
        if atual and atual.get("origem") == imp and arquivo.is_file():
            pulados += 1
            continue
        try:
            dados, q = webp(png)
        except Exception as e:  # PNG ainda sendo gravado pelo gerador, ou corrompido: tenta de novo na próxima vez
            print(f"{codigo}: pulado, PNG ilegível ({e.__class__.__name__})")
            continue
        p = info.get(codigo, {})
        linha = {
            "arquivo": f"/temas/foto/{codigo}.webp",
            "tipo": p.get("tipo"),
            "risco_medico": p.get("risco_medico", "baixo"),
            "estado": PENDENTE,
            "origem": imp,
            "bytes": len(dados),
            "qualidade": q,
            "sincronizada_em": date.today().isoformat(),
        }
        print(f"{'(seco) ' if a.seco else ''}{codigo}: {len(dados) // 1024} KB, qualidade {q}{' (troca)' if atual else ''}")
        if not a.seco:
            arquivo.write_bytes(dados)
            manifesto[codigo] = linha
        trocados += 1 if atual else 0
        novos += 0 if atual else 1

    if not a.seco:
        MANIFESTO.write_text(json.dumps(dict(sorted(manifesto.items())), ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    total = sum(v.get("bytes", 0) for v in manifesto.values())
    print(f"Novas: {novos} · trocadas: {trocados} · iguais: {pulados} · aprovadas preservadas: {aprovados}")
    print(f"Temas com foto: {len(manifesto)} · total dos WebP: {total / 1024 / 1024:.1f} MB")
    return 0


if __name__ == "__main__":
    sys.exit(main())
