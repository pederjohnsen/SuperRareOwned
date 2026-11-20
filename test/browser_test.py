"""Loads the unpacked extension in Chrome for Testing and runs it against mock
superraregames.com pages, served via request routing. The pages copy what the
real store has (checked on the live site): every product card has its own
Add to cart form; product pages also hold a hidden Shop Pay instalments form,
a sticky Add to cart bar and hidden slider cards with forms; the quick view is
a popup with the product page's own layout and a "View full details" link; and
cart items are table rows."""
import hashlib, json, os, re, sys, tempfile
from playwright.sync_api import sync_playwright, expect

EXT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "src"))
OUT = os.path.join(os.path.dirname(__file__), "shots")
os.makedirs(OUT, exist_ok=True)

def ext_id(path):
    h = hashlib.sha256(path.encode()).hexdigest()[:32]
    return "".join(chr(ord("a") + int(c, 16)) for c in h)

def chrome_options():
    """Chrome for Testing locally; CHROME_PATH="" uses Playwright's Chromium (CI).
    Branded Chrome no longer loads unpacked extensions from the command line."""
    exe = os.environ.get("CHROME_PATH", "/usr/bin/google-chrome")
    return {"executable_path": exe} if exe else {"channel": "chromium"}


PRODUCTS = {
    "club-srg-149-grapple-dogs-cosmic-canines-switch": "[CLUB] SRG#149: Grapple Dogs Cosmic Canines (Switch)",
    "club-srg-148-bad-end-theater-switch": "[CLUB] SRG#148: Bad End Theater (Switch)",
    "club-srg-107-108-monster-camp-and-monster-roadtrip-double-pack": "[CLUB] SRG# 107/108: Monster Camp and Monster Roadtrip Double Pack",
    "club-deluxe-edition-de-6-laika-aged-through-blood-switch-1": "[CLUB] - [Deluxe Edition] DE#2: Laika: Aged Through Blood (PS5)",
    "copy-of-ps4-4-the-tartarus-key-ps4": "[CLUB] - PS4 #4: The Tartarus Key (PS4)",
    "srg-149-grapple-dogs-cosmic-canines-switch": "SRG#149: Grapple Dogs Cosmic Canines (Switch)",
    "club-coming-soon": "[CLUB] Coming Soon!",
    "club-srg-149-coming-soon": "[CLUB] SRG#149: Coming Soon!",
    "deluxe-edition-de-2-cassette-beasts-switch": "[Deluxe Edition] DE#2: Cassette Beasts (Switch)",
}
# a bundle and what's in it (real titles), on their own listing page
BUNDLE_SET = {
    "wax-heads-switch-game-vinyl-bundle": ("Wax Heads: Switch Game & Vinyl (Bundle)", "Switch"),
    "srg-162-waxheads-switch": ("SRG#163: Wax Heads (Switch)", "Switch"),
    "wax-heads-deluxe-double-vinyl": ("Wax Heads (Deluxe Double Vinyl)", "Merch"),
    "pb-49-the-golden-idol-saga-game-162-game-163-switch": ("PB#49: The Golden Idol Saga, Escape from Ever After, Wax Heads (Switch)", "Switch"),
    "srg-161-the-golden-idol-saga-switch": ("SRG#161: The Golden Idol Saga (Switch)", "Switch"),
    "srg-162-escape-from-ever-after-switch": ("SRG#162: Escape from Ever After (Switch)", "Switch"),
}
for h, (t, _) in BUNDLE_SET.items():
    PRODUCTS[h] = t
COLLECTION = [h for h in PRODUCTS if h.startswith(("club-", "copy-of"))]

def card(handle):
    return f"""<li class="grid__item"><div class="card-wrapper product-card-wrapper"><div class="card">
      <div class="card__inner"><div class="card__media"><img src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='300' height='300'%3E%3Crect width='300' height='300' fill='%23e33'/%3E%3C/svg%3E" width="300" height="300"><img class="card__hover" src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='300' height='300'%3E%3Crect width='300' height='300' fill='%2333e'/%3E%3C/svg%3E" width="300" height="300"></div></div>
      <div class="card__content"><div class="card__information"><h3 class="card__heading">
        <a href="/collections/club-26-products/products/{handle}" class="full-unstyled-link">{PRODUCTS[handle]}</a></h3>
        <div class="price">£24.92</div>
        <form action="/cart/add" method="post"><button type="submit" name="add">Add to cart</button></form></div></div></div></div></li>"""

