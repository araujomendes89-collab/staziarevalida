#!/usr/bin/env python3
"""Sincroniza as fotos dos Temas Essenciais (imagens geradas, PNG 16:9) com o site.

Para cada GR-xxx.png da pasta de origem (arquivos GR-xxx.vN.png são versões antigas e são ignorados):
  - converte para WebP 1280x720 (corte 16:9 centrado), qualidade 80, baixando a qualidade até caber em 120 KB;
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

from PIL import Image, ImageFilter

try:
    import numpy as np
except ImportError:  # sem numpy: não corrige a borda, o resto funciona
    np = None

RAIZ = Path(__file__).resolve().parent.parent
ORIGEM_PADRAO = Path("/Volumes/StaziaMed/.tmp-aulas/imagens-temas/v2")
PROMPTS_PADRAO = Path("/Volumes/StaziaMed/.tmp-aulas/imagens-temas/v2/estado.json")
DESTINO = RAIZ / "public" / "temas" / "foto"
MANIFESTO = RAIZ / "src" / "novo" / "app" / "study" / "fotos-temas.json"
LARGURA, ALTURA = 1280, 720
QUALIDADE_INICIAL, QUALIDADE_MINIMA = 80, 40
LIMITE_BYTES = 120 * 1024
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


def apagar_borda_vertical(img: Image.Image) -> Image.Image:
    """Alguns PNGs do gerador vêm com uma emenda vertical dura (painel liso à esquerda + foto à direita, ou quina de parede).
    No cartão, a máscara de esmaecimento não esconde esse degrau e aparece uma linha vertical no tema claro.
    Aqui a emenda é achada (degrau de brilho consistente na altura toda, entre 20% e 62% da largura) e tudo à esquerda dela
    vira TRANSPARENTE; a foto ganha um esmaecimento próprio (alfa de 0 a 1 em 12% da largura) a partir da emenda.
    Assim o cartão (que mostra a foto sobre o branco) não tem mais degrau. Sem emenda: devolve a imagem igual."""
    if np is None:
        return img
    w, h = img.size
    peq = np.asarray(img.convert("L").resize((w // 4, h // 4))).astype(float)
    d = np.abs(np.diff(peq, axis=1)).mean(axis=0)
    lo, hi = int(len(d) * 0.20), int(len(d) * 0.62)
    i = lo + int(d[lo:hi].argmax())
    if d[i] < 30 or d[i] < 12 * float(np.median(d)):
        return img
    x = (i + 1) * 4
    a = np.asarray(img.convert("RGB")).copy()
    a[:, :x, :] = a[:, x : x + 1, :]  # cor sob a transparência = a da borda (evita halo ao reduzir)
    alfa = np.zeros((h, w), dtype=float)
    rampa = max(8, int(w * 0.12))
    alfa[:, x:] = 1.0
    alfa[:, x : x + rampa] = np.linspace(0, 1, rampa)[None, :]
    out = Image.fromarray(np.dstack([a, np.clip(alfa * 255, 0, 255).astype("uint8")]).astype("uint8"), "RGBA")
    out.info["borda_corrigida"] = round((i + 1) / len(d), 3)
    return out


def webp(caminho: Path) -> tuple[bytes, int]:
    with Image.open(caminho) as bruto:
        img = recorte_16_9(apagar_borda_vertical(bruto.convert("RGB"))).resize((LARGURA, ALTURA), Image.LANCZOS)
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
    ap.add_argument("--refazer", action="store_true", help="reconverte também os PNG já convertidos (mantém o estado de cada tema)")
    ap.add_argument("--seco", action="store_true", help="só mostra o que faria")
    a = ap.parse_args()

    if not a.origem.is_dir():
        print(f"Pasta de origem não encontrada: {a.origem}", file=sys.stderr)
        return 1
    info = {}
    if a.prompts.is_file():
        dados_p = json.loads(a.prompts.read_text(encoding="utf-8"))
        for p in (dados_p.values() if isinstance(dados_p, dict) else dados_p):
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
        if atual and atual.get("origem") == imp and arquivo.is_file() and not a.refazer:
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
            "risco_medico": p.get("risco_medico") or p.get("risco", "baixo"),
            "estado": atual["estado"] if (atual and a.refazer and atual.get("origem") == imp) else PENDENTE,
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
