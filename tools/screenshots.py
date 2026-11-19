"""Store screenshots (1280x800) and the small promo tile (440x280).

Loads the unpacked extension in Chrome for Testing and photographs it on
neutral stand-in store pages: plain placeholder covers, no Super Rare Games
branding, since the listing is unofficial. Output goes to docs/store/.

  python3 tools/screenshots.py
"""
import hashlib, html, os, re, tempfile, urllib.parse
from playwright.sync_api import sync_playwright, expect
from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
EXT = os.path.join(ROOT, "src")
OUT = os.path.join(ROOT, "docs", "store")
os.makedirs(OUT, exist_ok=True)
FONT_DIR = "/usr/share/fonts/opentype/inter"
GREEN = (21, 128, 61)

def font(weight, size):
    return ImageFont.truetype(os.path.join(FONT_DIR, f"Inter-{weight}.otf"), size)

def ext_id(path):
    h = hashlib.sha256(path.encode()).hexdigest()[:32]
    return "".join(chr(ord("a") + int(c, 16)) for c in h)

def chrome_options():
    """Chrome for Testing locally; CHROME_PATH="" uses Playwright's Chromium (CI).
    Branded Chrome no longer loads unpacked extensions from the command line."""
    exe = os.environ.get("CHROME_PATH", "/usr/bin/google-chrome")
    return {"executable_path": exe} if exe else {"channel": "chromium"}


# handle -> (title, price, cover colour, platform)
P = {
    "srg-149-grapple-dogs-cosmic-canines-switch": ("SRG#149: Grapple Dogs Cosmic Canines (Switch)", "£37.20", "#5b7fbf", "switch"),
    "srg-148-bad-end-theater-switch": ("SRG#148: Bad End Theater (Switch)", "£37.20", "#a35d6a", "switch"),
    "srg-151-duck-detective-the-ghost-of-glamping-switch": ("SRG#151: Duck Detective: The Ghost of Glamping (Switch)", "£37.20", "#6c8f4e", "switch"),
    "srg-107-108-monster-camp-and-monster-roadtrip-double-pack": ("SRG# 107/108: Monster Camp and Monster Roadtrip Double Pack", "£66.00", "#7d5ba6", "switch"),
    "srg-154-toree-friends-collection-switch": ("SRG#154: Toree & Friends Collection (Switch)", "£37.20", "#d08a3c", "switch"),
    "ps5-21-shovel-knight-dig-ps5": ("PS5 #21: Shovel Knight Dig (PS5)", "£32.40", "#3f7f8c", "ps5"),
    "deluxe-edition-de-8-out-of-sight-switch": ("[Deluxe Edition] DE#8: Out of Sight (Switch)", "£69.60", "#4a4a6a", "switch"),
    "srg-150-tiny-terrys-turbo-trip-switch": ("SRG#150: Tiny Terry's Turbo Trip (Switch)", "£37.20", "#c2583f", "switch"),
    "srg-153-savant-ascent-remix-switch": ("SRG#153: Savant - Ascent REMIX (Switch)", "£37.20", "#8a6d3b", "switch"),
    "ps5-23-tiny-terrys-turbo-trip-ps5": ("PS5 #23: Tiny Terry's Turbo Trip (PS5)", "£32.40", "#b5463a", "ps5"),
    "srg-152-mail-time-switch": ("SRG#139: Mail Time (Switch)", "£37.20", "#9a7fb8", "switch"),
    "srg-141-the-pale-beyond-switch": ("SRG#141: The Pale Beyond (Switch)", "£37.20", "#5a6f8f", "switch"),
}
COLLECTION = list(P)
OWNED_LINES = [
    "SRG#149: Grapple Dogs Cosmic Canines (Switch)",
    "SRG#151: Duck Detective: The Ghost of Glamping (Switch)",
    "SRG#107: Monster Camp (Switch)",
    "PS5 #21: Shovel Knight Dig (PS5)",
    "SRG#150: Tiny Terry's Turbo Trip (Switch)",
    "SRG#139: Mail Time (Switch)",
    "SRG#141: The Pale Beyond (Switch)",
    "PS5 #22: Dark Deity 2 (PS5)",
    "[Collector's Edition] CE#12: Lil Gator Game (Switch)",
    "[Deluxe Edition] DE#2: Cassette Beasts (Switch)",
]

