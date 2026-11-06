"""Procedural original sprites (PIL). Usage: python -I sprites.py <out_dir>"""
import math, random, sys, os
from PIL import Image, ImageDraw, ImageFilter, ImageChops

S = 2048
OUT = sys.argv[1]
K = S * 0.45


def T(x, y):
    return (S / 2 + x * K, S / 2 + y * K)


def bez(p0, p1, p2, p3, n=40):
    pts = []
    for i in range(n + 1):
        t = i / n
        a, b, c, d = (1 - t) ** 3, 3 * t * (1 - t) ** 2, 3 * t * t * (1 - t), t ** 3
        pts.append((a * p0[0] + b * p1[0] + c * p2[0] + d * p3[0], a * p0[1] + b * p1[1] + c * p2[1] + d * p3[1]))
    return pts


def path(segs):
    pts = []
    for s in segs:
        pts += bez(*s)
    return pts


def mirror(pts):
    return pts + [(-x, y) for x, y in reversed(pts)]


def xf(pts, rot=0.0, sc=1.0, dx=0.0, dy=0.0):
    c, s = math.cos(rot), math.sin(rot)
    return [((x * c - y * s) * sc + dx, (x * s + y * c) * sc + dy) for x, y in pts]


def canvas():
    return Image.new("RGBA", (S, S), (0, 0, 0, 0))


def poly(im, pts, fill):
    ImageDraw.Draw(im).polygon([T(*p) for p in pts], fill=fill)


def line(im, pts, fill, w):
    d = ImageDraw.Draw(im)
    tp = [T(*p) for p in pts]
    d.line(tp, fill=fill, width=int(w), joint="curve")
    r = w / 2
    for x, y in (tp[0], tp[-1]):
        d.ellipse((x - r, y - r, x + r, y + r), fill=fill)


def clip(layer, mask_img):
    """Keep layer only where mask_img has alpha."""
    a = ImageChops.multiply(layer.getchannel("A"), mask_img.getchannel("A"))
    layer.putalpha(a)
    return layer


def shade(base, pts, fill):
    """Paint a cel-shade polygon onto base, clipped to base's silhouette."""
    lay = canvas()
    poly(lay, pts, fill)
    base.alpha_composite(clip(lay, base))


def outline(im, color, px=18):
    a = im.getchannel("A").filter(ImageFilter.GaussianBlur(px * 0.6))
    a = a.point(lambda v: 255 if v > 8 else 0).filter(ImageFilter.GaussianBlur(1.5))
    ol = Image.new("RGBA", im.size, color + (0,))
    ol.putalpha(a)
    ol.alpha_composite(im)
    return ol


