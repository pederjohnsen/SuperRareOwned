"""Store screenshots (1280x800) and the small promo tile (440x280).

Loads the unpacked extension in Chrome for Testing and photographs it on
neutral stand-in store pages: plain placeholder covers, no Super Rare Games
branding, since the listing is unofficial. Output goes to docs/store/.

  python3 tools/screenshots.py
"""
import hashlib, html, os, re, tempfile
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


# handle -> (title, price, was, cover colour)
P = {
    "club-srg-149-grapple-dogs-cosmic-canines-switch": ("[CLUB] SRG#149: Grapple Dogs Cosmic Canines (Switch)", "£24.92", "£37.20", "#5b7fbf"),
    "club-srg-148-bad-end-theater-switch": ("[CLUB] SRG#148: Bad End Theater (Switch)", "£24.92", "£37.20", "#a35d6a"),
    "club-srg-151-duck-detective-the-ghost-of-glamping-switch": ("[CLUB] SRG#151: Duck Detective: The Ghost of Glamping (Switch)", "£24.92", "£37.20", "#6c8f4e"),
    "club-srg-107-108-monster-camp-and-monster-roadtrip-double-pack": ("[CLUB] SRG# 107/108: Monster Camp and Monster Roadtrip Double Pack", "£66.00", None, "#7d5ba6"),
    "club-srg-154-toree-friends-collection-switch": ("[CLUB] SRG#154: Toree & Friends Collection (Switch)", "£24.92", "£37.20", "#d08a3c"),
    "club-ps5-21-shovel-knight-dig-ps5": ("[CLUB] PS5 #21: Shovel Knight Dig (PS5)", "£21.71", "£30.00", "#3f7f8c"),
    "club-deluxe-edition-de-8-out-of-sight-switch": ("[CLUB] [Deluxe Edition] DE#8: Out of Sight (Switch)", "£46.63", "£69.60", "#4a4a6a"),
    "club-srg-150-tiny-terrys-turbo-trip-switch": ("[CLUB] SRG#150: Tiny Terry's Turbo Trip (Switch)", "£24.92", "£37.20", "#c2583f"),
    "club-srg-153-savant-ascent-remix-switch": ("[CLUB] SRG#153: Savant - Ascent REMIX (Switch)", "£24.92", "£37.20", "#8a6d3b"),
    "club-ps5-23-tiny-terrys-turbo-trip-ps5": ("[CLUB] PS5 #23: Tiny Terry's Turbo Trip (PS5)", "£21.71", "£30.00", "#b5463a"),
    "srg-150-tiny-terrys-turbo-trip-switch": ("SRG#150: Tiny Terry's Turbo Trip (Switch)", "£37.20", None, "#c2583f"),
    "srg-155-pale-beyond-switch": ("SRG#141: The Pale Beyond (Switch)", "£37.20", None, "#5a6f8f"),
}
COLLECTION = [h for h in P if h.startswith("club-")]
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
a{text-decoration:none}
body{margin:0;font-family:Inter,system-ui,sans-serif;color:#141414;background:#fafaf7}
header{display:flex;align-items:center;gap:28px;height:56px;padding:0 32px;background:#141414;color:#fff;font-weight:600}
header .logo{font-size:18px;letter-spacing:.02em}
header nav{display:flex;gap:20px;font-size:14px;font-weight:500;color:#d4d4d4}
header .cart{margin-left:auto;font-size:14px}
main{padding:24px 32px}
h1{font-size:26px;margin:0 0 18px}
ul.grid{display:grid;grid-template-columns:repeat(5,1fr);gap:18px 20px;list-style:none;margin:0;padding:0}
.cover{aspect-ratio:1/1;border-radius:6px;display:flex;align-items:flex-end;padding:12px;box-sizing:border-box;color:#fff;font-weight:700;font-size:15px;line-height:1.2}
.cover span{background:rgba(0,0,0,.28);padding:4px 8px;border-radius:4px}
.title{display:block;margin:10px 0 4px;font-size:14px;font-weight:600;line-height:1.3;color:#141414;text-decoration:none}
.price{font-size:14px}.was{color:#6b6b6b;text-decoration:line-through;margin-right:6px}
"""

def cover(handle, size=None, label=True):
    t, _, _, c = P[handle]
    m = re.search(r"([A-Z0-9]+ ?#\s?[\d/]+)", t)
    style = f"background:{c}" + (f";width:{size}px;height:{size}px;flex:none" if size else "")
    text = f"<span>{html.escape(m.group(1))}</span>" if (label and m) else ""
    return f'<div class="cover" style="{style}">{text}</div>'

def card(handle):
    t, price, was, _ = P[handle]
    pr = (f'<span class="was">{was}</span>' if was else "") + price
    return f'<li class="grid__item"><a href="/products/{handle}" aria-hidden="true" tabindex="-1">{cover(handle)}</a><a class="title" href="/products/{handle}">{html.escape(t)}</a><div class="price">{pr}</div></li>'

def page(body, title="Store"):
    return f"""<!doctype html><html><head><meta charset="utf-8"><title>{title}</title><style>{CSS}</style></head>
<body><header><span class="logo">GAME STORE</span><nav><span>New</span><span>Club</span><span>Sale</span><span>Merch</span></nav><span class="cart">Cart (3)</span></header><main>{body}</main></body></html>"""

CART = ["club-srg-148-bad-end-theater-switch", "club-srg-150-tiny-terrys-turbo-trip-switch", "club-srg-154-toree-friends-collection-switch"]
cart_items = []  # filled just before the cart screenshot, so the warning doesn't cover the others

def route(r):
    url = r.request.url
    path = url.split("superraregames.com", 1)[1].split("?")[0]
    if path.startswith("/collections/") and path.endswith("/products.json"):
        return r.fulfill(json={"products": [{"handle": h, "title": P[h][0]} for h in COLLECTION]})
    if path.startswith("/collections/"):
        return r.fulfill(content_type="text/html", body=page('<h1>Club early access</h1><ul class="grid">' + "".join(card(h) for h in COLLECTION) + "</ul>"))
    m = re.match(r"/products/([^/]+)\.js$", path)
    if m:
        h = m.group(1)
        return r.fulfill(json={"handle": h, "title": P[h][0]}) if h in P else r.fulfill(status=404, body="")
    m = re.match(r"/products/([^/]+)$", path)
    if m and m.group(1) in P:
        h = m.group(1)
        t, price, was, _ = P[h]
        body = f"""<div style="display:flex;gap:48px;align-items:flex-start;padding-top:8px">
          {cover(h, 440)}
          <div style="flex:1;max-width:560px"><h1 style="font-size:30px;margin:0">{html.escape(t)}</h1>
          <p style="font-size:24px;font-weight:600;margin:18px 0 6px">{price}</p>
          <p style="margin:0 0 22px;color:#555">Limited to 3,000 copies · Maximum order: 2</p>
          <form action="/cart/add" method="post"><button type="button" style="width:100%;height:52px;border:0;border-radius:6px;background:#141414;color:#fff;font:600 17px Inter,sans-serif">Add to cart</button></form>
          <p style="color:#555;line-height:1.6;margin-top:22px">Physical edition with exclusive slipcover, full-colour manual and trading cards.</p></div></div>
          <h2 style="margin:34px 0 14px;font-size:20px">Have you seen…</h2><ul class="grid">{''.join(card(x) for x in ["club-srg-154-toree-friends-collection-switch","club-srg-153-savant-ascent-remix-switch","club-ps5-23-tiny-terrys-turbo-trip-ps5"])}</ul>"""
        return r.fulfill(content_type="text/html", body=page(body))
    if path == "/cart.js":
        return r.fulfill(json={"items": [{"handle": h, "product_title": P[h][0], "quantity": 1} for h in cart_items]})
    if path == "/cart":
        rows = "".join(f"""<div style="display:flex;gap:18px;align-items:center;padding:16px 0;border-bottom:1px solid #e3e3e0">{cover(h, 84, label=False)}
            <a class="title" style="flex:1;margin:0;font-size:16px" href="/products/{h}">{html.escape(P[h][0])}</a><span style="font-size:16px">{P[h][1]}</span></div>""" for h in cart_items)
        body = f"""<h1>Your cart</h1><div style="max-width:720px;border-top:1px solid #e3e3e0">{rows}</div>
          <div style="max-width:720px;display:flex;justify-content:flex-end;gap:20px;align-items:center;margin-top:20px"><span style="font-size:18px;font-weight:600">Subtotal £71.55</span>
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
    pg.goto("https://superraregames.com/collections/club-early-access")
    expect(pg.locator("[data-srgo-state='owned']")).to_have_count(4)
    expect(pg.locator("[data-srgo-state='partial']")).to_have_count(1)
    pg.locator("li.grid__item", has_text="Bad End Theater").hover()
    pg.wait_for_timeout(300)
    pg.screenshot(path=tmp)
    compose(tmp, "See what you already own, [CLUB] copies included", "1-collection.png")

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
            {"title": t} for t in ["[CLUB] SRG#153: Savant - Ascent REMIX (Switch)", "[CLUB] PS5 #23: Tiny Terry's Turbo Trip (PS5)",
                                   "[CLUB] - [Steelbook] SRG#88: Lost in Play (Switch)", "[CLUB] SRG x Moonstone Island T-Shirt"]]},
        {"number": "100391", "status": "Delivered 23 Oct", "url": "/orders/2", "items": [
            {"title": t} for t in ["[CLUB] SRG#154: Toree & Friends Collection (Switch)", "SRG#149: Grapple Dogs Cosmic Canines (Switch)",
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
