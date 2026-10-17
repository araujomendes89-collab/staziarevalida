"""Zonas dos olhos de cada recorte de piscada (`*--olhos.webp`), gravadas no manifest como `olhos.zonas`.

Por que (17/10/2026, "agora os olhos estão com o mesmo problema"): o recorte da piscada é tudo o que muda entre a pose e o quadro
de olhos fechados. Nesse quadro as sobrancelhas estão 3 a 6 px lógicos mais baixas e, na pose "base", a boca também é outra (o
Stazi fecha a risada; a Stazia muda o sorriso). Ao piscar, o recorte aparece por inteiro: as sobrancelhas pulam e a boca troca.
O certo é a piscada mostrar só as pálpebras: uma elipse por olho, em volta do olho ABERTO da pose (branco do olho + íris, com
folga para cílios e pálpebra), sem chegar na sobrancelha. Acima e fora dela fica a pose, parada.

Cada zona: {cx, cy, rx, ry} em px lógicos DENTRO do recorte (como olhos.x/y/w/h). O olho aberto inteiro fica no núcleo opaco
(até 82% do raio, sem o olho aberto aparecer por baixo da pálpebra) e a borda apaga de 82% a 100% do raio.

Uso: pdfpython scripts/olhos-alinhamento/zonas-dos-olhos.py [--gravar] [--folha caminho.png]
"""
import json
import os
import sys

import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage as ndi

AQUI = os.path.dirname(os.path.abspath(__file__))
SPRITES = os.path.join(AQUI, "..", "..", "src", "novo", "app", "tutor", "personagens", "sprites")
NUCLEO = 0.82  # o mesmo número do CSS (movimento.js NUCLEO_OLHOS): até 82% do raio a piscada é opaca, depois apaga até 100%


def olhos_abertos(c, O, limite_y):
    """Os dois olhos abertos da pose: a mancha em que o quadro de olhos fechados mais difere da pose (o olho inteiro vira
    pálpebra) e que contém branco do olho. As sobrancelhas também diferem, mas em faixas finas e separadas: ficam de fora."""
    rgb = c[..., :3]
    r, b = rgb[..., 0], rgb[..., 2]
    branco = (rgb.min(-1) > 150) & (rgb.max(-1) - rgb.min(-1) < 40) & (b >= r - 12) & (c[..., 3] > 250)
    branco[int(limite_y):] = False
    branco = ndi.binary_opening(branco, iterations=1)
    d = np.abs(rgb - O[..., :3].astype(float)).max(-1) * (O[..., 3] / 255) * (c[..., 3] / 255)
    muda = ndi.binary_opening(ndi.gaussian_filter(d, 1.5) > 70, iterations=2)
    muda = ndi.binary_fill_holes(ndi.binary_closing(muda, iterations=3))
    muda[int(limite_y):] = False
    lbl, n = ndi.label(muda)
    if n == 0:
        return []
    com_branco = ndi.sum(branco, lbl, range(1, n + 1))
    area = ndi.sum(muda, lbl, range(1, n + 1))
    ids = [i + 1 for i in np.argsort(com_branco)[::-1][:2] if com_branco[i] > 20]
    caixas = []
    for i in ids:
        ys, xs = np.where(lbl == i)
        caixas.append((xs.min(), ys.min(), xs.max() + 1, ys.max() + 1, lbl == i))
    return sorted(caixas, key=lambda t: t[0])


def sobrancelha_acima(c, caixa):
    """Linha de baixo da sobrancelha acima do olho (marrom escuro), ou None."""
    x0, y0, x1, y1 = caixa
    h = y1 - y0
    rgb = c[..., :3]
    lum = rgb.mean(-1)
    escuro = (lum < 95) & (rgb[..., 0] > rgb[..., 2]) & (c[..., 3] > 250)
    faixa = escuro[max(0, int(y0 - 1.3 * h)):int(y0 - 0.05 * h), x0:x1]
    linhas = np.where(faixa.sum(1) > 0.15 * (x1 - x0))[0]
    if not len(linhas):
        return None
    return max(0, int(y0 - 1.3 * h)) + linhas.max()


