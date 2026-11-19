"""Order-history import, end to end in Chrome for Testing with the unpacked extension.

Account pages come from test/fixtures/app.html: made-up orders in the same
markup as account.superraregames.com, as a small single-page app. It runs twice:
SERVER=1 sends each order page with its items in the HTML; SERVER=0 sends an
empty shell and only the app shows the items (the import must then open each
order in the app). [CLUB] products are missing from the mock store, as they are
on the real one after early access. To try your own saved pages instead, set
REAL_ORDERS=/path/orders.html and REAL_ORDER=/path/order.html; the store
lookups then answer with made-up titles.
"""
import hashlib, os, re, sys, tempfile
from playwright.sync_api import sync_playwright, expect

HERE = os.path.dirname(os.path.abspath(__file__))
EXT = os.path.abspath(os.path.join(HERE, "..", "src"))
OUT = os.path.join(HERE, "shots")
os.makedirs(OUT, exist_ok=True)
REAL = bool(os.environ.get("REAL_ORDERS"))
ORDERS = os.environ.get("REAL_ORDERS")
ORDER = os.environ.get("REAL_ORDER")
SERVER = os.environ.get("SERVER", "1") == "1"
import json, html as htmllib
APP = open(os.path.join(HERE, "fixtures", "app.html"), encoding="utf-8").read()
# an element named "browser" shows up as window.browser, even to the extension
APP = APP.replace('<div id="app">', '<div id="browser" hidden></div><div id="app">')
FIX = json.load(open(os.path.join(HERE, "fixtures", "orders.json")))

def server_rendered(order_id):
    o = next((x for x in FIX if x["id"] == order_id), None)
    if not o:
        return APP
    def row(t, h, v):
        thumb = (f'<a aria-label="{htmllib.escape(t)}" href="https://superraregames.com/products/{h}?variant={v}&amp;sso=silent"><img alt="" src="data:,"></a>'
                 if h else f'<div><img src="data:," alt="{htmllib.escape(t)}"></div>')  # off the store: no link
        return f'<div role="row"><div aria-hidden="true"></div><div role="cell">{thumb}</div><div role="cell"><span>{htmllib.escape(t)}</span></div></div>'
    items = "".join(row(t, h, v) for t, h, v in o["items"])
    main = (f'<div><a aria-label="Orders" href="/orders">Orders</a><h1 tabindex="-1">Order #{o["number"]}</h1><div></div><span>{o["status"]}</span></div>'
            f'<section aria-label="Order summary"><div role="table">{items}</div></section>')
    return APP.replace('<main id="main-content"></main>', f'<main id="main-content">{main}</main>')

def ext_id(path):
    h = hashlib.sha256(path.encode()).hexdigest()[:32]
    return "".join(chr(ord("a") + int(c, 16)) for c in h)

def chrome_options():
    """Chrome for Testing locally; CHROME_PATH="" uses Playwright's Chromium (CI).
    Branded Chrome no longer loads unpacked extensions from the command line."""
    exe = os.environ.get("CHROME_PATH", "/usr/bin/google-chrome")
    return {"executable_path": exe} if exe else {"channel": "chromium"}


# variant id -> (handle, title); "json" = in /products.json, "redirect" = only via /variants/<id>
# ([CLUB] variants 111, 112, 113, 117, 999 are deliberately absent: taken off the store)
VARIANTS = {
    "114": ("srg-mixtape-volume-3", "SRG Mixtape Volume #3", "json"),
    "115": ("srg-150-tiny-terrys-turbo-trip-switch", "SRG#150: Tiny Terry's Turbo Trip (Switch)", "json"),
    "116": ("ps5-21-shovel-knight-dig-ps5", "PS5 #21: Shovel Knight Dig (PS5)", "redirect"),
}
calls = {"products.json": 0, "variants": 0}

