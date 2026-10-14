"""Gera as logos novas do StaziaMed (fundo transparente, tamanhos, variantes, favicons, OG).
Uso: pdfpython scripts/logos/gerar-logos.py "<pasta Novas Logos>" public/brand
Os originais NAO sao alterados."""
import sys, glob, os
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

src, out = sys.argv[1], sys.argv[2]
os.makedirs(out, exist_ok=True)
files = {s: glob.glob(os.path.join(src, f'*{s}.png'))[0] for s in ('21_05_48', '21_05_54', '21_05_59')}
NAVY = (11, 36, 71)
if len(sys.argv) > 3: files['21_05_48'] = sys.argv[3]  # logo horizontal em resolucao maior (opcional)

def unmix(path):
    a = np.asarray(Image.open(path).convert('RGB')).astype(np.float64)
    bg = 254.0
    m = a.min(axis=2)
    alpha = np.clip((bg - m) / (bg - 14.0), 0, 1)
    alpha[alpha < 0.05] = 0
    alpha = np.where(alpha > 0.97, 1.0, alpha)
    safe = np.maximum(alpha, 1e-3)[..., None]
    col = (a - bg * (1 - alpha[..., None])) / safe
    col = np.clip(col, 0, 255)
    col[alpha == 0] = 0
    return col, alpha

def to_img(col, alpha, crop=True):
    rgba = np.dstack([col, alpha * 255]).round().astype(np.uint8)
    im = Image.fromarray(rgba, 'RGBA')
    if crop:
        bb = Image.fromarray((alpha > 0.1).astype(np.uint8) * 255).getbbox()
        im = im.crop(bb)
    return im

def navy_t(col):
    b = col[..., 2]
    return np.clip((150 - b) / 55.0, 0, 1)   # 1 = azul-marinho, 0 = azul claro

def variant_dark(col):
    t = navy_t(col)[..., None]
    light = np.array([236, 244, 255], dtype=np.float64)  # marinho -> azul bem claro
    return col * (1 - t) + light * t

def variant_mono(col, alpha, white=False):
    lum = (0.299 * col[..., 0] + 0.587 * col[..., 1] + 0.114 * col[..., 2]) / 255.0
    a2 = alpha * np.clip(1.05 - lum * 0.9, 0.35, 1.0)
    base = np.zeros_like(col) + (255 if white else 0)
    if not white:
        base = np.zeros_like(col) + np.array(NAVY, dtype=np.float64)
    return base, a2

def save_sizes(im, name, widths):
    im.save(f'{out}/{name}.png', optimize=True)  # nativo
    for w in widths:
        if w >= im.width: continue
        h = round(im.height * w / im.width)
        im.resize((w, h), Image.LANCZOS).save(f'{out}/{name}-{w}w.png', optimize=True)

kinds = {'horizontal': ('21_05_48', [160, 240, 320, 480, 640, 960, 1280]),
         'vertical': ('21_05_59', [120, 180, 240, 360, 480, 720]),
         'simbolo': ('21_05_54', [32, 48, 64, 96, 128, 192, 256, 512])}
res = {}
for k, (s, widths) in kinds.items():
    col, alpha = unmix(files[s])
    bb = Image.fromarray((alpha > 0.1).astype(np.uint8) * 255).getbbox()
    def crop(arr): return arr[bb[1]:bb[3], bb[0]:bb[2]]
    col, alpha = crop(col), crop(alpha)
    res[k] = (col, alpha)
    save_sizes(to_img(col, alpha, False), k, widths)
    save_sizes(to_img(variant_dark(col), alpha, False), f'{k}-escuro', widths)
    mc, ma = variant_mono(col, alpha)
    save_sizes(to_img(mc, ma, False), f'{k}-mono', widths)
    mc, ma = variant_mono(col, alpha, True)
    save_sizes(to_img(mc, ma, False), f'{k}-mono-branco', widths)

# --- simbolo: favicons e icones -----------------------------------------
sym = to_img(*res['simbolo'], crop=False)
symd = to_img(variant_dark(res['simbolo'][0]), res['simbolo'][1], False)

def tile(size, bg, glyph, pad_frac, round_frac=0.0):
    im = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    if bg is not None:
        d.rounded_rectangle([0, 0, size - 1, size - 1], radius=int(size * round_frac), fill=bg)
    inner = int(size * (1 - 2 * pad_frac))
    g = glyph.copy(); g.thumbnail((inner, inner), Image.LANCZOS)
    im.alpha_composite(g, ((size - g.width) // 2, (size - g.height) // 2))
    return im

BG = (255, 255, 255, 255)
for s in (16, 32, 48):
    tile(s, BG, sym, 0.10, 0.22).save(f'{out}/favicon-{s}.png', optimize=True)
tile(180, BG, sym, 0.17).save(f'{out}/apple-touch-icon.png', optimize=True)          # iOS: sem cantos, o iOS arredonda
tile(192, BG, sym, 0.17, 0.2).save(f'{out}/icon-192.png', optimize=True)
tile(512, BG, sym, 0.17, 0.2).save(f'{out}/icon-512.png', optimize=True)
tile(512, BG, sym, 0.27).save(f'{out}/icon-512-maskable.png', optimize=True)         # zona segura maskable
tile(192, BG, sym, 0.27).save(f'{out}/icon-192-maskable.png', optimize=True)
ico = [Image.open(f'{out}/favicon-{s}.png') for s in (16, 32, 48)]
ico[2].save(f'{out}/favicon.ico', sizes=[(16, 16), (32, 32), (48, 48)], append_images=ico[:2])

# --- imagem social (OG) 1200x630 -----------------------------------------
og = Image.new('RGBA', (1200, 630), (255, 255, 255, 255))
h = to_img(*res['horizontal'], crop=False)
h.thumbnail((860, 360), Image.LANCZOS)
og.alpha_composite(h, ((1200 - h.width) // 2, (630 - h.height) // 2))
og.convert('RGB').save(f'{out}/og-image.png', optimize=True)
og2 = Image.new('RGBA', (1200, 630), (6, 20, 44, 255))
hd = to_img(variant_dark(res['horizontal'][0]), res['horizontal'][1], False)
hd.thumbnail((860, 360), Image.LANCZOS)
og2.alpha_composite(hd, ((1200 - hd.width) // 2, (630 - hd.height) // 2))
og2.convert('RGB').save(f'{out}/og-image-escuro.png', optimize=True)
print('ok', sorted(os.listdir(out))[:5], len(os.listdir(out)))

# --- logo embutida nos materiais visuais (HTML sem arquivos externos) ----------------
import base64
def b64(name): return base64.b64encode(open(f'{out}/{name}','rb').read()).decode()
ts = os.path.join(os.path.dirname(os.path.abspath(__file__)), '../../src/shared/visualMaterials/logoData.ts')
open(ts, 'w').write(
    '// GERADO por scripts/logos/gerar-logos.py a partir das logos novas (public/brand). Nao editar a mao.\n'
    f'// Proporcao do arquivo: {res["horizontal"][0].shape[1]} x {res["horizontal"][0].shape[0]} (largura / altura).\n'
    f'export const LOGO_ASPECT = {res["horizontal"][0].shape[1]} / {res["horizontal"][0].shape[0]};\n'
    f'export const LOGO_ON_LIGHT = "data:image/png;base64,{b64("horizontal-480w.png")}";\n'
    f'export const LOGO_ON_DARK = "data:image/png;base64,{b64("horizontal-escuro-480w.png")}";\n')