CSS = """
a{text-decoration:none;color:inherit}
body{margin:0;font-family:Inter,system-ui,sans-serif;color:#141414;background:#fafaf7}
header{display:flex;align-items:center;gap:28px;height:56px;padding:0 32px;background:#141414;color:#fff;font-weight:600}
header .logo{font-size:18px;letter-spacing:.02em}
header nav{display:flex;gap:20px;font-size:14px;font-weight:500;color:#d4d4d4}
header .cart{margin-left:auto;font-size:14px}
main{padding:22px 32px}
h1{font-size:26px;margin:0 0 16px}
.grid{display:grid;grid-template-columns:repeat(6,1fr);gap:18px 20px;list-style:none;margin:0;padding:0}
.holder{position:relative;border-radius:6px;overflow:hidden}
.holder img{display:block;width:100%;height:auto}
.title{display:block;margin:10px 0 4px;font-size:14px;font-weight:600;line-height:1.3;min-height:36px}
.price{font-size:14px;margin-bottom:8px}
.atc{width:100%;height:36px;border:0;border-radius:6px;background:#d62b1f;color:#fff;font:600 13px Inter,sans-serif}
"""

def art(handle, w=300, h=400, label=True):
    """A plain placeholder game case: coloured cover with a platform strip, no real artwork."""
    t, _, c, plat = P[handle]
    strip = "#e60012" if plat == "switch" else "#0b3ea8"
    m = re.search(r"([A-Z0-9]+ ?#\s?[\d/]+)", t)
    text = (f'<text x="50%" y="62%" font-family="Inter, sans-serif" font-size="{w // 9}" font-weight="700" fill="white" '
            f'text-anchor="middle">{html.escape(m.group(1))}</text>') if (label and m) else ""
    svg = (f'<svg xmlns="http://www.w3.org/2000/svg" width="{w}" height="{h}" viewBox="0 0 {w} {h}">'
           f'<rect width="{w}" height="{h}" fill="{c}"/><rect width="{w}" height="{h // 12}" fill="{strip}"/>{text}</svg>')
    return "data:image/svg+xml," + urllib.parse.quote(svg)

def card(handle):
    """Shaped like the store's own cards: cover in a holder, title, price, its own Add to cart."""
    t, price, _, _ = P[handle]
    return (f'<div class="product-card"><div class="holder"><a href="/products/{handle}"><img src="{art(handle)}" alt=""></a></div>'
            f'<a class="title" href="/products/{handle}">{html.escape(t)}</a><div class="price">{price}</div>'
            f'<form action="/cart/add" method="post"><button class="atc" type="button" name="add">Add to cart</button></form></div>')

def page(body, title="Store"):
    return f"""<!doctype html><html><head><meta charset="utf-8"><title>{title}</title><style>{CSS}</style></head>
<body><header><span class="logo">GAME STORE</span><nav><span>New</span><span>Switch</span><span>PlayStation</span><span>Merch</span></nav><span class="cart">Cart</span></header><main>{body}</main></body></html>"""

CART = ["srg-148-bad-end-theater-switch", "srg-150-tiny-terrys-turbo-trip-switch", "srg-154-toree-friends-collection-switch"]
cart_items = []  # filled just before the cart screenshot, so the warning doesn't cover the others