def quick_view(handle):
    """The store's quick view: the product page layout in a popup."""
    return f"""<quick-add-modal class="popup-modal" open><div class="popup-modal__content"><section><div class="grid">
      <div class="col"><img src="data:," alt=""></div>
      <div class="product__right-column-sticky"><h1 class="product__title">{PRODUCTS[handle]}</h1><p>£24.92</p>
        <div class="payment_terms"><form class="installment" action="/cart/add" method="post"></form></div>
        <div class="product__buttons"><product-form><form class="form" action="/cart/add" method="post"><button type="submit" name="add">Add to cart</button></form></product-form></div>
        <a href="/products/{handle}" class="product__view-details">View full details</a></div></div></section></div></quick-add-modal>"""

# Like the store's per-release themes: colours, capitals, fonts and spacing on
# everything in the product info column, and a couple of !important rules.
THEME = """
.product__right-column-sticky, .product__right-column-sticky * { color: #2dd4bf; text-transform: uppercase; font-family: Georgia, serif;
  letter-spacing: 3px; font-weight: 300; line-height: 3; font-style: italic; text-shadow: 0 0 2px #000; }
.product__right-column-sticky div { background: transparent; border: 0; padding: 0; margin: 0; border-radius: 0; display: grid; }
div { text-transform: uppercase !important; }
body:not(#theme) .product__right-column-sticky div, body:not(#theme) .product__right-column-sticky span, body:not(#theme) .product__right-column-sticky button {
  color: #2dd4bf !important; -webkit-text-fill-color: #2dd4bf !important; font-family: Georgia, serif !important; }
button { font-size: 30px !important; }
"""

def page(body):
    return f"""<!doctype html><html><head><meta charset="utf-8"><title>SRG mock</title><style>{THEME}</style>
    <style>body{{font-family:sans-serif;margin:0}} header{{padding:10px;background:#222;color:#fff}}
    ul.grid{{display:grid;grid-template-columns:repeat(4,240px);gap:16px;list-style:none;padding:16px}}
    .card__media img{{width:100%;height:auto;display:block}}
    .card__media{{position:relative}} .card__media .card__hover{{position:absolute;inset:0;opacity:0;transition:opacity .2s}}
    .card:hover .card__media .card__hover{{opacity:1}} .card:hover .card__media img:first-child{{opacity:0}}</style></head>
    <body><header><nav><a href="/products/srg-149-grapple-dogs-cosmic-canines-switch">Menu link</a></nav>
      <div class="slider" style="visibility:hidden;height:0;overflow:hidden"><div class="product-card">
        <a href="/products/deluxe-edition-de-2-cassette-beasts-switch">Hidden slider card</a>
        <form class="form" action="/cart/add" method="post"><button type="submit" name="add">Add to cart</button></form></div></div></header>
    <main>{body}</main></body></html>"""

state = {"cart": []}