def store(route):
    url = route.request.url
    path = url.split("superraregames.com", 1)[1]
    if path.startswith("/products.json"):
        calls["products.json"] += 1
        page = int(re.search(r"page=(\d+)", path).group(1))
        if page > 1:
            return route.fulfill(json={"products": []})
        prods = [{"handle": h, "title": t, "variants": [{"id": int(v)}]} for v, (h, t, how) in VARIANTS.items() if how == "json"]
        if REAL:  # make up titles for the real orders' ids: two thirds in the list, the rest by redirect
            prods += [{"handle": f"srg-{v}", "title": f"SRG#{int(v) % 997}: Game {v} (Switch)", "variants": [{"id": int(v)}]} for v in real_ids if int(v) % 3]
        return route.fulfill(json={"products": prods})
    m = re.match(r"/variants/(\d+)", path)
    if m:
        calls["variants"] += 1
        v = m.group(1)
        if v in VARIANTS:
            return route.fulfill(status=302, headers={"location": f"https://superraregames.com/products/{VARIANTS[v][0]}?variant={v}"})
        if REAL and int(v) % 3 == 0 and int(v) % 2:
            return route.fulfill(status=302, headers={"location": f"https://superraregames.com/products/srg-{v}?variant={v}"})
        return route.fulfill(status=404, body="")
    m = re.match(r"/products/([^/?]+)\.js", path)
    if m:
        for v, (h, t, _) in VARIANTS.items():
            if h == m.group(1):
                return route.fulfill(json={"handle": h, "title": t})
        if m.group(1).startswith("srg-"):
            v = m.group(1)[4:]
            return route.fulfill(json={"handle": m.group(1), "title": f"PS5 #{int(v) % 89}: Game {v} (PS5)"})
        return route.fulfill(status=404, body="")
    if path.startswith("/products/"):
        return route.fulfill(content_type="text/html", body="<h1>product</h1>")
    return route.fulfill(content_type="text/html", body="<html><body>store</body></html>")

SNIPPET = open(os.path.join(HERE, "fixtures", "order-items-unlinked.html"), encoding="utf-8").read()
SNIPPET_PAGE = ('<!doctype html><html><head><meta charset="utf-8"></head><body><div id="browser" hidden></div><main>'
                '<div><h1 tabindex="-1">Order #777</h1><div></div><span>Confirmed 18 Nov</span></div>'
                '<section aria-label="Order summary">' + SNIPPET + '</section></main></body></html>')

def account(route):
    path = route.request.url.split("superraregames.com", 1)[1].split("?")[0]
    m = re.match(r"/orders/(\d+)$", path)
    if path == "/orders/777":  # the real item table of an order whose [CLUB] items left the store
        return route.fulfill(content_type="text/html", body=SNIPPET_PAGE)
    if REAL:
        if path == "/orders":
            return route.fulfill(content_type="text/html", body=open(ORDERS, encoding="utf-8").read())
        if m:
            return route.fulfill(content_type="text/html", body=open(ORDER, encoding="utf-8").read())
        return route.fulfill(status=404, body="")
    if path == "/orders":
        return route.fulfill(content_type="text/html", body=APP)
    if m:
        return route.fulfill(content_type="text/html", body=server_rendered(m.group(1)) if SERVER else APP)
    return route.fulfill(status=404, body="")

real_ids = []
if REAL:
    s = open(ORDERS, encoding="utf-8").read()
    for m in re.finditer(r"/cart/([0-9:,]+)", s):
        real_ids += [p.split(":")[0] for p in m.group(1).split(",")]
    real_ids = sorted(set(real_ids))

failures = []
def check(name, fn):
    try:
        fn(); print("PASS", name)
    except Exception as e:
        failures.append(name); print("FAIL", name, "-", str(e).splitlines()[0])