def route(r):
    url = r.request.url
    path = url.split("superraregames.com", 1)[1].split("?")[0]
    if path.startswith("/collections/") and path.endswith("/products.json"):
        return r.fulfill(json={"products": [{"handle": h, "title": P[h][0]} for h in COLLECTION]})
    if path.startswith("/collections/"):
        return r.fulfill(content_type="text/html", body=page('<h1>New releases</h1><div class="grid">' + "".join(card(h) for h in COLLECTION) + "</div>"))
    m = re.match(r"/products/([^/]+)\.js$", path)
    if m:
        h = m.group(1)
        return r.fulfill(json={"handle": h, "title": P[h][0]}) if h in P else r.fulfill(status=404, body="")
    m = re.match(r"/products/([^/]+)$", path)
    if m and m.group(1) in P:
        h = m.group(1)
        t, price, _, _ = P[h]
        body = f"""<div style="display:flex;gap:48px;align-items:flex-start;padding-top:8px">
          <img src="{art(h, 420, 560)}" alt="" style="width:330px;border-radius:8px">
          <div class="info" style="flex:1;max-width:560px"><h1 style="font-size:30px;margin:0">{html.escape(t)}</h1>
          <p style="font-size:24px;font-weight:600;margin:18px 0 6px">{price}</p>
          <form class="installment" action="/cart/add" method="post"></form>
          <p style="margin:0 0 22px;color:#555">Limited to 4,000 copies · Maximum order: 2</p>
          <form action="/cart/add" method="post"><button type="button" name="add" style="width:100%;height:52px;border:0;border-radius:6px;background:#d62b1f;color:#fff;font:600 17px Inter,sans-serif">Add to cart</button></form>
          <p style="color:#555;line-height:1.6;margin-top:22px">Physical edition with a full-colour manual and reversible cover art.</p></div></div>"""
        return r.fulfill(content_type="text/html", body=page(body))
    if path == "/cart.js":
        return r.fulfill(json={"items": [{"handle": h, "product_title": P[h][0], "quantity": 1} for h in cart_items]})
    if path == "/cart":
        rows = "".join(f"""<tr class="cart-item"><td style="padding:14px 18px 14px 0;width:84px"><a href="/products/{h}"><img src="{art(h, 84, 112, label=False)}" alt="" style="display:block;width:84px;border-radius:4px"></a></td>
            <td><a class="title" style="margin:0;font-size:16px" href="/products/{h}">{html.escape(P[h][0])}</a></td><td style="text-align:right;font-size:16px">{P[h][1]}</td></tr>""" for h in cart_items)
        body = f"""<h1>Your cart</h1><table style="width:720px;border-collapse:collapse"><thead><tr><th style="text-align:left;font-weight:500;color:#666;padding-bottom:8px">Product</th><th></th><th style="text-align:right;font-weight:500;color:#666">Total</th></tr></thead><tbody>{rows}</tbody></table>
          <div style="width:720px;display:flex;justify-content:flex-end;gap:20px;align-items:center;margin-top:20px"><span style="font-size:18px;font-weight:600">Subtotal £111.60</span>
          <button type="button" style="height:48px;padding:0 28px;border:0;border-radius:6px;background:#141414;color:#fff;font:600 16px Inter,sans-serif">Check out</button></div>"""
        return r.fulfill(content_type="text/html", body=page(body))
    return r.fulfill(status=404, body="")