def handle_route(route):
    url = route.request.url
    path = url.split("superraregames.com", 1)[1].split("?")[0]
    if path == "/products.json":  # the store's whole product list, which bundles are worked out from
        page_no = int((re.search(r"page=(\d+)", url) or [0, 1])[1])
        items = [{"handle": h, "title": t, "product_type": ty, "tags": []} for h, (t, ty) in BUNDLE_SET.items()]
        items += [{"handle": h, "title": t, "product_type": "Switch", "tags": []} for h, t in PRODUCTS.items() if h not in BUNDLE_SET]
        return route.fulfill(json={"products": items if page_no == 1 else []})
    if path == "/collections/wax-heads":
        return route.fulfill(content_type="text/html", body=page('<h1>Wax Heads</h1><ul class="grid">' + "".join(card(h) for h in BUNDLE_SET) + "</ul>"))
    if path.startswith("/collections/wax-heads/products.json"):
        return route.fulfill(json={"products": [{"handle": h, "title": t} for h, (t, _) in BUNDLE_SET.items()]})
    if path.startswith("/collections/club-26-products/products.json"):
        return route.fulfill(json={"products": [{"handle": h, "title": PRODUCTS[h]} for h in COLLECTION]})
    if path == "/collections/club-26-products":
        return route.fulfill(content_type="text/html", body=page('<h1>Club Products 2026</h1><ul class="grid">' + "".join(card(h) for h in COLLECTION) + "</ul>")
                             .replace("</main>", "</main>" + quick_view("club-srg-149-grapple-dogs-cosmic-canines-switch")))
    if path.startswith("/products/") and path.endswith(".js"):
        h = path[len("/products/"):-3]
        if h in PRODUCTS:
            return route.fulfill(json={"handle": h, "title": PRODUCTS[h]})
        return route.fulfill(status=404, body="")
    if path.startswith("/products/"):
        h = path[len("/products/"):]
        rec = '<h2>Have you seen</h2><ul class="grid">' + card("deluxe-edition-de-2-cassette-beasts-switch") + "</ul>"
        return route.fulfill(content_type="text/html", body=page(
            f'<div class="product"><nav class="breadcrumb"><a href="/products/{h}">{PRODUCTS[h]}</a></nav>'
            f'<div class="product__right-column-sticky"><h1>{PRODUCTS[h]}</h1><p>£37.20</p>'
            f'<div class="payment_terms"><form class="installment" action="/cart/add" method="post"></form></div>'
            f'<div class="product__buttons"><product-form><form class="form" action="/cart/add" method="post"><button type="submit" name="add">Add to cart</button></form></product-form></div></div>'
            f'<div class="sticky-cart-button"><form class="form sticky-cart-button__form" action="/cart/add" method="post"><button type="submit" name="add">Add</button></form></div></div>{rec}'))
    if path == "/cart.js":
        return route.fulfill(json={"items": [{"handle": h, "product_title": PRODUCTS[h], "quantity": 1} for h in state["cart"]]})
    if path == "/cart":  # one table row per item, like the real cart
        rows = "".join(f'<tr class="cart-item"><td class="cart-item__media"><a href="/products/{h}" class="image-hover-scaling__image">'
                       f'<img src="data:," alt="" width="90" height="120" style="display:block;width:90px;height:120px;background:#ccc"></a></td>'
                       f'<td class="cart-item__details"><a href="/products/{h}" class="cart-item__heading">{PRODUCTS[h]}</a></td></tr>' for h in state["cart"])
        return route.fulfill(content_type="text/html", body=page(
            f'<h1>Your cart</h1><form class="cart__contents" action="/cart" method="post"><table class="cart-items"><thead><tr><th>Product</th><th>Total</th></tr></thead><tbody>{rows}</tbody></table></form>'))
    if path == "/":
        return route.fulfill(content_type="text/html", body=page("<h1>Home</h1>"))
    return route.fulfill(status=404, body="")

failures = []
def check(name, fn):
    try:
        fn(); print("PASS", name)
    except Exception as e:
        failures.append(name); print("FAIL", name, "-", str(e).splitlines()[0])