with sync_playwright() as p:
    ctx = p.chromium.launch_persistent_context(
        tempfile.mkdtemp(), **chrome_options(), headless=False,
        args=["--headless=new", f"--disable-extensions-except={EXT}", f"--load-extension={EXT}", "--no-sandbox"],
        viewport={"width": 1100, "height": 900})
    ctx.route("https://superraregames.com/**", store)
    ctx.route("https://account.superraregames.com/**", account)
    eid = ext_id(EXT)
    first = ctx.new_page()
    first.goto("about:blank"); first.wait_for_timeout(1500)

    # already own SRG#148, so it should show as already owned
    op = ctx.new_page()
    op.goto(f"chrome-extension://{eid}/options.html")
    op.fill("#add", "SRG#148")
    op.click("#add-btn")
    expect(op.locator("#list li")).to_have_count(1)

    pg = ctx.new_page()
    errors = []
    pg.on("pageerror", lambda e: errors.append(str(e)))
    pg.goto("https://account.superraregames.com/orders")

    def panel_on_list():
        expect(pg.locator(".srgo-account")).to_be_visible()
        expect(pg.locator(".srgo-account button.srgo-primary")).to_have_text("Import from all orders")
    check("panel on the orders page", panel_on_list)
    pg.screenshot(path=os.path.join(OUT, "account-orders.png"))

    def run_import():
        for t in ctx.pages:  # an open manage page would be focused instead of a new tab
            if t.url.startswith("chrome-extension://"):
                t.close()
        pg.locator(".srgo-account button.srgo-primary").click()
        link = pg.locator(".srgo-account a.srgo-link")
        expect(link).to_have_text("Open the review", timeout=60000)
        with ctx.expect_page(timeout=15000) as new_tab:
            link.click()
        review = new_tab.value
        review.wait_for_load_state()
        assert review.url.startswith(f"chrome-extension://{eid}/options.html"), review.url
        return review
    review = None
    def import_opens_review():
        global review
        review = run_import()
        # tabs the extension opens have no size in headless Chrome, so check the hidden flag, not visibility
        expect(review.locator("#import:not([hidden])")).to_have_count(1, timeout=10000)
        expect(review.locator("#import-actions:not([hidden])")).to_have_count(1, timeout=60000)
    check("import loads all orders and opens the review", import_opens_review)
    if review is None:
        sys.exit("review didn't open")

    if not REAL:
        def review_contents():
            expect(pg.locator("button[aria-label='Show more orders']")).to_have_count(0)  # clicked until gone
            expect(review.locator("#import-status")).to_have_text("From 4 orders: 4 games to add, 3 other items, 1 already owned.")
            games = review.locator(".pick").nth(0).locator("label")
            # every [CLUB] item identified from its order page, though the store no longer has it
            expect(games).to_have_text([
                "[Steelbook] SRG#88: Lost in Play (Switch)Order #1003",
                "PS5 #21: Shovel Knight Dig (PS5)Order #1000",
                "PS5 #30: Gone Game (PS5)Order #1000",
                "SRG#149: Grapple Dogs Cosmic Canines (Switch)Order #1003",
            ])
            expect(games.locator("input:checked")).to_have_count(4)
            other = review.locator(".pick").nth(1).locator("label")
            expect(other).to_have_text(["SRG Mixtape Volume #3Order #1002", "SRG x Moonstone Island T-ShirtOrder #1003",
                                        "TC#164: KILL KNIGHT - Trading Card Booster PackOrder #1002"])
            expect(other.locator("input:checked")).to_have_count(0)
            expect(review.locator(".note", has_text="cancelled")).to_contain_text("#1001")
            expect(review.locator(".note", has_text="Couldn't read")).to_have_text(re.compile(r"#1004$"))
            expect(review.locator("text=Tiny Terry")).to_have_count(0)  # from the cancelled order
            expect(review.locator("#import-save")).to_have_text("Add 4 selected")
            # only the order whose page had no items needed a store lookup
            assert calls["variants"] == 1, calls
            expect(pg.locator(".srgo-account-msg")).to_have_text("Read 3 of 4 orders; 1 cancelled or refunded skipped.")
            expect(pg).to_have_url(re.compile(r"/orders$"))  # back on the list afterwards
        check("review lists games, other items, skipped and unknown", review_contents)
        review.screenshot(path=os.path.join(OUT, "import-review.png"), full_page=True)

        def save():
            review.locator(".pick").nth(0).locator("label", has_text="Shovel Knight").click()  # untick a gift
            expect(review.locator("#import-save")).to_have_text("Add 3 selected")
            review.click("#import-save")
            expect(review.locator("#import-done")).to_have_text("Added 3 to your owned games.")
            expect(review.locator("#import[hidden]")).to_have_count(1)  # the import section closes
            expect(review.locator("#import-done[hidden]")).to_have_count(1, timeout=10000)  # and the note fades
            expect(review.locator("#list li")).to_have_count(4)
            expect(review.locator("#list li", has_text="Steelbook")).to_contain_text("STEELBOOK:SRG#88")
            expect(review.locator("#list li", has_text="Shovel")).to_have_count(0)
        check("saving adds only the ticked games", save)

        def single_order():
            pg.goto("https://account.superraregames.com/orders/9003")
            expect(pg.locator(".srgo-account button.srgo-primary")).to_have_text("Add this order's games")
            r2 = run_import()
            expect(r2.locator("#import-status")).to_have_text("From 1 order: 0 games to add, 1 other item, 2 already owned.", timeout=15000)
            expect(r2.locator(".pick").nth(0).locator("label")).to_have_text(["SRG x Moonstone Island T-ShirtOrder #1003"])
            assert calls["variants"] == 1, calls  # nothing new: the order page needs no lookups
        check("single order page imports from its titles", single_order)
    else:
        def real_summary():
            expect(review.locator("#import-status")).to_contain_text("From 49 orders")
            expect(review.locator(".note", has_text="cancelled")).to_contain_text("1 cancelled")
            expect(review.locator(".note", has_text="Not every order loaded")).to_have_count(1)  # saved page can't load more
            print("  ", review.locator("#import-status").text_content())
        check("real saved orders page", real_summary)
        review.screenshot(path=os.path.join(OUT, "import-review-real.png"), full_page=True)

        def real_order():
            pg.goto("https://account.superraregames.com/orders/13967716057471")
            r2 = run_import()
            expect(r2.locator("#import-status")).to_contain_text("From 1 order", timeout=15000)
            print("  ", r2.locator("#import-status").text_content())
            expect(r2.locator(".pick").nth(0).locator("label", has_text="Steelbook")).to_have_count(1)
            r2.screenshot(path=os.path.join(OUT, "import-review-real-order.png"), full_page=True)
        check("real saved order page", real_order)

    if not REAL:
        def real_unlinked_rows():
            pg.goto("https://account.superraregames.com/orders/777")
            r3 = run_import()
            expect(r3.locator("#import-status")).to_contain_text("From 1 order: 2 games to add, 1 other item", timeout=15000)
            expect(r3.locator(".pick").nth(0).locator("label")).to_have_text([
                "PS5#33: KILL KNIGHT (PS5)Order #777", "SRG#164: KILL KNIGHT (Switch)Order #777"])
            expect(r3.locator(".pick").nth(1).locator("label")).to_have_text(["TC#164: KILL KNIGHT - Trading Card Booster PackOrder #777"])
            r3.click("#import-cancel")
            expect(r3.locator("#import-done")).to_have_text("Import cancelled. Nothing was added.")
            expect(r3.locator("#import[hidden]")).to_have_count(1)
            r3.reload()
            expect(r3.locator("#import[hidden]")).to_have_count(1)  # nothing left waiting after a reload
        check("your real order table: [CLUB] items without links are read; cancel closes the review", real_unlinked_rows)

        def stale_tab():
            # what happens when you reload the extension with an orders tab open
            pg.goto("https://account.superraregames.com/orders")
            expect(pg.locator(".srgo-account button.srgo-primary")).to_have_text("Import from all orders")
            tmp = ctx.new_page()
            tmp.goto(f"chrome-extension://{eid}/popup.html")
            try:
                tmp.evaluate("chrome.runtime.reload()")
            except Exception:
                pass  # the page closes as the extension reloads
            pg.wait_for_timeout(2500)
            pg.locator(".srgo-account button.srgo-primary").click()
            expect(pg.locator(".srgo-account-msg")).to_have_text("SRG Owned was updated or reloaded. Reload this page and try again.")
            # (an extension that reloads itself doesn't come back under automation,
            # so "reload the page and it works" can't be checked here)
        check("tab left open across an extension reload says to reload the page", stale_tab)

    def storefront_script_not_on_account():
        expect(pg.locator(".srgo-cart, .srgo-toggle")).to_have_count(0)
    check("store badges don't run on the account site", storefront_script_not_on_account)
    check("no page errors", lambda: (_ for _ in ()).throw(AssertionError("; ".join(errors))) if errors else None)
    ctx.close()

print(("SERVER=1" if SERVER else "SERVER=0") if not REAL else "REAL", "-", "%d failed" % len(failures) if failures else "all passed")
sys.exit(1 if failures else 0)