def compose(shot, caption, name):
    W, H, BAND = 1280, 800, 120
    canvas = Image.new("RGB", (W, H), GREEN)
    d = ImageDraw.Draw(canvas)
    d.text((48, BAND // 2), caption, font=font("SemiBold", 34), fill="white", anchor="lm")
    d.text((W - 48, BAND // 2), "SRG Owned", font=font("Bold", 20), fill=(205, 235, 214), anchor="rm")
    img = Image.open(shot).convert("RGB").resize((W, H - BAND))
    canvas.paste(img, (0, BAND))
    canvas.save(os.path.join(OUT, name), optimize=True)

def promo():
    W, H = 440, 280
    im = Image.new("RGB", (W, H), GREEN)
    d = ImageDraw.Draw(im)
    # icon: white rounded square with a green tick
    x, y, s = 40, 58, 84
    d.rounded_rectangle([x, y, x + s, y + s], radius=18, fill="white")
    d.line([(x + s * .24, y + s * .52), (x + s * .43, y + s * .70), (x + s * .77, y + s * .31)], fill=GREEN, width=11, joint="curve")
    d.text((146, 70), "SRG Owned", font=font("Bold", 40), fill="white")
    d.text((148, 120), "Know what you already own", font=font("Medium", 17), fill=(220, 240, 226))
    d.text((40, 190), "Owned badges, cart warnings and order import\nfor the Super Rare Games store.", font=font("Regular", 16), fill="white", spacing=6)
    d.text((40, 244), "Unofficial · not affiliated with Super Rare Games", font=font("Regular", 12), fill=(190, 225, 200))
    im.save(os.path.join(OUT, "promo-440x280.png"), optimize=True)

with sync_playwright() as p:
    ctx = p.chromium.launch_persistent_context(
        tempfile.mkdtemp(), **chrome_options(), headless=False,
        args=["--headless=new", f"--disable-extensions-except={EXT}", f"--load-extension={EXT}", "--no-sandbox", "--hide-scrollbars",
              # headless Chrome reports a touch-like screen with no hover; report a mouse, as on desktop
              "--blink-settings=primaryHoverType=2,availableHoverTypes=2,primaryPointerType=4,availablePointerTypes=4"],
        viewport={"width": 1280, "height": 680}, device_scale_factor=1)
    ctx.route("https://superraregames.com/**", route)
    eid = ext_id(EXT)
    pg = ctx.new_page()
    pg.goto("about:blank"); pg.wait_for_timeout(1500)

    op = ctx.new_page()
    op.goto(f"chrome-extension://{eid}/options.html")
    op.fill("#add", "\n".join(OWNED_LINES))
    op.click("#add-btn")
    expect(op.locator("#list li")).to_have_count(len(OWNED_LINES))
    tmp = os.path.join(tempfile.mkdtemp(), "s.png")

    # 1. collection, one card hovered
    pg.goto("https://superraregames.com/collections/new-releases")
    expect(pg.locator("[data-srgo-state='owned']")).to_have_count(6)
    expect(pg.locator("[data-srgo-state='partial']")).to_have_count(1)
    pg.locator(".product-card", has_text="Bad End Theater").hover()
    pg.wait_for_timeout(300)
    pg.screenshot(path=tmp)
    compose(tmp, "See what you already own at a glance", "1-collection.png")

    # 2. product page you own
    pg.goto("https://superraregames.com/products/srg-150-tiny-terrys-turbo-trip-switch")
    expect(pg.locator(".srgo-pdp-warning")).to_be_visible()
    pg.mouse.move(5, 5)
    pg.screenshot(path=tmp)
    compose(tmp, "A clear warning before you buy something twice", "2-product.png")

    # 3. cart
    cart_items[:] = CART
    pg.goto("https://superraregames.com/cart")
    expect(pg.locator(".srgo-cart")).to_be_visible()
    pg.screenshot(path=tmp)
    compose(tmp, "Catch owned games in your cart, even in a rush", "3-cart.png")

    # 4. import review (made-up orders)
    orders = [
        {"number": "100482", "status": "Confirmed", "url": "/orders/1", "items": [
            {"title": t} for t in ["SRG#153: Savant - Ascent REMIX (Switch)", "PS5 #23: Tiny Terry's Turbo Trip (PS5)",
                                   "[Steelbook] SRG#88: Lost in Play (Switch)", "SRG x Moonstone Island T-Shirt"]]},
        {"number": "100391", "status": "Delivered 23 Oct", "url": "/orders/2", "items": [
            {"title": t} for t in ["SRG#154: Toree & Friends Collection (Switch)", "SRG#149: Grapple Dogs Cosmic Canines (Switch)",
                                   "Super Rare Trading Card Binder No.2"]]},
        {"number": "100377", "status": "Canceled", "url": "/orders/3", "items": [{"title": "SRG#146: Shovel Knight Dig (Switch)"}]},
    ]
    op.close()
    review = ctx.new_page()
    review.goto(f"chrome-extension://{eid}/options.html")
    review.evaluate("(o) => chrome.storage.local.set({ srgoImport: { at: Date.now(), source: 'orders', complete: true, orders: o } })", orders)
    expect(review.locator("#import-actions:not([hidden])")).to_have_count(1, timeout=15000)
    review.locator("#import").scroll_into_view_if_needed()
    review.evaluate("() => window.scrollTo(0, document.getElementById('import').offsetTop - 24)")
    review.screenshot(path=tmp)
    compose(tmp, "Import your order history, and review it first", "4-import.png")
    review.locator("#import-cancel").click()

    # 5. manage page
    review.reload()
    review.evaluate("() => window.scrollTo(0, document.getElementById('add-h').offsetTop - 28)")
    review.screenshot(path=tmp)
    compose(tmp, "Your list, synced through your browser", "5-manage.png")
    ctx.close()

promo()
for f in sorted(os.listdir(OUT)):
    if f.endswith(".png"):
        print(f, Image.open(os.path.join(OUT, f)).size)