def zonas(pasta, pose):
    o = pose["olhos"]
    fx = pose["fx"]
    P = np.asarray(Image.open(os.path.join(pasta, pose["file"])).convert("RGBA")).astype(float)
    O = Image.open(os.path.join(pasta, o["file"]))
    x0, y0 = round(o["x"] * fx), round(o["y"] * fx)
    W, H = O.size
    c = P[y0:y0 + H, x0:x0 + W]
    limite = (pose["ny"] - o["y"]) * fx  # olhos ficam acima do focinho
    out = []
    for caixa in olhos_abertos(c, np.asarray(O.convert("RGBA")), limite):
        a, b, cc, d, mancha = caixa
        cx, cy = (a + cc) / 2, (b + d) / 2
        # elipse com a proporção da caixa do olho, crescida até a mancha inteira caber no núcleo opaco (+1 px do arquivo)
        yy, xx = np.where(mancha)
        ea, eb = (cc - a) / 2, (d - b) / 2
        k = float(np.sqrt(((xx + 0.5 - cx) / ea) ** 2 + ((yy + 0.5 - cy) / eb) ** 2).max())
        rx, ry = (ea * k + 1) / NUCLEO, (eb * k + 1) / NUCLEO
        sob = sobrancelha_acima(c, (a, b, cc, d))
        fora = (((xx - cx) / (rx * NUCLEO)) ** 2 + ((yy - cy) / (ry * NUCLEO)) ** 2 > 1).mean()
        if fora > 0.002:
            print(f"   aviso: {fora:.1%} do olho aberto fica fora do núcleo opaco")
        out.append({k: round(float(v) / fx, 2) for k, v in dict(cx=cx, cy=cy, rx=rx, ry=ry).items()})
        if sob is not None and cy - ry < sob:
            print(f"   aviso: a borda apagada da zona passa {(sob - (cy - ry)) / fx:.1f} px lógicos da linha de baixo da sobrancelha")
    return out, c, np.asarray(O.convert("RGBA"))


def main():
    gravar = "--gravar" in sys.argv
    folha = sys.argv[sys.argv.index("--folha") + 1] if "--folha" in sys.argv else None
    quadros = []
    for pid in ("stazi", "stazia"):
        pasta = os.path.join(SPRITES, pid)
        caminho = os.path.join(pasta, "manifest.json")
        with open(caminho, encoding="utf-8") as f:
            man = json.load(f)
        for chave, pose in man.items():
            if not isinstance(pose, dict) or "olhos" not in pose:
                continue
            zs, c, O = zonas(pasta, pose)
            if len(zs) != 2:
                raise SystemExit(f"{pid} {chave}: achei {len(zs)} olho(s), esperado 2")
            print(f"{pid:6} {chave:10} zonas {zs}")
            pose["olhos"]["zonas"] = zs
            if folha:
                fx = pose["fx"]
                im = Image.fromarray(c.astype("uint8")).convert("RGB")
                ov = Image.fromarray(c.astype("uint8"))
                ov.alpha_composite(Image.fromarray(O))
                for base in (im, ov):
                    dr = ImageDraw.Draw(base)
                    for z in zs:
                        dr.ellipse([(z["cx"] - z["rx"]) * fx, (z["cy"] - z["ry"]) * fx, (z["cx"] + z["rx"]) * fx, (z["cy"] + z["ry"]) * fx], outline=(0, 255, 120), width=2)
                quadros.append((f"{pid} {chave}", im, ov.convert("RGB")))
        if gravar:
            with open(caminho, "w", encoding="utf-8") as f:
                f.write(json.dumps(man, ensure_ascii=False, indent=1))
    if folha:
        hmax = 260
        linhas = []
        for nome, a, b in quadros:
            k = hmax / a.size[1]
            a2, b2 = a.resize((int(a.size[0] * k), hmax)), b.resize((int(b.size[0] * k), hmax))
            L = Image.new("RGB", (a2.size[0] * 2 + 10, hmax + 24), "white")
            L.paste(a2, (0, 24)); L.paste(b2, (a2.size[0] + 10, 24))
            ImageDraw.Draw(L).text((4, 4), nome, fill="black")
            linhas.append(L)
        S = Image.new("RGB", (max(l.size[0] for l in linhas), sum(l.size[1] for l in linhas)), "white")
        y = 0
        for l in linhas:
            S.paste(l, (0, y)); y += l.size[1]
        S.save(folha)


if __name__ == "__main__":
    main()
