"""Linha da boca (lábio de cima) de cada recorte de boca, gravada no manifest dos sprites como `boca.labio`.

Por que (17/10/2026): a boca meia aberta é o recorte da boca aberta achatado. A dobra era presa no CENTRO DO FOCINHO (`ny`), uns
31 a 36 px lógicos acima do lábio: ao achatar, o lábio de cima, os cantos da boca e o pelo entre o nariz e a boca subiam junto
(até ~9 px lógicos na meia, ~5 px na tela de voz), e a boca "saía do lugar". O certo é dobrar NA LINHA DA BOCA: acima dela o
recorte é igual à pose (nada mexe) e só o que está abaixo (abertura, lábio de baixo, queixo) estica.

`labio` (px lógicos, coordenadas da pose, como `ny`) = ponto mais baixo do lábio de cima no meio da boca: em cada coluna do meio,
a primeira linha abaixo do focinho em que a boca aberta difere da pose; fica o percentil 90 (o lábio inteiro fica acima da dobra
e não mexe; só a abertura, o lábio de baixo e o queixo esticam).

Uso: pdfpython scripts/boca-alinhamento/linha-da-boca.py [--gravar]   (sem --gravar só mostra)
"""
import json
import os
import sys

import numpy as np
from PIL import Image, ImageFilter

AQUI = os.path.dirname(os.path.abspath(__file__))
SPRITES = os.path.join(AQUI, "..", "..", "src", "novo", "app", "tutor", "personagens", "sprites")
LIMIAR = 40  # diferença (0..255, maior canal, depois de um desfoque leve) que conta como "a boca mudou aqui"
LARGURA = 0.12  # colunas do meio da boca: centro do focinho ± 12% da largura do recorte
PERCENTIL = 90  # a dobra fica no ponto mais baixo do lábio de cima (90% das colunas do meio têm o lábio acima dela)


def linha_da_boca(pasta, pose):
    b = pose["boca"]
    fx = pose["fx"]
    P = Image.open(os.path.join(pasta, pose["file"])).convert("RGBA")
    B = Image.open(os.path.join(pasta, b["file"])).convert("RGBA")
    x0, y0 = round(b["x"] * fx), round(b["y"] * fx)
    c = np.asarray(P.crop((x0, y0, x0 + B.size[0], y0 + B.size[1]))).astype(float)
    r = np.asarray(B).astype(float)
    d = np.abs(c[..., :3] - r[..., :3]).max(-1) * (r[..., 3] / 255)
    d = np.asarray(Image.fromarray(np.clip(d, 0, 255).astype("uint8")).filter(ImageFilter.GaussianBlur(1.5))).astype(float)
    W = B.size[0]
    cx = (pose["nx"] - b["x"]) * fx
    y_focinho = int((pose["ny"] - b["y"]) * fx) + 4
    topos = []
    for x in range(max(0, int(cx - LARGURA * W)), min(W, int(cx + LARGURA * W))):
        ys = np.where(d[y_focinho:, x] > LIMIAR)[0]
        if len(ys):
            topos.append(ys[0] + y_focinho)
    if len(topos) < 5:
        raise SystemExit(f"sem diferença abaixo do focinho: {b['file']}")
    dobra = float(np.percentile(topos, PERCENTIL)) / fx  # px lógicos dentro do recorte
    return round(b["y"] + dobra, 2)


def main():
    gravar = "--gravar" in sys.argv
    for pid in ("stazi", "stazia"):
        pasta = os.path.join(SPRITES, pid)
        caminho = os.path.join(pasta, "manifest.json")
        with open(caminho, encoding="utf-8") as f:
            texto = f.read()
        man = json.loads(texto)
        for chave, pose in man.items():
            if not isinstance(pose, dict) or "boca" not in pose:
                continue
            lab = linha_da_boca(pasta, pose)
            print(f"{pid:6} {chave:14} focinho ny={pose['ny']:7.2f}  labio={lab:7.2f}  (dobra desce {lab - pose['ny']:5.1f} px lógicos)")
            pose["boca"]["labio"] = lab
        if gravar:
            with open(caminho, "w", encoding="utf-8") as f:
                f.write(json.dumps(man, ensure_ascii=False, indent=1))


if __name__ == "__main__":
    main()
