"""Store icon for the Chrome Web Store: 128x128 with the artwork in the middle
96x96 and 16px of transparent padding, as the store's image guidelines ask.
Same design as the extension's own icon (src/icons): a white tick on a green
rounded square. Drawn at 8x and scaled down for smooth edges.

    python3 tools/store_icon.py   ->  docs/store/icon-128.png
"""
import os
from PIL import Image, ImageDraw, ImageFilter

GREEN = (21, 128, 61, 255)
K = 8
S = 128 * K
im = Image.new("RGBA", (S, S), (0, 0, 0, 0))

# a soft shadow under the square, so it sits well on light and dark pages
shadow = Image.new("RGBA", (S, S), (0, 0, 0, 0))
ImageDraw.Draw(shadow).rounded_rectangle([16 * K, 18 * K, 112 * K, 114 * K], radius=20 * K, fill=(0, 0, 0, 70))
im.alpha_composite(shadow.filter(ImageFilter.GaussianBlur(2 * K)))

d = ImageDraw.Draw(im)
d.rounded_rectangle([16 * K, 16 * K, 112 * K, 112 * K], radius=20 * K, fill=GREEN)
x, y, s = 16 * K, 16 * K, 96 * K
pts = [(x + s * .25, y + s * .53), (x + s * .43, y + s * .70), (x + s * .76, y + s * .33)]
w = int(11.5 * K)
d.line(pts, fill="white", width=w, joint="curve")
for px, py in (pts[0], pts[-1]):  # round the tick's ends
    d.ellipse([px - w / 2, py - w / 2, px + w / 2, py + w / 2], fill="white")

out = os.path.join(os.path.dirname(__file__), "..", "docs", "store", "icon-128.png")
im.resize((128, 128), Image.LANCZOS).save(out, optimize=True)
print(os.path.normpath(out))
