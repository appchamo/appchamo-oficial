#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Post feed 1080 - Dica Chamo (laranja) v3.
   Titulo Montserrat Bold (-30%) | texto Montserrat Light | 'Dica Chamo' Jost(Futura) Regular.
   Fundo laranja degrade + mockup de celular com borrao de movimento + ruido 20%."""
import math
import numpy as np
from PIL import Image, ImageDraw, ImageFont, ImageFilter

FB = "/sessions/great-kind-keller/mnt/outputs/brandfonts"
def F(n, s): return ImageFont.truetype(f"{FB}/{n}", s)

S, SS = 1080, 3
W = S * SS
M = 100 * SS

LARANJA     = (255, 122, 0)
LARANJA_ESC = (198, 84, 0)

def lerp(a, b, t): return tuple(int(a[i] + (b[i]-a[i])*t) for i in range(3))

# ---------------- phone mockup tile ----------------
def phone_tile():
    pw, ph = 400*SS, 820*SS
    pad = 30*SS
    tw, th = pw+pad*2, ph+pad*2
    im = Image.new("RGBA", (tw, th), (0,0,0,0))
    d = ImageDraw.Draw(im)
    x0, y0 = pad, pad
    x1, y1 = pad+pw, pad+ph
    r = 78*SS
    # corpo do celular
    d.rounded_rectangle([x0, y0, x1, y1], radius=r, fill=(28,26,24,255))
    d.rounded_rectangle([x0, y0, x1, y1], radius=r, outline=(64,58,52,255), width=4*SS)
    # tela
    sm = 16*SS
    sx0, sy0, sx1, sy1 = x0+sm, y0+sm, x1-sm, y1-sm
    sr = 64*SS
    d.rounded_rectangle([sx0, sy0, sx1, sy1], radius=sr, fill=(248,246,243,255))
    # header laranja
    hh = 210*SS
    hd = Image.new("RGBA", im.size, (0,0,0,0))
    hdd = ImageDraw.Draw(hd)
    hdd.rounded_rectangle([sx0, sy0, sx1, sy0+hh+sr], radius=sr, fill=LARANJA+(255,))
    hdd.rectangle([sx0, sy0+hh, sx1, sy0+hh+sr], fill=(0,0,0,0))
    # recorta header dentro da tela
    mask = Image.new("L", im.size, 0)
    ImageDraw.Draw(mask).rounded_rectangle([sx0, sy0, sx1, sy1], radius=sr, fill=255)
    im.paste(hd, (0,0), Image.composite(hd.split()[3], Image.new("L",im.size,0), mask))
    d = ImageDraw.Draw(im)
    # notch
    nw = 150*SS
    d.rounded_rectangle([(sx0+sx1)//2-nw//2, sy0+14*SS, (sx0+sx1)//2+nw//2, sy0+40*SS],
                        radius=13*SS, fill=(28,26,24,255))
    # logo C no header
    cx, cy, cr = sx0+70*SS, sy0+118*SS, 40*SS
    d.ellipse([cx-cr, cy-cr, cx+cr, cy+cr], fill=(255,255,255,255))
    d.arc([cx-24*SS, cy-24*SS, cx+24*SS, cy+24*SS], 42, 318, fill=LARANJA+(255,), width=11*SS)
    hf = F("Montserrat-Bold.ttf", 46*SS)
    d.text((cx+cr+22*SS, cy-30*SS), "Chamô", font=hf, fill=(255,255,255,255))
    # search pill
    py = sy0+hh+46*SS
    d.rounded_rectangle([sx0+40*SS, py, sx1-40*SS, py+72*SS], radius=36*SS, fill=(236,232,227,255))
    d.ellipse([sx0+66*SS, py+20*SS, sx0+66*SS+32*SS, py+20*SS+32*SS], outline=(150,140,130,255), width=6*SS)
    # rows de profissionais
    ry = py+120*SS
    for i in range(4):
        av = sx0+40*SS
        d.ellipse([av, ry, av+84*SS, ry+84*SS], fill=LARANJA+(255,))
        d.arc([av+22*SS, ry+22*SS, av+62*SS, ry+62*SS], 42, 318, fill=(255,255,255,255), width=7*SS)
        d.rounded_rectangle([av+112*SS, ry+8*SS, av+112*SS+300*SS, ry+8*SS+26*SS], radius=13*SS, fill=(60,54,48,255))
        d.rounded_rectangle([av+112*SS, ry+50*SS, av+112*SS+200*SS, ry+50*SS+22*SS], radius=11*SS, fill=(196,188,180,255))
        # estrelas
        for s in range(5):
            stx = sx1-40*SS-(5-s)*34*SS
            d.text((stx, ry+8*SS), "★", font=F("Montserrat-Regular.ttf", 26*SS), fill=(255,178,40,255))
        ry += 130*SS
    return im

def motion_blur_np(rgba_img, angle_deg=180, length=150, decay=0.85):
    arr = np.asarray(rgba_img).astype(np.float32)
    h, w = arr.shape[:2]
    acc = np.zeros_like(arr); wsum = 0.0
    rad = math.radians(angle_deg)
    for k in range(length):
        wt = (1.0 - decay*(k/length))
        if wt <= 0: continue
        dx = int(round(math.cos(rad)*k)); dy = int(round(math.sin(rad)*k))
        sh = np.roll(arr, (dy, dx), axis=(0,1))
        # zera regiao que deu wrap no eixo x
        if dx < 0: sh[:, dx:, :] = 0
        elif dx > 0: sh[:, :dx, :] = 0
        if dy < 0: sh[dy:, :, :] = 0
        elif dy > 0: sh[:dy, :, :] = 0
        acc += sh*wt; wsum += wt
    return Image.fromarray(np.clip(acc/wsum, 0, 255).astype(np.uint8), "RGBA")

def add_noise(img, amount=0.20):
    # grao suave: std ~ amount*35 (mais discreto)
    arr = np.asarray(img).astype(np.float32)
    n = np.random.normal(0, 255, arr.shape[:2])[..., None]
    arr[..., :3] = np.clip(arr[..., :3] + n*amount*0.135, 0, 255)
    return Image.fromarray(arr.astype(np.uint8), img.mode)

def build():
    base = Image.new("RGB", (W, W))
    d = ImageDraw.Draw(base, "RGBA")
    # degrade laranja
    for y in range(W):
        d.line([(0, y), (W, y)], fill=lerp((183,74,0), (255,140,28), y/W))

    # -------- mockup celular com borrao de movimento --------
    tile = phone_tile().rotate(-13, expand=True, resample=Image.BICUBIC)
    layer = Image.new("RGBA", (W, W), (0,0,0,0))
    # posiciona no canto inferior-direito, saindo um pouco da tela
    px = W - int(tile.width*0.74)
    py = int(W*0.30)
    layer.alpha_composite(tile, (px, py))
    blurred = motion_blur_np(layer, angle_deg=178, length=190, decay=0.9)
    # opacidade geral do mockup (elemento de fundo)
    ba = np.asarray(blurred).astype(np.float32)
    ba[..., 3] *= 0.55
    blurred = Image.fromarray(ba.astype(np.uint8), "RGBA")
    base = Image.alpha_composite(base.convert("RGBA"), blurred).convert("RGB")
    d = ImageDraw.Draw(base, "RGBA")

    TITULO = (255,255,255); TEXTO = (255,241,228); HI = (255,224,196)

    # KICKER - Jost (Futura) Regular
    def spaced(s): return " ".join(list(s))
    kick = F("Jost-Regular.ttf", 33*SS)
    ktxt = spaced("DICA") + "   " + spaced("CHAMÔ")
    kb = d.textbbox((0,0), ktxt, font=kick); kw, kh = kb[2]-kb[0], kb[3]-kb[1]
    px0, py0 = M, M
    pdx, pdy = 40*SS, 26*SS
    d.rounded_rectangle([px0, py0, px0+kw+pdx*2, py0+kh+pdy*2], radius=(kh+pdy*2)//2, fill=(255,255,255,255))
    d.text((px0+pdx, py0+pdy-kb[1]), ktxt, font=kick, fill=LARANJA_ESC)

    # HEADLINE Montserrat Bold
    head = F("Montserrat-Bold.ttf", 67*SS)
    hy = py0 + kh + pdy*2 + 78*SS
    lh = 72*SS
    d.text((M, hy), "Foto boa", font=head, fill=TITULO); hy += lh
    d.text((M, hy), "puxa mais", font=head, fill=TITULO); hy += lh
    d.text((M, hy), "cliente", font=head, fill=HI); hy += lh

    # CORPO Montserrat Regular
    body = F("Montserrat-Regular.ttf", 26*SS)
    by = hy + 24*SS
    for ln in ("No Chamô, perfil com foto e serviços bem",
               "listados passa confiança e aparece na frente.",
               "Já caprichou no seu?"):
        d.text((M, by), ln, font=body, fill=TEXTO); by += 40*SS

    # FOOTER
    fyl = W - 152*SS
    d.line([(M, fyl), (W-M, fyl)], fill=(255,255,255,60), width=2*SS)
    lx, ly, lr = M+34*SS, W-96*SS, 34*SS
    d.ellipse([lx-lr, ly-lr, lx+lr, ly+lr], fill=(255,255,255,255))
    d.arc([lx-18*SS, ly-18*SS, lx+18*SS, ly+18*SS], 42, 318, fill=LARANJA, width=9*SS)
    d.text((lx+lr+26*SS, ly-32*SS), "Chamô", font=F("Montserrat-Bold.ttf", 38*SS), fill=TITULO)
    d.text((lx+lr+26*SS, ly+14*SS), "seu serviço, na palma da mão", font=F("Montserrat-Light.ttf", 25*SS), fill=TEXTO)

    out = base.resize((S, S), Image.LANCZOS)
    out = add_noise(out, amount=0.20)
    p = "/sessions/great-kind-keller/mnt/outputs/dica-preco-laranja.png"
    out.save(p, "PNG")
    return p

print(build())