def save(im, name):
    im = im.resize((S // 2, S // 2), Image.LANCZOS)
    bb = im.getchannel("A").point(lambda v: 255 if v > 4 else 0).getbbox()
    assert bb, name + " is empty"
    im = im.crop(bb)
    w, h = im.size
    f = 512 / max(w, h)
    im = im.resize((max(1, round(w * f)), max(1, round(h * f))), Image.LANCZOS)
    assert im.getchannel("A").getextrema()[0] == 0, name + " has no transparency"
    im.save(os.path.join(OUT, name + ".webp"), "WEBP", quality=88, method=6)
    print(name, im.size)


# ---------- sakura petal ----------
def sakura():
    right = path([((0, 0.9), (0.62, 0.62), (0.8, -0.55), (0.36, -0.95)),
                  ((0.36, -0.95), (0.22, -0.97), (0.09, -0.88), (0, -0.68))])
    pet = mirror(right)
    im = canvas()
    poly(im, pet, (250, 196, 212, 255))
    grad = Image.new("RGBA", (S, S), (226, 110, 148, 0))
    y0, y1 = int(T(0, -0.1)[1]), int(T(0, 0.9)[1])
    grad.putalpha(Image.linear_gradient("L").resize((S, y1 - y0)).crop((0, 0, S, y1 - y0)).transform(
        (S, S), Image.AFFINE, (1, 0, 0, 0, 1, -y0), fillcolor=0))
    im.alpha_composite(clip(grad, im))
    shade(im, path([((-0.42, -0.7), (-0.55, -0.3), (-0.45, 0.1), (-0.3, 0.3)),
                    ((-0.3, 0.3), (-0.32, 0.0), (-0.36, -0.4), (-0.42, -0.7))]), (255, 228, 236, 255))
    line(im, [(0, 0.82), (0, 0.1)], (214, 96, 136, 255), 10)
    line(im, [(0, 0.82), (0.16, 0.05)], (214, 96, 136, 200), 7)
    line(im, [(0, 0.82), (-0.16, 0.05)], (214, 96, 136, 200), 7)
    save(outline(im, (168, 66, 104), 16), "sakura")


# ---------- leaf ----------
def leaf_img(green=(110, 196, 64), dark=(70, 150, 44), light=(170, 228, 110)):
    right = path([((0, 0.72), (0.66, 0.46), (0.62, -0.46), (0, -0.96))])
    lf = mirror(right)
    im = canvas()
    poly(im, lf, green + (255,))
    shade(im, right + [(0, 0.72)], dark + (255,))
    shade(im, path([((-0.38, 0.2), (-0.46, -0.1), (-0.34, -0.45), (-0.2, -0.62)),
                    ((-0.2, -0.62), (-0.25, -0.3), (-0.3, 0.0), (-0.38, 0.2))]), light + (255,))
    vein = (46, 104, 30, 255)
    line(im, [(0, 0.98), (0, 0.72)] + bez((0, 0.72), (0.02, 0.2), (0.01, -0.4), (0, -0.85))[1:], vein, 16)
    for i, y in enumerate((0.45, 0.15, -0.15, -0.42)):
        s = 1 - i * 0.15
        line(im, [(0, y), (0.32 * s, y - 0.2)], vein, 9)
        line(im, [(0, y), (-0.32 * s, y - 0.2)], vein, 9)
    return im


def leaf():
    save(outline(leaf_img(), (30, 70, 22), 16), "leaf")


# ---------- log ----------
def log():
    im = canvas()
    brown, dark, light = (140, 90, 50, 255), (104, 66, 34, 255), (176, 120, 66, 255)
    x0, x1, yt, yb, ry = -0.36, 0.36, -0.78, 0.84, 0.13
    d = ImageDraw.Draw(im)
    poly(im, [(x0, yt), (x1, yt), (x1, yb), (x0, yb)], brown)
    d.ellipse((*T(x0, yb - ry), *T(x1, yb + ry)), fill=brown)
    shade(im, [(0.14, -1), (1, -1), (1, 1.2), (0.14, 1.2)], dark)
    shade(im, [(-0.3, -1), (-0.16, -1), (-0.16, 1.2), (-0.3, 1.2)], light)
    rnd = random.Random(3)
    bark = (70, 42, 20, 255)
    for x in (-0.26, -0.1, 0.05, 0.2, 0.3):
        pts = [(x + rnd.uniform(-0.02, 0.02), yt + 0.1)]
        y = yt + 0.1
        while y < yb:
            y += rnd.uniform(0.12, 0.22)
            pts.append((x + rnd.uniform(-0.03, 0.03), min(y, yb)))
        line(im, pts, bark, 9)
    # knot
    d.ellipse((*T(-0.05, 0.12), *T(0.13, 0.32)), fill=(84, 52, 26, 255))
    d.ellipse((*T(0.0, 0.17), *T(0.08, 0.27)), fill=(150, 100, 56, 255))
    # top end grain
    d.ellipse((*T(x0, yt - ry), *T(x1, yt + ry)), fill=(232, 186, 122, 255))
    for i, k in enumerate((0.8, 0.58, 0.36, 0.14)):
        d.ellipse((*T(x0 * k, yt - ry * k), *T(x1 * k, yt + ry * k)), outline=(184, 130, 74, 255), width=7)
    d.ellipse((*T(x0, yt - ry), *T(x1, yt + ry)), outline=(70, 42, 20, 255), width=12)
    save(outline(im, (58, 36, 18), 16), "log")


# ---------- glyph helper (invented marks, not a real script) ----------
def glyph(im, rnd, cx, cy, size, rot, color, w):
    for _ in range(rnd.randint(2, 4)):
        kind = rnd.random()
        if kind < 0.4:
            a = (rnd.uniform(-0.5, 0.5), rnd.uniform(-0.5, 0.5))
            b = (rnd.uniform(-0.5, 0.5), rnd.uniform(-0.5, 0.5))
            pts = [a, b]
        elif kind < 0.75:
            r = rnd.uniform(0.2, 0.45)
            s0 = rnd.uniform(0, 6.28)
            pts = [(r * math.cos(s0 + t / 10 * 3.5), r * math.sin(s0 + t / 10 * 3.5)) for t in range(11)]
        else:
            pts = [(-0.4, rnd.uniform(-0.4, 0.4)), (0, rnd.uniform(-0.5, 0.5)), (0.4, rnd.uniform(-0.4, 0.4))]
        line(im, xf(pts, rot, size, cx, cy), color, w)
    if rnd.random() < 0.5:
        x, y = xf([(rnd.uniform(-0.4, 0.4), rnd.uniform(-0.4, 0.4))], rot, size, cx, cy)[0]
        r = w * 0.9
        px, py = T(x, y)
        ImageDraw.Draw(im).ellipse((px - r, py - r, px + r, py + r), fill=color)


# ---------- paper tag ----------
def paper_tag():
    im = canvas()
    w, h = 0.34, 0.96
    poly(im, [(-w, -h), (w, -h), (w, h), (-w, h)], (244, 232, 202, 255))
    shade(im, [(0.2, -1), (1, -1), (1, 1), (0.2, 1)], (226, 210, 172, 255))
    red = (192, 52, 40, 255)
    d = ImageDraw.Draw(im)
    d.rectangle((*T(-w + 0.05, -h + 0.05), *T(w - 0.05, h - 0.05)), outline=red, width=16)
    rnd = random.Random(7)
    ink = (30, 24, 22, 255)
    line(im, bez((0, -0.8), (0.03, -0.3), (-0.03, 0.3), (0, 0.78)), ink, 26)
    for i, y in enumerate((-0.6, -0.3, 0.0, 0.3, 0.58)):
        glyph(im, rnd, 0, y, 0.34, rnd.uniform(-0.3, 0.3), ink if i % 2 == 0 else red, 15)
    r = 0.1
    d.ellipse((*T(-r, 0.66), *T(r, 0.86)), outline=red, width=14)
    save(outline(im, (90, 70, 50), 10), "paper-tag")


# ---------- seal circle (white ink) ----------
def seal_circle():
    im = canvas()
    wt = (255, 255, 255, 255)
    d = ImageDraw.Draw(im)
    for r, w in ((1.0, 22), (0.93, 9), (0.62, 16), (0.555, 8), (0.24, 12)):
        d.ellipse((*T(-r, -r), *T(r, r)), outline=wt, width=w)
    # hexagram-free star: 8-point polygon of two offset squares
    for off in (0, math.pi / 4):
        pts = [(0.555 * math.cos(off + k * math.pi / 2), 0.555 * math.sin(off + k * math.pi / 2)) for k in range(5)]
        line(im, pts, wt, 9)
    for k in range(8):
        a = k * math.pi / 4 + math.pi / 8
        line(im, [(0.24 * math.cos(a), 0.24 * math.sin(a)), (0.4 * math.cos(a), 0.4 * math.sin(a))], wt, 9)
        cx, cy = 0.965 * math.cos(a - math.pi / 8), 0.965 * math.sin(a - math.pi / 8)
        px, py = T(cx, cy)
        r = 22
        d.ellipse((px - r, py - r, px + r, py + r), fill=wt)
    rnd = random.Random(11)
    n = 20
    for k in range(n):
        a = k * 2 * math.pi / n
        glyph(im, rnd, 0.775 * math.cos(a), 0.775 * math.sin(a), 0.2, a + math.pi / 2, wt, 11)
    spiral = [(0.2 * t / 60 * math.cos(t / 60 * 3 * 2 * math.pi), 0.2 * t / 60 * math.sin(t / 60 * 3 * 2 * math.pi)) for t in range(61)]
    line(im, spiral, wt, 12)
    save(im, "seal-circle")


# ---------- rock ----------
def rock():
    rnd = random.Random(5)
    n = 10
    pts = []
    for k in range(n):
        a = -math.pi / 2 + k * 2 * math.pi / n + rnd.uniform(-0.15, 0.15)
        r = rnd.uniform(0.72, 0.95)
        pts.append((r * math.cos(a), r * math.sin(a) * 0.8 + 0.05))
    c = (-0.12, -0.12)
    im = canvas()
    light = (-0.6, -0.8)
    for i in range(n):
        p, q = pts[i], pts[(i + 1) % n]
        mx, my = (p[0] + q[0]) / 2 - c[0], (p[1] + q[1]) / 2 - c[1]
        ln = math.hypot(mx, my) or 1
        dot = (mx * light[0] + my * light[1]) / ln
        v = int(128 + 60 * dot)
        poly(im, [c, p, q], (v, v - 4, v - 10, 255))
    tri = canvas()  # top facet highlight
    poly(tri, [c, pts[8], pts[9], pts[0], pts[1]], (196, 192, 184, 255))
    im.alpha_composite(tri)
    edge = (60, 56, 52, 255)
    for p in pts:
        line(im, [c, p], edge, 7)
    line(im, [(0.2, 0.1), (0.35, 0.3), (0.3, 0.5)], (50, 46, 42, 255), 10)
    line(im, [(-0.5, 0.2), (-0.35, 0.35)], (50, 46, 42, 255), 9)
    save(outline(im, (40, 36, 34), 18), "rock")


# ---------- ice crystal ----------
def shard(im, bx, by, tx, ty, w):
    ang = math.atan2(ty - by, tx - bx)
    nx, ny = -math.sin(ang), math.cos(ang)
    L = math.hypot(tx - bx, ty - by)
    ux, uy = (tx - bx) / L, (ty - by) / L
    sh = (bx + ux * L * 0.72, by + uy * L * 0.72)
    pts_l = [(tx, ty), (sh[0] + nx * w, sh[1] + ny * w), (bx + nx * w * 0.8, by + ny * w * 0.8), (bx, by)]
    pts_r = [(tx, ty), (sh[0] - nx * w, sh[1] - ny * w), (bx - nx * w * 0.8, by - ny * w * 0.8), (bx, by)]
    lay = canvas()
    poly(lay, pts_l, (214, 246, 255, 255))
    poly(lay, pts_r, (120, 200, 236, 255))
    line(lay, [(tx, ty), (bx, by)], (255, 255, 255, 255), 10)
    line(lay, [(sh[0] + nx * w * 0.5, sh[1] + ny * w * 0.5), (bx + nx * w * 0.45, by + ny * w * 0.45)], (255, 255, 255, 200), 8)
    lay = outline(lay, (40, 110, 150), 12)
    im.alpha_composite(lay)


def ice_crystal():
    im = canvas()
    for bx, tx, ty, w in ((-0.3, -0.75, -0.35, 0.13), (0.3, 0.72, -0.45, 0.13), (-0.12, -0.32, -0.75, 0.15),
                          (0.12, 0.35, -0.7, 0.14), (0.0, 0.02, -1.0, 0.2)):
        shard(im, bx, 0.75, tx, ty, w)
    save(im, "ice-crystal")


# ---------- kunai ----------
def kunai():
    im = canvas()
    d = ImageDraw.Draw(im)
    blade_r = [(0, -0.97), (0.19, -0.36), (0.06, -0.12), (0, -0.12)]
    blade_l = [(-x, y) for x, y in blade_r]
    poly(im, blade_l, (176, 186, 196, 255))
    poly(im, blade_r, (92, 102, 112, 255))
    line(im, [(-0.012, -0.9), (-0.16, -0.38)], (236, 242, 248, 255), 9)
    line(im, [(0, -0.95), (0, -0.14)], (60, 66, 74, 255), 7)
    # handle wrap
    poly(im, [(-0.055, -0.14), (0.055, -0.14), (0.055, 0.62), (-0.055, 0.62)], (40, 38, 42, 255))
    y = -0.12
    while y < 0.6:
        line(im, [(-0.05, y + 0.06), (0.05, y)], (96, 92, 100, 255), 12)
        y += 0.1
    # ring
    r1, r2 = 0.16, 0.1
    cy = 0.77
    d.ellipse((*T(-r1, cy - r1), *T(r1, cy + r1)), fill=(120, 130, 140, 255))
    d.ellipse((*T(-r2, cy - r2), *T(r2, cy + r2)), fill=(0, 0, 0, 0))
    d.arc((*T(-0.14, cy - 0.14), *T(0.14, cy + 0.14)), 190, 260, fill=(220, 228, 236, 255), width=8)
    save(outline(im, (26, 26, 30), 14), "kunai")


# ---------- branch ----------
def tapered(im, pts, w0, w1, fill, dark):
    n = len(pts)
    L, R = [], []
    for i, (x, y) in enumerate(pts):
        a, b = pts[max(i - 1, 0)], pts[min(i + 1, n - 1)]
        dx, dy = b[0] - a[0], b[1] - a[1]
        ln = math.hypot(dx, dy) or 1
        nx, ny = -dy / ln, dx / ln
        w = (w0 + (w1 - w0) * i / (n - 1)) / 2
        L.append((x + nx * w, y + ny * w))
        R.append((x - nx * w, y - ny * w))
    poly(im, L + R[::-1], fill)
    lay = canvas()
    poly(lay, [((l[0] + p[0]) / 2, (l[1] + p[1]) / 2) for l, p in zip(L, pts)] + L[::-1], dark)
    im.alpha_composite(lay)


def branch():
    im = canvas()
    brown, dark = (128, 84, 46, 255), (92, 58, 30, 255)
    main = bez((-0.85, 0.85), (-0.3, 0.45), (0.2, -0.1), (0.9, -0.8), 30)
    tapered(im, main, 0.2, 0.03, brown, dark)
    tapered(im, bez((-0.25, 0.4), (-0.35, 0.1), (-0.4, -0.15), (-0.5, -0.45), 16), 0.09, 0.02, brown, dark)
    tapered(im, bez((0.2, -0.12), (0.4, -0.05), (0.6, 0.05), (0.8, 0.02), 16), 0.08, 0.02, brown, dark)
    for p in (main[8], main[17]):
        line(im, [(p[0] - 0.03, p[1] + 0.02), (p[0] + 0.03, p[1] - 0.04)], (70, 42, 20, 255), 7)
    lf = leaf_img().resize((S // 4, S // 4), Image.LANCZOS)
    for (x, y), rot in (((-0.5, -0.52), 20), ((0.82, -0.05), -60), ((0.55, -0.62), -25)):
        r = lf.rotate(rot, resample=Image.BICUBIC, expand=True)
        px, py = T(x, y)
        im.alpha_composite(r, (int(px - r.width / 2), int(py - r.height / 2)))
    save(outline(im, (50, 32, 16), 16), "branch")


# ---------- crow ----------
def crow():
    im = canvas()
    black, blue, dark = (28, 28, 40, 255), (64, 80, 120, 255), (16, 16, 24, 255)
    # back wing (upper, raised)
    wing_up = [(-0.15, -0.05), (-0.3, -0.45), (-0.2, -0.75), (-0.05, -0.92), (0.02, -0.7), (0.12, -0.82),
               (0.15, -0.58), (0.28, -0.66), (0.26, -0.42), (0.38, -0.45), (0.3, -0.22), (0.15, -0.05)]
    poly(im, wing_up, dark)
    # tail fan (left)
    poly(im, [(-0.35, 0.08), (-0.95, -0.02), (-0.9, 0.12), (-0.98, 0.2), (-0.86, 0.26), (-0.9, 0.36), (-0.35, 0.22)], black)
    # body
    body = path([((-0.45, 0.12), (-0.2, -0.12), (0.35, -0.2), (0.55, -0.05)),
                 ((0.55, -0.05), (0.5, 0.15), (0.1, 0.32), (-0.45, 0.2))])
    poly(im, body, black)
    # head + beak
    d = ImageDraw.Draw(im)
    d.ellipse((*T(0.42, -0.24), *T(0.72, 0.06)), fill=black)
    poly(im, [(0.68, -0.14), (0.98, -0.04), (0.68, 0.02)], (40, 40, 48, 255))
    line(im, [(0.7, -0.05), (0.95, -0.04)], (90, 90, 100, 255), 5)
    # front wing (lower, swept down-forward)
    wing_dn = [(-0.05, 0.0), (0.3, 0.0), (0.4, 0.3), (0.32, 0.55), (0.2, 0.48), (0.18, 0.72), (0.05, 0.6),
               (-0.02, 0.82), (-0.12, 0.62), (-0.22, 0.76), (-0.28, 0.5), (-0.38, 0.55), (-0.3, 0.2)]
    poly(im, wing_dn, black)
    for (a, b) in (((0.2, 0.1), (0.25, 0.42)), ((0.08, 0.12), (0.05, 0.55)), ((-0.06, 0.12), (-0.14, 0.58)),
                   ((-0.18, 0.14), (-0.28, 0.45))):
        line(im, [a, b], blue, 8)
    for (a, b) in (((-0.02, -0.15), (-0.1, -0.7)), ((0.08, -0.15), (0.1, -0.6)), ((0.17, -0.12), (0.26, -0.45))):
        line(im, [a, b], blue, 8)
    line(im, [(-0.3, 0.1), (0.4, -0.12)], blue, 10)
    px, py = T(0.6, -0.11)
    r = 16
    d.ellipse((px - r, py - r, px + r, py + r), fill=(220, 30, 40, 255))
    save(outline(im, (8, 8, 12), 14), "crow")


# ---------- shark (greyscale, tintable) ----------
def shark():
    im = canvas()
    top = bez((0.95, 0.0), (0.7, -0.32), (-0.2, -0.3), (-0.72, -0.04), 40)
    bot = bez((-0.72, -0.04), (-0.2, 0.22), (0.6, 0.3), (0.95, 0.0), 40)
    body = top + bot
    grey, lightg, darkg = (170, 176, 184, 255), (240, 242, 246, 255), (120, 126, 136, 255)
    poly(im, [(0.0, -0.26), (-0.05, -0.68), (0.25, -0.28)], darkg)  # dorsal
    poly(im, [(-0.66, -0.05), (-0.98, -0.5), (-0.86, -0.04), (-0.98, 0.32), (-0.66, 0.0)], darkg)  # tail
    poly(im, body, grey)
    shade(im, [(-1, 0.06), (1, 0.06), (1, 1), (-1, 1)], lightg)
    poly(im, [(0.25, 0.15), (0.0, 0.5), (0.38, 0.2)], darkg)  # pectoral
    # mouth + teeth
    mouth = [(0.92, 0.04), (0.6, 0.12), (0.88, 0.14)]
    poly(im, mouth, (60, 60, 70, 255))
    for k in range(5):
        x = 0.62 + k * 0.06
        poly(im, [(x, 0.115), (x + 0.03, 0.115), (x + 0.015, 0.075)], (255, 255, 255, 255))
    for k in range(3):
        line(im, [(0.42 - k * 0.06, -0.06), (0.4 - k * 0.06, 0.1)], darkg, 7)
    d = ImageDraw.Draw(im)
    px, py = T(0.7, -0.07)
    d.ellipse((px - 20, py - 20, px + 20, py + 20), fill=(30, 30, 36, 255))
    save(outline(im, (60, 64, 72), 16), "shark")


if __name__ == "__main__":
    os.makedirs(OUT, exist_ok=True)
    for fn in (sakura, leaf, log, paper_tag, seal_circle, rock, ice_crystal, kunai, branch, crow, shark):
        fn()