with sync_playwright() as p:
    profile = tempfile.mkdtemp()
    ctx = p.chromium.launch_persistent_context(
        profile, **chrome_options(), headless=False,
        args=["--headless=new", f"--disable-extensions-except={EXT}", f"--load-extension={EXT}", "--no-sandbox"],
        viewport={"width": 1100, "height": 900})
    ctx.route("https://superraregames.com/**", handle_route)
    pg = ctx.new_page()
    errors = []
    pg.on("pageerror", lambda e: errors.append(str(e)))

    BASE = "https://superraregames.com"
    pg.goto("about:blank"); pg.wait_for_timeout(1500)  # let the freshly loaded extension register first
    pg.goto(BASE + "/collections/club-26-products")
    grapple = pg.locator("li.grid__item", has_text="Grapple Dogs")

    def toggles_on_listing():
        expect(pg.locator("li.grid__item .srgo-toggle")).to_have_count(len(COLLECTION) - 2)
        # none on the two Coming Soon! listings (a bundle like the double pack has one)
        expect(pg.locator("li.grid__item", has_text="Double Pack").locator(".srgo-toggle")).to_have_count(1)
        for t in ["[CLUB] Coming Soon!", "SRG#149: Coming Soon!"]:
            expect(pg.locator("li.grid__item", has_text=t).locator(".srgo-toggle")).to_have_count(0)
    check("toggle only on single releases on the listing page", toggles_on_listing)
    check("menu link isn't decorated", lambda: expect(pg.locator("header nav .srgo-toggle, header nav .srgo-badge")).to_have_count(0))

    def mark_club_grapple():
        grapple.hover()
        grapple.locator(".srgo-toggle").click()
        expect(grapple.locator(".srgo-badge")).to_have_text("✓ Owned")
        expect(grapple.locator(".card__media .srgo-badge")).to_have_count(1)  # on the cover, not by Add to cart
        expect(grapple).to_have_attribute("data-srgo-state", "owned")
        expect(pg).to_have_url(BASE + "/collections/club-26-products")  # click didn't navigate
    check("marking a card owned (badge and button on the cover)", mark_club_grapple)

    def hover_picture_stays_hidden():
        # the store's second "hover" picture must stay hidden on an owned card, and swap in on hover
        def look(sel):
            return grapple.locator(sel).evaluate("e => { const c = getComputedStyle(e); return [c.opacity, c.filter]; }")
        pg.mouse.move(5, 5); pg.wait_for_timeout(400)
        assert look(".card__hover") == ["0", "grayscale(1) opacity(0.45)"], look(".card__hover")
        assert look("img:first-child") == ["1", "grayscale(1) opacity(0.45)"], look("img:first-child")
        grapple.locator(".card__media").hover(); pg.wait_for_timeout(400)
        assert look(".card__hover")[0] == "1" and look("img:first-child")[0] == "0", (look(".card__hover"), look("img:first-child"))
        assert look(".card__hover")[1] == "grayscale(1) opacity(0.8)", look(".card__hover")
        pg.mouse.move(5, 5)
    check("owned card: the store's hover picture stays hidden until hover", hover_picture_stays_hidden)

    def toggle_clear_of_add_to_cart():
        card_ = pg.locator("li.grid__item", has_text="Bad End Theater")
        card_.hover()
        t = card_.locator(".srgo-toggle").bounding_box()
        b = card_.locator("form button[name=add]").bounding_box()
        cover = card_.locator(".card__media").bounding_box()
        assert t["y"] + t["height"] <= cover["y"] + cover["height"] + 1, (t, cover)  # inside the cover
        assert t["y"] + t["height"] < b["y"], (t, b)  # above Add to cart
    check("'I own this' sits on the cover, clear of Add to cart", toggle_clear_of_add_to_cart)

    def quick_view_panel():
        qv = pg.locator("quick-add-modal")
        expect(qv.locator(".srgo-pdp .srgo-badge")).to_have_text("✓ Owned")
        expect(qv.locator(".srgo-pdp .srgo-toggle")).to_have_text("Remove from owned")
        expect(qv.locator(".product__buttons .srgo-pdp-warning")).to_have_text("You already own this.")
        expect(qv.locator(".srgo-pdp-warning + form button[name=add]")).to_have_count(1)  # right above Add to cart
        expect(qv.locator(".srgo-card, .srgo-card .srgo-badge")).to_have_count(0)  # "View full details" isn't a card
        expect(pg.locator("main h1 + .srgo-pdp")).to_have_count(0)  # the listing's own heading isn't a product
    check("quick view: badge, button and warning like the product page", quick_view_panel)
    def coming_soon():
        plain = pg.locator("li.grid__item", has_text="[CLUB] Coming Soon!")
        expect(plain).to_have_attribute("data-srgo-state", "none")
        expect(plain.locator(".srgo-badge, .srgo-toggle")).to_have_count(0)
        numbered = pg.locator("li.grid__item", has_text="SRG#149: Coming Soon!")
        expect(numbered.locator(".srgo-badge")).to_have_text("✓ Owned")  # owned through SRG#149
        expect(numbered.locator(".srgo-toggle")).to_have_count(0)  # can't be bought on its own
        pg.goto("https://superraregames.com/products/club-srg-149-coming-soon")
        expect(pg.locator(".srgo-pdp .srgo-badge")).to_have_text("✓ Owned")
        expect(pg.locator(".srgo-pdp .srgo-toggle")).to_have_count(0)
        pg.goto("https://superraregames.com/collections/club-26-products")
    check("Coming Soon!: no button; numbered one shows owned via its number", coming_soon)
    pg.screenshot(path=os.path.join(OUT, "collection.png"))

    def public_page_owned():
        pg.goto(BASE + "/products/srg-149-grapple-dogs-cosmic-canines-switch")
        expect(pg.locator(".srgo-pdp .srgo-badge")).to_have_text("✓ Owned")
        expect(pg.locator(".srgo-pdp-warning")).to_have_count(1)
        expect(pg.locator(".srgo-pdp-warning")).to_have_text("You already own this.")
        # beside the real Add to cart: not the hidden instalments form, the sticky bar or a slider card's form
        expect(pg.locator(".product__buttons .srgo-pdp-warning + form button[name=add]")).to_have_count(1)
        expect(pg.locator("header .srgo-pdp-warning, .sticky-cart-button .srgo-pdp-warning")).to_have_count(0)
        expect(pg.locator(".breadcrumb .srgo-toggle")).to_have_count(0)
        expect(pg.locator("li.grid__item", has_text="Cassette Beasts")).to_have_attribute("data-srgo-state", "none")
        expect(pg.locator("li.grid__item .srgo-toggle")).to_have_count(0)  # no marking from recommendations
    check("public product page shows owned + warning; no toggle on recommendations", public_page_owned)

    def styles_hold_against_theme():
        # the page's theme mustn't change how the extension's elements look
        def css(loc, *props):
            return loc.evaluate("(el, props) => { const cs = getComputedStyle(el); return props.map(p => cs.getPropertyValue(p)); }", list(props))
        w = pg.locator(".product__buttons .srgo-pdp-warning")
        got = dict(zip(["color", "background-color", "text-transform", "font-weight", "font-size", "letter-spacing", "font-style", "border-top-width", "border-top-color", "padding-left", "border-top-left-radius", "display", "text-shadow"],
                       css(w, "color", "background-color", "text-transform", "font-weight", "font-size", "letter-spacing", "font-style", "border-top-width", "border-top-color", "padding-left", "border-top-left-radius", "display", "text-shadow")))
        assert got == {"color": "rgb(127, 29, 29)", "background-color": "rgb(254, 226, 226)", "text-transform": "none", "font-weight": "700", "font-size": "16px",
                       "letter-spacing": "normal", "font-style": "normal", "border-top-width": "2px", "border-top-color": "rgb(220, 38, 38)", "padding-left": "14px",
                       "border-top-left-radius": "8px", "display": "block", "text-shadow": "none"}, got
        assert "Georgia" not in css(w, "font-family")[0], css(w, "font-family")
        assert css(w, "-webkit-text-fill-color") == ["rgb(127, 29, 29)"], css(w, "-webkit-text-fill-color")
        assert css(pg.locator(".srgo-pdp .srgo-badge"), "-webkit-text-fill-color") == ["rgb(255, 255, 255)"]
        assert css(pg.locator(".srgo-pdp .srgo-toggle"), "-webkit-text-fill-color") == ["rgb(17, 17, 17)"]
        badge = pg.locator(".srgo-pdp .srgo-badge")
        assert css(badge, "color", "background-color", "text-transform", "font-size") == ["rgb(255, 255, 255)", "rgb(21, 128, 61)", "none", "13px"], css(badge, "color", "background-color", "text-transform", "font-size")
        btn = pg.locator(".srgo-pdp .srgo-toggle")
        assert css(btn, "color", "text-transform", "font-size", "letter-spacing", "opacity") == ["rgb(17, 17, 17)", "none", "12px", "normal", "1"], css(btn, "color", "text-transform", "font-size", "letter-spacing", "opacity")
        pg.screenshot(path=os.path.join(OUT, "product-themed.png"))
    check("warning, badge and button keep their design on a themed release page", styles_hold_against_theme)
    pg.screenshot(path=os.path.join(OUT, "product.png"))

    def same_number_other_platform():
        pg.goto(BASE + "/products/deluxe-edition-de-2-cassette-beasts-switch")
        pg.locator(".srgo-pdp .srgo-toggle").click()
        expect(pg.locator(".srgo-pdp .srgo-badge")).to_have_text("✓ Owned")
        pg.goto(BASE + "/collections/club-26-products")
        expect(pg.locator("li.grid__item", has_text="Laika")).to_have_attribute("data-srgo-state", "none")
    check("DE#2 Switch owned doesn't mark DE#2 PS5", same_number_other_platform)

    eid = ext_id(EXT)
    def options_add_and_bundle():
        op = ctx.new_page()
        op.goto(f"chrome-extension://{eid}/options.html")
        expect(op.locator("#list li")).to_have_count(2)
        expect(op.locator("#version")).to_have_text(json.load(open(os.path.join(EXT, "manifest.json")))["version"])
        op.fill("#add", "srg#107\nnonsense ###\nSRG#149")
        op.click("#add-btn")
        expect(op.locator("#add-result")).to_contain_text("Added 2")  # "nonsense ###" becomes a name key, so it's added too
        expect(op.locator("#add-result")).to_contain_text("1 already owned")
        expect(op.locator("#list li")).to_have_count(4)
        op.screenshot(path=os.path.join(OUT, "options.png"), full_page=True)
        expect(pg.locator("li.grid__item", has_text="Double Pack").locator(".srgo-badge")).to_have_text("1 of 2 owned")
        # remove the junk line again
        op.locator("#list li", has_text="nonsense").get_by_role("button").click()
        expect(op.locator("#list li")).to_have_count(3)
        op.close()
    check("options page add + bundle partial updates open tab live", options_add_and_bundle)

    def single_cart_row():
        state["cart"] = ["club-srg-149-grapple-dogs-cosmic-canines-switch"]
        pg.goto(BASE + "/cart")
        row = pg.locator("tr.cart-item")
        expect(row).to_have_attribute("data-srgo-state", "owned")  # the row is the card, not the whole table
        expect(row.locator(".cart-item__media a .srgo-badge.srgo-compact")).to_have_text("✓")  # a tick on the thumbnail
        expect(pg.locator("table.srgo-card, form.srgo-card, thead .srgo-badge")).to_have_count(0)
        expect(row.locator(".srgo-toggle")).to_have_count(0)  # no marking from the cart
        state["cart"] = []
    check("single cart item: tick on its thumbnail, not on the table", single_cart_row)

    def cart_warning():
        state["cart"] = ["club-srg-149-grapple-dogs-cosmic-canines-switch", "club-srg-148-bad-end-theater-switch"]
        pg.goto(BASE + "/cart")
        expect(pg.locator(".srgo-cart")).to_contain_text("Your cart has a game you already own")
        expect(pg.locator(".srgo-cart li")).to_have_count(1)
        expect(pg.locator(".srgo-cart li")).to_have_text("SRG#149: Grapple Dogs Cosmic Canines (Switch)")
        pg.screenshot(path=os.path.join(OUT, "cart.png"))
        pg.locator(".srgo-cart button").click()
        expect(pg.locator(".srgo-cart")).to_have_count(0)
        pg.reload()
        pg.wait_for_timeout(1500)
        expect(pg.locator(".srgo-cart")).to_have_count(0)  # dismissed for this cart
        state["cart"].append("club-srg-107-108-monster-camp-and-monster-roadtrip-double-pack")
        pg.reload()
        expect(pg.locator(".srgo-cart")).to_contain_text("2 games you already own")
        expect(pg.locator(".srgo-cart")).to_contain_text("(1 of 2 owned)")
    check("cart warning, dismiss, reappears when cart changes", cart_warning)

    def unmark():
        pg.goto(BASE + "/products/srg-149-grapple-dogs-cosmic-canines-switch")
        pg.locator(".srgo-pdp .srgo-toggle").click()
        expect(pg.locator(".srgo-pdp-warning")).to_have_count(0)
        expect(pg.locator(".srgo-pdp .srgo-toggle")).to_have_text("I own this")
    check("unmark from product page", unmark)

    def backup_round_trip():
        op = ctx.new_page()
        op.goto(f"chrome-extension://{eid}/options.html")
        n = op.locator("#list li").count()
        with op.expect_download() as dl:
            op.click("#export")
        path = dl.value.path()
        data = json.load(open(path))
        assert data["app"] == "srg-owned" and len(data["owned"]) == n, data
        # remove one, then restore it from the backup
        op.locator("#list li").first.get_by_role("button").click()
        expect(op.locator("#list li")).to_have_count(n - 1)
        op.set_input_files("#backup-file", path)
        expect(op.locator("#backup-result")).to_have_text("Imported 1 new.")
        expect(op.locator("#list li")).to_have_count(n)
        op.close()
    check("backup export and import round trip", backup_round_trip)

    def popup():
        pp = ctx.new_page()
        pp.goto(f"chrome-extension://{eid}/popup.html")
        expect(pp.locator("#count")).to_have_text("2")
        pp.close()
    check("popup count", popup)

    def bundles():
        pg.goto(BASE + "/collections/wax-heads")
        bundle = pg.locator("li.grid__item", has_text="Switch Game & Vinyl")
        game = pg.locator("li.grid__item", has_text="SRG#163")
        vinyl = pg.locator("li.grid__item", has_text="Deluxe Double Vinyl")
        game.hover()
        game.locator(".srgo-toggle").click()
        expect(bundle.locator(".srgo-badge")).to_have_text("1 of 2 owned")  # own the game: half the bundle
        vinyl.hover()
        vinyl.locator(".srgo-toggle").click()
        expect(bundle.locator(".srgo-badge")).to_have_text("✓ Owned")  # and the vinyl: the whole bundle
        expect(pg.locator("li.grid__item", has_text="PB#49").locator(".srgo-badge")).to_have_text("1 of 3 owned")  # SRG#163 is in PB#49 too
    check("bundles: owning the game and the vinyl separately owns the bundle", bundles)

    def bundle_by_hand():
        pg.goto(BASE + "/collections/wax-heads")
        bundle = pg.locator("li.grid__item", has_text="Switch Game & Vinyl")
        game = pg.locator("li.grid__item", has_text="SRG#163")
        vinyl = pg.locator("li.grid__item", has_text="Deluxe Double Vinyl")
        bundle.hover()
        expect(bundle.locator(".srgo-toggle")).to_have_text("Remove")  # owned via its parts
        bundle.locator(".srgo-toggle").click()  # removing the bundle removes what's in it
        expect(bundle.locator(".srgo-badge")).to_have_count(0)
        expect(game.locator(".srgo-badge")).to_have_count(0)
        expect(vinyl.locator(".srgo-badge")).to_have_count(0)
        bundle.hover()
        expect(bundle.locator(".srgo-toggle")).to_have_text("I own this")
        bundle.locator(".srgo-toggle").click()  # and marking it marks what's in it
        expect(bundle.locator(".srgo-badge")).to_have_text("✓ Owned")
        expect(game.locator(".srgo-badge")).to_have_text("✓ Owned")
        expect(vinyl.locator(".srgo-badge")).to_have_text("✓ Owned")
        # and on the bundle's own page
        pg.goto(BASE + "/products/wax-heads-switch-game-vinyl-bundle")
        expect(pg.locator(".srgo-pdp .srgo-toggle")).to_have_text("Remove from owned")
        pg.locator(".srgo-pdp .srgo-toggle").click()
        expect(pg.locator(".srgo-pdp .srgo-toggle")).to_have_text("I own this")
        expect(pg.locator(".srgo-pdp-warning")).to_have_count(0)
        pg.locator(".srgo-pdp .srgo-toggle").click()
        expect(pg.locator(".srgo-pdp-warning")).to_have_text("You already own this.")
    check("a bundle can be marked and unmarked by hand, with what's in it", bundle_by_hand)

    def bundle_owns_contents():
        op = ctx.new_page()
        op.goto(f"chrome-extension://{eid}/options.html")
        # an old-style entry: the bundle stored under its own number
        op.fill("#add", "PB#49: The Golden Idol Saga, Escape from Ever After, Wax Heads (Switch)")
        op.click("#add-btn")
        expect(op.locator("#list li", has_text="Escape from Ever After")).to_have_count(1)  # stored as what's inside
        expect(op.locator("#list li", has_text="PB#49")).to_have_count(0)
        op.close()
        pg.goto(BASE + "/collections/wax-heads")
        expect(pg.locator("li.grid__item", has_text="SRG#162").locator(".srgo-badge")).to_have_text("✓ Owned")
        expect(pg.locator("li.grid__item", has_text="SRG#161").locator(".srgo-badge")).to_have_text("✓ Owned")
        expect(pg.locator("li.grid__item", has_text="PB#49").locator(".srgo-badge")).to_have_text("✓ Owned")
    check("owning a bundle owns the releases in it", bundle_owns_contents)

    check("no page errors", lambda: (_ for _ in ()).throw(AssertionError("; ".join(errors))) if errors else None)
    ctx.close()

print("\n%d failed" % len(failures) if failures else "\nall passed")
sys.exit(1 if failures else 0)
