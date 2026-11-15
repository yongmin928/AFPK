# 앱 아이콘 생성: 페이지 accent 색 배경 + 계단식 막대 + 목표 깃발
from PIL import Image, ImageDraw
import os
HERE = os.path.dirname(os.path.abspath(__file__))
BG, FG, SOFT = (28, 90, 72), (255, 255, 255), (223, 238, 231)

def draw(size, safe):
    S = 1024
    im = Image.new("RGB", (S, S), BG)
    d = ImageDraw.Draw(im)
    pad = S * (1 - safe) / 2          # maskable: 가운데 안전 영역 안에만 그림
    W = S - 2 * pad
    x0, base = pad + W * 0.08, pad + W * 0.82
    bw, gap = W * 0.15, W * 0.06
    hs = [0.20, 0.34, 0.50]
    for i, h in enumerate(hs):
        x = x0 + i * (bw + gap)
        d.rounded_rectangle([x, base - W * h, x + bw, base], radius=W * 0.025, fill=SOFT if i < 2 else FG)
    # 목표 깃발
    px = x0 + 3 * (bw + gap) + bw * 0.25
    top = base - W * 0.70
    d.rounded_rectangle([px, top, px + W * 0.035, base], radius=W * 0.012, fill=FG)
    d.polygon([(px + W * 0.035, top), (px + W * 0.20, top + W * 0.075), (px + W * 0.035, top + W * 0.15)], fill=(242, 190, 92))
    d.rounded_rectangle([x0 - W * 0.03, base, px + W * 0.12, base + W * 0.035], radius=W * 0.015, fill=FG)
    return im.resize((size, size), Image.LANCZOS)

for name, size, safe in [("icon-192.png", 192, 0.86), ("icon-512.png", 512, 0.86),
                         ("icon-maskable-512.png", 512, 0.66), ("apple-touch-icon.png", 180, 0.80),
                         ("favicon-32.png", 32, 0.95)]:
    draw(size, safe).save(os.path.join(HERE, name), optimize=True)
print("ok")
