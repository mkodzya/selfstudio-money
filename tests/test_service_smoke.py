"""A first pass over the service: boot it, and walk every main path once, end to end.

The full suites (test_http.py, test_ctl.py, test_routes_doc.py, ...) go deeper; this file
proves that the HTTP layer, the pages, the command line and the boot hold together on top
of the core, and shows how to drive them with ``tests/_harness.py``.

    python3 -m unittest tests.test_service_smoke
"""
from tests import _safety  # noqa: F401  - first: no test runs beside a ledger

import base64
import dataclasses
import errno
import hashlib
import html
import html.parser
import io
import json
import os
import re
import shutil
import socket
import tempfile
import threading
import time
import unittest
from unittest import mock

from moneyd import __main__ as boot
from moneyd import config, ctl, httpd
from tests import _harness
from tests._harness import PASSWORD, ledger, plan

LEDGER = "/api/founder/money"
PLAN = "/api/founder/money/cash"
INDEX = os.path.join(_harness.CHECKOUT, "index.html")
BAND = "Тестовый стенд — выдуманная студия. Настоящие выписки сюда не загружать"

#: The paths that answer for themselves without a session: these and no others.
PUBLIC = (
    "/login", "/set-password", "/logout", "/assets/auth.js", "/assets/auth.css", "/robots.txt", "/favicon.ico",
    "/healthz", "/api/auth/login", "/api/auth/setup", "/api/auth/logout",
)
FIXED = {
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "same-origin",
    "X-Frame-Options": "DENY",
    "Cross-Origin-Opener-Policy": "same-origin",
    "Cross-Origin-Resource-Policy": "same-origin",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=()",
    "Server": "money",
    "Connection": "close",
}


def read(path):
    with open(path, "rb") as handle:
        return handle.read()


def until(probe, seconds=3.0, every=0.02):
    """Ask ``probe`` until it says something true, for ``seconds`` at most."""
    deadline = time.monotonic() + seconds
    while True:
        value = probe()
        if value or time.monotonic() > deadline:
            return value
        time.sleep(every)


class StandCase(unittest.TestCase):
    """A dev stand in this process, with a clock the test moves."""

    env = None
    tune = None

    def setUp(self):
        self.stand = _harness.Stand(env=self.env, tune=self.tune)
        self.addCleanup(self.stand.stop)

    def assertRefused(self, answer, status, code):
        self.assertEqual(answer.status, status, answer.body[:200])
        self.assertEqual(answer.json().get("error"), code)
        self.assertTrue(answer.header("Content-Type").startswith("application/json"))


# ---------------------------------------------------------------------------
# The table, the page's hash and Money's own pages: no server needed
# ---------------------------------------------------------------------------

class RouteTableTests(unittest.TestCase):
    def test_the_table_is_whole_and_exact(self):
        rows = [(route.method, route.path) for route in httpd.ROUTES]
        self.assertEqual(len(rows), 26)
        self.assertEqual(len(set(rows)), len(rows), "a method and a path are one row")
        for route in httpd.ROUTES:
            self.assertIn(route.method, ("GET", "POST", "PUT"))
            self.assertTrue(callable(getattr(httpd.Handler, "_do_" + route.handler)), route)
            self.assertEqual(route.body is not None, route.method != "GET", route)
        self.assertEqual(httpd.PUBLIC_PATHS, PUBLIC)
        self.assertEqual(sorted({route.path for route in httpd.ROUTES if not route.session}), sorted(PUBLIC))
        self.assertEqual(httpd.VENDOR_FILES, ("pdf.min.js", "pdf.worker.min.js", "xlsx.full.min.js"))
        self.assertEqual({route.doc: route.path for route in httpd.ROUTES if route.method == "PUT"},
                         {"ledger": LEDGER, "plan": PLAN})

    def test_the_policies_are_the_specified_ones(self):
        self.assertEqual(
            httpd.CSP_OWN_PAGES,
            "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; "
            "form-action 'self'; base-uri 'none'; frame-ancestors 'none'")
        self.assertEqual(httpd.CSP_VENDOR, "default-src 'none'; script-src 'self'")
        self.assertEqual(httpd.CSP_JSON, "default-src 'none'")
        self.assertEqual(
            httpd.page_policy(["abc="]),
            "default-src 'none'; script-src 'self' 'sha256-abc='; style-src 'self' 'unsafe-inline' "
            "https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' data: blob:; "
            "connect-src 'self'; worker-src 'self' blob:; base-uri 'none'; form-action 'self'; frame-ancestors 'none'")
        for policy in (httpd.CSP_OWN_PAGES, httpd.CSP_VENDOR, httpd.CSP_JSON, httpd.page_policy(["abc="])):
            self.assertNotIn("unsafe-eval", policy)
            self.assertNotRegex(policy, r"script-src[^;]*unsafe-inline")


class PageFactsTests(unittest.TestCase):
    @staticmethod
    def sha(text):
        return base64.b64encode(hashlib.sha256(text.encode("utf-8")).digest()).decode("ascii")

    def test_the_hash_of_the_page_as_it_is(self):
        page = read(INDEX)
        text = page.decode("utf-8")
        start = text.index("<script>") + len("<script>")
        facts = httpd.inspect_page(page)
        self.assertEqual(facts.script_hashes, (self.sha(text[start:text.index("</script>", start)]),))
        self.assertEqual(facts.inline_handlers, 0)

    def test_what_counts_as_an_inline_script(self):
        page = (
            "<!doctype html><html><head><title><script>not one</script></title>"
            "<style>a::before{content:'<script>nor this</script>'}</style>"
            "<!-- <script>commented()</script> -->"
            "<script src=/a.js>ignored()</script>"
            "<script>one()</script>"
            "<SCRIPT type=\"module\" data-x='>'>two()</SCRIPT >"
            "<script>var s='<!--<script>x</script>-->';three()</script>"
            "<textarea><script>typed()</script></textarea>"
            "</head><body onload=\"boom()\"><a href=' JavaScript:void(0)'>x</a><p data-on=\"fine\">"
            "<script></script></body></html>")
        facts = httpd.inspect_page(page.encode("utf-8"))
        self.assertEqual(facts.script_hashes, (
            self.sha("one()"), self.sha("two()"), self.sha("var s='<!--<script>x</script>-->';three()")))
        self.assertEqual(facts.inline_handlers, 2)

    def test_line_ends_are_the_browsers(self):
        self.assertEqual(httpd.inspect_page(b"<script>a\r\nb\rc</script>").script_hashes, (self.sha("a\nb\nc"),))
        with self.assertRaises(ValueError):
            httpd.inspect_page(b"<script>\xff</script>")


class OwnPagesTests(unittest.TestCase):
    def web(self, stand):
        directory = tempfile.mkdtemp(prefix="money-test-")
        self.addCleanup(shutil.rmtree, directory, True)
        settings = config.Settings.from_env(_harness.dev_environ(directory, 8123))
        return httpd.WebFiles(dataclasses.replace(settings, stand=stand))

    def pages(self, web):
        return {
            "login": web.render("login", state="form", firstName=""),
            "set-password": web.render("set-password"),
            "data": web.render("data", firstName="Mika", entries="[]"),
        }

    def test_no_inline_script_no_inline_style_no_web_font(self):
        for stand in ("dev", "test", "prod"):
            for name, page in self.pages(self.web(stand)).items():
                with self.subTest(stand=stand, page=name):
                    facts = httpd.inspect_page(page)
                    self.assertEqual(facts, httpd.PageFacts((), 0))
                    text = page.decode("utf-8")
                    self.assertNotRegex(text, r"(?i)<style|\sstyle\s*=|fonts\.g|https?://")
                    self.assertIn('<script src="/assets/auth.js" defer></script>', text)
                    self.assertIn('<link rel="stylesheet" href="/assets/auth.css">', text)
                    self.assertIn('data-stand="%s"' % stand, text)
                    self.assertNotIn("{{", text)
                    self.assertNotIn("<!--", text)
        script = read(os.path.join(_harness.CHECKOUT, "moneyd", "assets", "auth.js")).decode("utf-8")
        self.assertNotRegex(script, r"innerHTML|outerHTML|insertAdjacentHTML|document\.write|\beval\(|new Function")
        style = read(os.path.join(_harness.CHECKOUT, "moneyd", "assets", "auth.css")).decode("utf-8")
        self.assertNotRegex(style, r"(?i)@import|url\(|@font-face")

    def test_the_test_stand_cannot_be_taken_for_the_real_one(self):
        for stand in ("dev", "prod"):
            for page in self.pages(self.web(stand)).values():
                self.assertNotIn(BAND, page.decode("utf-8"))
        for name, page in self.pages(self.web("test")).items():
            self.assertIn(BAND, page.decode("utf-8"), name)
        style = read(os.path.join(_harness.CHECKOUT, "moneyd", "assets", "auth.css")).decode("utf-8")
        self.assertIn('html[data-stand="test"]', style)
        self.assertIn("color-scheme: dark", style)

    def test_the_upload_control_is_not_drawn_on_test(self):
        self.assertIn('data-upload="ledger"', self.pages(self.web("dev"))["data"].decode("utf-8"))
        self.assertIn("data-upload-confirm", self.pages(self.web("prod"))["data"].decode("utf-8"))
        on_test = self.pages(self.web("test"))["data"].decode("utf-8")
        self.assertNotIn("data-upload", on_test)
        self.assertNotIn('type="file"', on_test)
        self.assertIn('data-download="ledger"', on_test)
        self.assertIn('data-download="plan"', on_test)

    def test_what_a_page_is_filled_with_is_escaped(self):
        web = self.web("dev")
        text = web.render("login", state="signed-in", firstName="<b>\"O'Neil\" & co</b>").decode("utf-8")
        self.assertIn("Вы вошли как &lt;b&gt;&quot;O&#x27;Neil&quot; &amp; co&lt;/b&gt;", text)
        entries = json.dumps([{"t": "x", "event": "\"><script>alert(1)</script>"}])
        page = web.render("data", firstName="Mika", entries=entries)
        self.assertEqual(httpd.inspect_page(page), httpd.PageFacts((), 0))

    def test_the_pages_are_whole_and_hold_what_their_script_asks_for(self):
        void = {"meta", "link", "input", "br", "hr", "img"}

        class Outline(html.parser.HTMLParser):
            def __init__(self):
                super().__init__(convert_charrefs=True)
                self.open, self.ids, self.attributes, self.problems = [], [], set(), []

            def handle_starttag(self, tag, attrs):
                if tag not in void:
                    self.open.append(tag)
                for name, value in attrs:
                    if name == "id":
                        self.ids.append(value)
                    self.attributes.add('%s="%s"' % (name, value) if value is not None else name)

            def handle_endtag(self, tag):
                if not self.open or self.open.pop() != tag:
                    self.problems.append("</%s> closes nothing" % tag)

        script = read(os.path.join(_harness.CHECKOUT, "moneyd", "assets", "auth.js")).decode("utf-8")
        asked = set(re.findall(r"\$\('([a-z-]+)'\)", script))
        self.assertGreater(len(asked), 20)
        for stand in ("dev", "test"):
            found = set()
            for name, page in self.pages(self.web(stand)).items():
                outline = Outline()
                outline.feed(page.decode("utf-8"))
                outline.close()
                self.assertEqual((outline.problems, outline.open), ([], []), name)
                self.assertEqual(len(outline.ids), len(set(outline.ids)), "an id is one element's")
                self.assertIn('data-page="%s"' % name, outline.attributes)
                found |= set(outline.ids)
                if name == "data":
                    for kind in ("ledger", "plan"):
                        self.assertIn('data-status="%s"' % kind, outline.attributes)
                        self.assertIn('data-download="%s"' % kind, outline.attributes)
                        self.assertEqual('data-upload="%s"' % kind in outline.attributes, stand != "test")
                    self.assertEqual("data-upload-confirm" in outline.attributes, stand != "test")
            uploads = {"confirm", "confirm-title", "confirm-file", "confirm-server", "confirm-yes", "confirm-no"}
            self.assertEqual(asked - found, uploads if stand == "test" else set(), stand)
        # The states of /login are told apart by the stylesheet alone: the page works before its script has loaded.
        style = read(os.path.join(_harness.CHECKOUT, "moneyd", "assets", "auth.css")).decode("utf-8")
        self.assertEqual(style.count("{"), style.count("}"))
        for state in ("form", "ending", "signed-in"):
            self.assertIn('body[data-state="%s"] [data-when~="%s"]' % (state, state), style)
            self.assertRegex(self.pages(self.web("dev"))["login"].decode("utf-8"), r'data-when="[a-z -]*\b%s\b' % state)

    def test_the_login_page_says_whose_password_this_is(self):
        text = self.pages(self.web("prod"))["login"].decode("utf-8")
        self.assertIn("Пароль у Money свой — не тот, что на платформе.", text)
        self.assertIn("Вход скоро закончится — войдите заново", text)
        self.assertIn('autocomplete="username"', text)
        self.assertIn('autocomplete="current-password"', text)
        self.assertRegex(text, r'<form[^>]*method="post"')
        self.assertEqual(self.pages(self.web("prod"))["set-password"].decode("utf-8").count('autocomplete="new-password"'), 2)


# ---------------------------------------------------------------------------
# The walk
# ---------------------------------------------------------------------------

class WalkTests(StandCase):
    def test_from_a_stranger_to_a_founder_and_back(self):
        stand = self.stand

        # -- a stranger: 401 as JSON under /api/, a redirect to /login for the rest
        for path in ("/", "/index.html", "/data", "/dashboard", "/nothing", "/server.py", "/.git/config",
                     "/data/ledger/current.json", "/money/vendor/../../server.py", "/api", "/healthz/x"):
            answer = stand.get(path)
            self.assertEqual((answer.status, answer.header("Location"), answer.body), (302, "/login", b""), path)
        for path in ("/api/me", LEDGER, PLAN, "/api/nothing", "/api/", "/money/vendor/pdf.min.js"):
            answer = stand.get(path)
            self.assertRefused(answer, 401, "unauthenticated")
            self.assertIsNone(answer.header("Location"), path)
        self.assertRefused(stand.put(LEDGER, {"base": 0, "doc": ledger()}), 401, "unauthenticated")
        login = stand.get("/login")
        self.assertEqual(login.status, 200)
        self.assertEqual(login.header("Content-Security-Policy"), httpd.CSP_OWN_PAGES)
        self.assertEqual(login.header("Cache-Control"), "no-store")
        self.assertIn('data-state="form"', login.text)

        # -- a one-time link, issued on the server, sets a password and signs in
        invited = stand.ctl("user", "invite", "mika", "--print")
        self.assertEqual(invited.status, 0, invited.err)
        link = re.search(r"http://finance\.localhost:%d/set-password#t=(\S+)" % stand.port, invited.out)
        self.assertIsNotNone(link, "the link is built from the public URL, with the token after the #")
        token = link.group(1)
        self.assertEqual(stand.get("/set-password").status, 200)
        self.assertRefused(stand.post("/api/auth/setup", {"token": token, "password": "short"}), 400, "weak_password")
        setup = stand.post("/api/auth/setup", {"token": token, "password": PASSWORD})
        self.assertEqual((setup.status, setup.json()), (200, {"ok": True, "firstName": "Mika"}))
        first = setup.cookie("money-dev")
        self.assertEqual(setup.all("Set-Cookie"), [first + "; Path=/; HttpOnly; SameSite=Lax; Max-Age=2592000"])
        self.assertRefused(stand.post("/api/auth/setup", {"token": token, "password": PASSWORD + "!"}), 404, "invalid_link")
        self.assertEqual(stand.get("/api/me", cookie=first).status, 200)

        # -- the sign-in door: one answer for every failure, a fresh session for the right password
        wrong = stand.post("/api/auth/login", {"login": "mika", "password": PASSWORD + "x"})
        nobody = stand.post("/api/auth/login", {"login": "nobody", "password": PASSWORD})
        self.assertRefused(wrong, 401, "invalid_credentials")
        self.assertEqual(wrong.body, nobody.body)
        self.assertEqual(wrong.all("Set-Cookie"), [])
        self.assertRefused(stand.post("/api/auth/login", {"login": "mika"}), 400, "missing_credentials")
        signed = stand.post("/api/auth/login", {"login": " Mika ", "password": PASSWORD}, cookie=first)
        self.assertEqual((signed.status, signed.json()), (200, {"ok": True, "firstName": "Mika"}))
        cookie = signed.cookie("money-dev")
        self.assertNotEqual(cookie, first)
        self.assertEqual(signed.all("Set-Cookie"), [cookie + "; Path=/; HttpOnly; SameSite=Lax; Max-Age=2592000"])
        self.assertRefused(stand.get("/api/me", cookie=first), 401, "unauthenticated")     # the presented one is gone

        # -- who am I
        me = stand.get("/api/me", cookie=cookie)
        self.assertEqual(me.json(), {"id": "mika", "name": "Mika", "firstName": "Mika", "isFounderTier": True,
                                     "stand": "dev", "version": "dev"})
        self.assertEqual(me.header("Cache-Control"), "no-store")
        self.assertEqual(me.header("Content-Security-Policy"), httpd.CSP_JSON)

        # -- the two documents: read, save, and what a save refuses
        for path in (LEDGER, PLAN):
            self.assertEqual(stand.get(path, cookie=cookie).body, b'{"rev":0,"doc":{},"updatedAt":null}')
        text = ledger(3, note="кириллица,   and \"quotes\"")
        saved = stand.put(LEDGER, {"base": 0, "doc": text}, cookie=cookie)
        self.assertEqual((saved.status, saved.json()), (200, {"rev": 1}))
        stored = stand.get(LEDGER, cookie=cookie)
        self.assertEqual(stored.body.decode("utf-8"), '{"rev":1,"doc":%s,"updatedAt":"2026-10-07T12:00:00.000Z"}' % text)
        self.assertEqual(stored.header("Content-Type"), "application/json; charset=utf-8")
        stale = stand.put(LEDGER, {"base": 0, "doc": ledger(4)}, cookie=cookie)
        self.assertEqual((stale.status, stale.json()["error"], stale.json()["rev"]), (409, "money_stale", 1))
        for body in ({"base": 1, "doc": plan()},                    # the other document
                     {"base": 1, "doc": "[1, 2]"},                  # not an object
                     {"base": 1, "doc": "{not json"},
                     {"base": 1, "doc": json.loads(ledger())},      # an object where a string of JSON belongs
                     {"base": "1", "doc": ledger()},
                     {"base": 1},
                     [1, 2]):
            self.assertRefused(stand.put(LEDGER, body, cookie=cookie), 400, "bad_money_doc")
        self.assertRefused(stand.put(LEDGER, body=b"{not json", cookie=cookie,
                                     headers={"Content-Type": "application/json"}), 400, "bad_json")
        self.assertEqual(stand.get(LEDGER, cookie=cookie).body, stored.body, "a refused save writes nothing")
        self.assertEqual(stand.put(LEDGER, {"base": 1.0, "doc": ledger(5)}, cookie=cookie).json(), {"rev": 2})
        self.assertEqual(stand.put(PLAN, {"base": 0, "doc": plan(2)}, cookie=cookie).json(), {"rev": 1})
        self.assertRefused(stand.put(PLAN, {"base": 1, "doc": ledger()}, cookie=cookie), 400, "bad_money_doc")
        self.assertEqual(stand.put(PLAN, {"base": 0, "doc": plan(3)}, cookie=cookie).json()["rev"], 1)   # 409 names it
        self.assertTrue(stand.get(LEDGER, cookie=cookie).body.startswith(b'{"rev":2,'))

        # -- the page: the file, byte for byte, under its own policy
        page = read(INDEX)
        for path in ("/", "/index.html", "/?utm=x"):
            answer = stand.get(path, cookie=cookie)
            self.assertEqual(answer.status, 200, path)
            self.assertEqual(hashlib.sha256(answer.body).hexdigest(), hashlib.sha256(page).hexdigest(), path)
            self.assertEqual(answer.header("Content-Type"), "text/html; charset=utf-8")
            self.assertEqual(answer.header("Cache-Control"), "no-cache")
            self.assertEqual(answer.header("Vary"), "Cookie")
            self.assertEqual(answer.header("Content-Security-Policy"),
                             httpd.page_policy(httpd.inspect_page(page).script_hashes))
            self.assertIsNone(answer.header("Content-Security-Policy-Report-Only"))
        modified = answer.header("Last-Modified")
        again = stand.get("/", cookie=cookie, headers={"If-Modified-Since": modified})
        self.assertEqual((again.status, again.body, again.header("Cache-Control")), (304, b"", "no-cache"))
        self.assertEqual(stand.get("/", cookie=cookie, headers={"If-Modified-Since": "Thu, 01 Jan 2099 00:00:00 GMT"}).status, 200)
        self.assertEqual(stand.get("/", headers={"If-Modified-Since": modified}).status, 302)

        # -- a vendor file
        for name in httpd.VENDOR_FILES:
            answer = stand.get("/money/vendor/" + name, cookie=cookie)
            self.assertEqual(answer.status, 200)
            self.assertEqual(answer.body, read(os.path.join(_harness.CHECKOUT, "vendor", name)))
            self.assertEqual(answer.header("Content-Type"), "text/javascript; charset=utf-8")
            self.assertEqual(answer.header("Cache-Control"), "no-cache")
            self.assertEqual(answer.header("Content-Security-Policy"), httpd.CSP_VENDOR)
        self.assertRefused(stand.get("/money/vendor/other.js", cookie=cookie), 404, "not_found")

        # -- /login never redirects; /data; the platform's old links
        login = stand.get("/login", cookie=cookie)
        self.assertEqual(login.status, 200)
        self.assertIn('data-state="signed-in"', login.text)
        self.assertIn("Вы вошли как Mika", login.text)
        data = stand.get("/data", cookie=cookie)
        self.assertEqual((data.status, data.header("Content-Security-Policy")), (200, httpd.CSP_OWN_PAGES))
        self.assertIn('data-upload="ledger"', data.text)
        entries = json.loads(html.unescape(re.search(r'data-entries="([^"]*)"', data.text).group(1)))
        self.assertEqual([entry["event"] for entry in entries][:2], ["sign-in", "sign-in-failed"])
        self.assertLessEqual(len(entries), 50)
        for path in ("/tracker/board", "/dashboard", "/money/", "/money/index.html"):
            answer = stand.get(path, cookie=cookie)
            self.assertEqual((answer.status, answer.header("Location")), (302, "/"), path)
        self.assertEqual(stand.get("/logout", cookie=cookie).header("Location"), "/login")
        self.assertEqual(stand.get("/api/me", cookie=cookie).status, 200, "GET /logout changes nothing by itself")
        self.assertRefused(stand.get("/nothing", cookie=cookie), 404, "not_found")
        self.assertRefused(stand.get("/api/nothing", cookie=cookie), 404, "not_found")

        # -- out again
        out = stand.post("/api/auth/logout", {}, cookie=cookie)
        self.assertEqual((out.status, out.json()), (200, {"ok": True}))
        self.assertEqual(out.all("Set-Cookie"), ["money-dev=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0"])
        self.assertEqual(out.header("Clear-Site-Data"), '"cache"')
        self.assertRefused(stand.get("/api/me", cookie=cookie), 401, "unauthenticated")
        self.assertRefused(stand.get(LEDGER, cookie=cookie), 401, "unauthenticated")
        self.assertRefused(stand.put(LEDGER, {"base": 2, "doc": ledger()}, cookie=cookie), 401, "unauthenticated")
        self.assertRefused(stand.get("/money/vendor/pdf.min.js", cookie=cookie), 401, "unauthenticated")
        for path in ("/", "/data", "/dashboard"):
            self.assertEqual((stand.get(path, cookie=cookie).status, stand.get(path, cookie=cookie).header("Location")),
                             (302, "/login"), path)
        self.assertEqual(stand.post("/api/auth/logout", {}).status, 200, "signing out twice is still signing out")

        # -- and nothing that signs somebody in was written to the log
        said = stand.log_text()
        for secret in (PASSWORD, token, stand.token_of(first), stand.token_of(cookie)):
            self.assertNotIn(secret, said)
        puts = [line for line in stand.log_lines() if line.get("method") == "PUT" and line["status"] == 200]
        self.assertEqual({line["login"] for line in puts}, {"mika"})
        self.assertEqual({line["path"] for line in puts}, {LEDGER, PLAN})


class HeadersTests(StandCase):
    def test_every_answer_carries_the_fixed_headers(self):
        stand = self.stand
        cookie = stand.session()
        modified = stand.get("/", cookie=cookie).header("Last-Modified")
        answers = {
            "page": stand.get("/", cookie=cookie),
            "not modified": stand.get("/", cookie=cookie, headers={"If-Modified-Since": modified}),
            "login": stand.get("/login"),
            "asset": stand.get("/assets/auth.js"),
            "json": stand.get("/api/me", cookie=cookie),
            "redirect": stand.get("/"),
            "401": stand.get("/api/me"),
            "404": stand.get("/nothing", cookie=cookie),
            "405": stand.request("DELETE", LEDGER, cookie=cookie),
            "421": stand.get("/login", host="evil.example"),
            "204": stand.get("/favicon.ico"),
            "robots": stand.get("/robots.txt"),
            "403": stand.put(LEDGER, {"base": 0, "doc": ledger()}, cookie=cookie, origin="https://evil.example"),
            "400": stand.put(LEDGER, body=b"x", cookie=cookie, headers={"Content-Type": "application/json"}),
        }
        for name, answer in answers.items():
            with self.subTest(answer=name):
                for header, value in FIXED.items():
                    self.assertEqual(answer.header(header), value, header)
                policy = answer.header("Content-Security-Policy")
                self.assertTrue(policy and policy.startswith("default-src 'none'"), policy)
                self.assertIsNotNone(answer.header("Date"))
                self.assertIsNotNone(answer.header("Cache-Control"))
                for header in answer.headers.keys():
                    self.assertFalse(header.lower().startswith("access-control-"), header)
                self.assertIsNone(answer.header("Strict-Transport-Security"), "that one is the edge's")
        self.assertEqual(answers["asset"].header("Content-Security-Policy"), httpd.CSP_VENDOR)
        self.assertEqual(answers["asset"].header("Cache-Control"), "no-cache")
        self.assertEqual(answers["robots"].body, b"User-agent: *\nDisallow: /\n")
        self.assertEqual((answers["204"].status, answers["204"].body), (204, b""))
        self.assertEqual(stand.get("/assets/auth.css").header("Content-Type"), "text/css; charset=utf-8")

    def test_head_is_get_without_a_body(self):
        stand = self.stand
        cookie = stand.session()
        for path in ("/", LEDGER, "/login", "/api/me"):
            got, head = stand.get(path, cookie=cookie), stand.request("HEAD", path, cookie=cookie)
            self.assertEqual((head.status, head.body), (200, b""), path)
            self.assertEqual(head.header("Content-Length"), str(len(got.body)), path)
        self.assertEqual(stand.request("HEAD", "/api/me").status, 401)

    def test_report_only_is_one_switch_for_every_policy(self):
        with _harness.Stand(env={"MONEY_CSP": "report-only"}) as stand:
            for answer in (stand.get("/login"), stand.get("/", cookie=stand.session()), stand.get("/api/me")):
                self.assertIsNone(answer.header("Content-Security-Policy"))
                self.assertTrue(answer.header("Content-Security-Policy-Report-Only").startswith("default-src 'none'"))

    def test_the_platforms_old_cookie_is_cleared_and_never_read(self):
        stand = self.stand
        cookie = stand.session()
        answer = stand.get("/api/me", cookie="ssp_session=OLD-PLATFORM-TOKEN-0123456789; " + cookie)
        self.assertEqual(answer.status, 200)
        self.assertEqual(answer.all("Set-Cookie"), ["ssp_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0"])
        self.assertRefused(stand.get("/api/me", cookie="ssp_session=" + stand.token_of(cookie)), 401, "unauthenticated")
        self.assertEqual(stand.get("/api/me", cookie=cookie).all("Set-Cookie"), [])
        self.assertNotIn("OLD-PLATFORM-TOKEN", stand.log_text())


class ServerStandTests(unittest.TestCase):
    """prod and test, as far as a stand's name decides: served from this process, with a stand-in for scrypt."""

    def stand(self, name):
        stand_in = _harness.scrypt_stand_in()
        stand_in.__enter__()
        self.addCleanup(stand_in.__exit__, None, None, None)
        stand = _harness.Stand(env=_harness.stand_changes(name))
        self.addCleanup(stand.stop)
        return stand

    def test_the_test_stand(self):
        stand = self.stand("test")
        self.assertEqual((stand.origin, stand.host), ("https://finance.test.selfstudio.se", "finance.test.selfstudio.se"))
        self.assertEqual(read(os.path.join(stand.data_dir, "STAND")), b"test\n")
        for path in ("/login", "/set-password"):
            page = stand.get(path)
            self.assertIn(BAND, page.text)
            self.assertIn('data-stand="test"', page.text)

        # A link goes to a terminal and to nothing else: --print is the dev stand's.
        printed = stand.ctl("user", "invite", "misha", "--print")
        self.assertEqual((printed.status, printed.out), (2, ""))
        shown = stand.ctl("user", "invite", "misha", terminal=True)
        self.assertEqual(shown.status, 0, shown.err)
        token = re.search(r"\nhttps://finance\.test\.selfstudio\.se/set-password#t=(\S+)\n$", shown.out).group(1)

        # The cookie of a stand: the __Host- prefix and Secure, to the letter.
        setup = stand.post("/api/auth/setup", {"token": token, "password": PASSWORD})
        self.assertEqual(setup.status, 200, setup.body)
        first = setup.cookie("__Host-money")
        self.assertEqual(setup.all("Set-Cookie"), [first + "; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=2592000"])
        self.assertRegex(read(os.path.join(stand.data_dir, "auth", "users.json")).decode("ascii"), r'"hash":"scrypt\$15\$8\$3\$')
        signed = stand.post("/api/auth/login", {"login": "misha", "password": PASSWORD}, cookie=first)
        self.assertEqual((signed.status, signed.json()), (200, {"ok": True, "firstName": "Misha"}))
        cookie = signed.cookie("__Host-money")
        self.assertEqual(signed.all("Set-Cookie"), [cookie + "; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=2592000"])
        self.assertEqual(stand.get("/api/me", cookie=cookie).json()["stand"], "test")
        self.assertEqual(stand.get("/api/me", cookie=cookie.replace("__Host-money", "money-dev")).status, 401)
        self.assertEqual(stand.get("/api/me", cookie="ssp_session=x; " + cookie).all("Set-Cookie"),
                         ["ssp_session=; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=0"])
        self.assertEqual(stand.put(LEDGER, {"base": 0, "doc": ledger()}, cookie=cookie, origin="http://finance.test.selfstudio.se").status, 403)
        self.assertEqual(stand.put(LEDGER, {"base": 0, "doc": ledger()}, cookie=cookie).json(), {"rev": 1})

        # /data on test: the band, both downloads, and no way to upload.
        data = stand.get("/data", cookie=cookie)
        self.assertIn(BAND, data.text)
        self.assertIn('data-download="plan"', data.text)
        self.assertNotIn("data-upload", data.text)

        # The edge is believed about who is asking; nobody else is.
        stand.get("/robots.txt", headers={"X-Forwarded-For": "198.51.100.4, 203.0.113.9"})
        self.assertEqual(stand.log_lines()[-1]["addr"], "203.0.113.9")

        # The stand's own commands: test is fabricated, so it takes a seed and a purge.
        self.assertEqual(stand.ctl("ping").status, 0)
        check = stand.ctl("selfcheck")
        self.assertEqual(check.status, 0, check.out + check.err)
        self.assertIn("Money self-check: stand test, version dev, https://finance.test.selfstudio.se\n", check.out)
        self.assertIn("  password hash: scrypt\n", check.out)
        seeded = stand.ctl("seed", "ledger", "--fresh", stdin=ledger(9))
        self.assertEqual(seeded.status, 0, seeded.err)
        self.assertIn("Money's TEST stand (now at revision 1)", seeded.err)
        self.assertEqual(stand.ctl("purge-snapshots", "--older-than-days", "2").status, 0)
        self.assertEqual(stand.ctl("empty").status, 1)

        out = stand.post("/api/auth/logout", {}, cookie=cookie)
        self.assertEqual(out.all("Set-Cookie"), ["__Host-money=; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=0"])
        self.assertEqual(stand.get("/api/me", cookie=cookie).status, 401)

    def test_the_prod_stand(self):
        stand = self.stand("prod")
        self.assertEqual((stand.origin, stand.settings.cookie_name), ("https://finance.selfstudio.se", "__Host-money"))
        login = stand.get("/login")
        self.assertNotIn(BAND, login.text)
        self.assertIn('data-stand="prod"', login.text)
        self.assertEqual(login.header("Content-Security-Policy"), httpd.CSP_OWN_PAGES)
        cookie = stand.session()
        self.assertIn('data-upload="ledger"', stand.get("/data", cookie=cookie).text)
        self.assertEqual(stand.put(LEDGER, {"base": 0, "doc": ledger(3)}, cookie=cookie).json(), {"rev": 1})
        before = stand.get(LEDGER, cookie=cookie).body

        # prod never takes a seed and never purges: exit status 2, and nothing is read or written.
        for command in (("seed", "ledger", "--fresh"), ("seed", "plan"), ("purge-snapshots", "--older-than-days", "0")):
            refused = stand.ctl(*command, stdin=ledger(1))
            self.assertEqual((refused.status, refused.out), (2, ""), command)
            self.assertIn("This stand is prod.", refused.err)
        self.assertEqual(stand.get(LEDGER, cookie=cookie).body, before)
        self.assertEqual(stand.get(PLAN, cookie=cookie).body, b'{"rev":0,"doc":{},"updatedAt":null}')
        self.assertEqual([entry for entry in stand.security_events() if entry["event"] in ("seed", "snapshots-purged")], [])
        self.assertEqual(stand.ctl("user", "invite", "mika", "--print").status, 2)
        self.assertEqual(stand.ctl("user", "invite", "mika").status, 2)

        # What prod does take: the self-check (which writes nothing), and a restore that is typed for.
        check = stand.ctl("selfcheck")
        self.assertEqual(check.status, 0, check.out + check.err)
        self.assertIn("  policy: enforced\n", check.out)
        self.assertEqual(stand.get(LEDGER, cookie=cookie).body, before)
        stand.clock.tick(days=1)
        self.assertEqual(stand.put(LEDGER, {"base": 1, "doc": ledger(1)}, cookie=cookie).json(), {"rev": 2})
        snapshot = "day-2026-10-08-rev000001.json.gz"
        wrong = stand.ctl("restore", "ledger", snapshot, stdin="test\n")
        self.assertEqual(wrong.status, 2)
        self.assertIn("Money's PROD stand", wrong.err)
        self.assertEqual(stand.ctl("restore", "ledger", snapshot, stdin="prod\n").status, 0)
        self.assertTrue(stand.get(LEDGER, cookie=cookie).body.startswith(b'{"rev":3,"doc":%s,' % ledger(3).encode("utf-8")))


# ---------------------------------------------------------------------------
# What is refused, and when
# ---------------------------------------------------------------------------

class RefusalTests(StandCase):
    def head(self, method, path, *lines, cookie=None, host=None):
        """A request's head as bytes: the line, Host, then ``lines``, then the blank line."""
        out = ["%s %s HTTP/1.1" % (method, path), "Host: %s" % (host or self.stand.host)]
        if cookie:
            out.append("Cookie: %s" % cookie)
        out.extend(lines)
        return ("\r\n".join(out) + "\r\n\r\n").encode("ascii")

    def status(self, answer):
        return int(answer.split(b" ", 2)[1]) if answer.startswith(b"HTTP/1.1 ") else None

    def test_host_origin_and_content_type_are_judged_before_the_body(self):
        stand = self.stand
        cookie = stand.session()
        good = {"base": 0, "doc": ledger()}
        self.assertRefused(stand.get("/login", host="evil.example"), 421, "misdirected")
        self.assertRefused(stand.get("/login", host=None), 421, "misdirected")         # http.client's own: 127.0.0.1:port
        self.assertEqual(self.status(stand.raw(b"GET /login HTTP/1.1\r\n\r\n")), 421)
        self.assertEqual(self.status(stand.raw(self.head("GET", "/login", "Host: " + stand.host))), 421)
        for door, body in ((LEDGER, good), ("/api/auth/login", {"login": "mika", "password": PASSWORD}),
                           ("/api/auth/logout", {})):
            method = "PUT" if door == LEDGER else "POST"
            with self.subTest(door=door):
                for origin in ("https://evil.example", None, stand.origin + "/", "null"):
                    self.assertRefused(stand.request(method, door, body, cookie=cookie, origin=origin), 403, "bad_origin")
                for site in ("cross-site", "same-site", "none"):
                    self.assertRefused(stand.request(method, door, body, cookie=cookie,
                                                     headers={"Sec-Fetch-Site": site}), 403, "bad_origin")
                self.assertRefused(stand.request(method, door, body=b"{}", cookie=cookie,
                                                 headers={"Content-Type": "text/plain"}), 415, "bad_content_type")
                self.assertRefused(stand.request(method, door, body=b"{}", cookie=cookie), 415, "bad_content_type")
        self.assertRefused(stand.get(LEDGER, cookie=cookie, headers={"Sec-Fetch-Site": "cross-site"}), 403, "bad_origin")
        self.assertRefused(stand.get(LEDGER, cookie=cookie, origin="https://evil.example"), 403, "bad_origin")
        self.assertEqual(stand.get(LEDGER, cookie=cookie, headers={"Sec-Fetch-Site": "none"}).status, 200)
        self.assertEqual(stand.get("/", cookie=cookie, headers={"Sec-Fetch-Site": "cross-site"}).status, 200,
                         "a link from a messenger opens the page")
        self.assertEqual(stand.get(LEDGER, cookie=cookie).body, b'{"rev":0,"doc":{},"updatedAt":null}')

    def test_a_body_needs_a_length_within_the_doors_limit(self):
        stand = self.stand
        cookie = stand.session()
        json_type = "Content-Type: application/json"
        origin = "Origin: " + stand.origin
        # No Content-Length, and one that is not a number: 411.
        for extra in ((), ("Content-Length: ten",), ("Content-Length: -1",), ("Content-Length: 1_0",)):
            answer = stand.raw(self.head("PUT", LEDGER, json_type, origin, *extra, cookie=cookie), half_close=True)
            self.assertEqual(self.status(answer), 411, extra)
        # One byte over, refused unread - the body is never sent.
        for door, limit in ((LEDGER, 16 * 1024 * 1024), (PLAN, 4 * 1024 * 1024)):
            answer = stand.raw(self.head("PUT", door, json_type, origin, "Content-Length: %d" % (limit + 1),
                                         cookie=cookie), half_close=True)
            self.assertEqual(self.status(answer), 413, door)
            self.assertIn(b'"body_too_large"', answer)
        over = stand.post("/api/auth/login", body=b"a" * 4097, headers={"Content-Type": "application/json"})
        self.assertRefused(over, 413, "body_too_large")
        exact = stand.post("/api/auth/login", body=b" " * 4096, headers={"Content-Type": "application/json"})
        self.assertRefused(exact, 400, "bad_json")
        # Two lengths that disagree, and a Transfer-Encoding: nobody guesses where such a request ends.
        answer = stand.raw(self.head("PUT", LEDGER, json_type, origin, "Content-Length: 2", "Content-Length: 3",
                                     cookie=cookie) + b"{}", half_close=True)
        self.assertEqual(self.status(answer), 400)
        answer = stand.raw(self.head("PUT", LEDGER, json_type, origin, "Transfer-Encoding: chunked", cookie=cookie)
                           + b"2\r\n{}\r\n0\r\n\r\n", half_close=True)
        self.assertEqual(self.status(answer), 400)
        self.assertEqual(stand.get(LEDGER, cookie=cookie).body, b'{"rev":0,"doc":{},"updatedAt":null}')

    def test_methods(self):
        stand = self.stand
        cookie = stand.session()
        for method in ("OPTIONS", "DELETE", "PATCH", "TRACE", "CONNECT"):
            for who in (None, cookie):
                answer = stand.request(method, LEDGER, cookie=who, origin=None)
                self.assertRefused(answer, 405, "method_not_allowed")
                self.assertEqual(answer.header("Allow"), "GET, HEAD, POST, PUT")
        # A path of the table under another method: 405 where a stranger may know the path exists...
        self.assertEqual(stand.post("/login", {}).header("Allow"), "GET, HEAD")
        self.assertEqual(stand.get("/api/auth/login").header("Allow"), "POST")
        self.assertEqual(stand.post(LEDGER, {}, cookie=cookie).header("Allow"), "GET, HEAD, PUT")
        # ...and for a stranger the same answer as for any path.
        self.assertRefused(stand.post(LEDGER, {}), 401, "unauthenticated")
        self.assertEqual(stand.post("/data", {}).status, 302)

    def test_a_request_that_is_not_one(self):
        stand = self.stand
        host = ("Host: %s\r\n" % stand.host).encode("ascii")
        for request in (b"GET /login\r\n\r\n",                                        # HTTP/0.9
                        b"GET /login HTTP/2.0\r\n" + host + b"\r\n",
                        b"get /login HTTP/1.1\r\n" + host + b"\r\n",
                        b"GET /lo gin HTTP/1.1\r\n" + host + b"\r\n",
                        b"GET /login HTTP/1.1\r\n" + host + b"Broken header\r\n\r\n",
                        b"GET /login HTTP/1.1\r\n" + host + b"X-Folded: a\r\n b\r\n\r\n",
                        b"GET /login HTTP/1.1\r\n" + host + b"Bad Name: a\r\n\r\n",
                        b"GET /login HTTP/1.1\r\n" + host + b"Expect: something\r\n\r\n",
                        b"GET /login HTTP/1.1\r\n" + host + b"X: \x00\r\n\r\n",
                        b"\r\nGET /login HTTP/1.1\r\n" + host + b"\r\n"):
            answer = stand.raw(request, half_close=True)
            self.assertIn(self.status(answer), (400, 417), request)
            self.assertIn(b"Connection: close", answer)
        self.assertEqual(self.status(stand.raw(b"GET /" + b"a" * 9000 + b" HTTP/1.1\r\n" + host + b"\r\n",
                                               half_close=True)), 414)
        many = b"".join(b"X-%d: 1\r\n" % i for i in range(101))
        self.assertEqual(self.status(stand.raw(b"GET /login HTTP/1.1\r\n" + host + many + b"\r\n", half_close=True)), 431)
        big = b"X-Big: " + b"a" * 8000 + b"\r\n"
        self.assertEqual(self.status(stand.raw(b"GET /login HTTP/1.1\r\n" + host + big * 5 + b"\r\n", half_close=True)), 431)
        self.assertEqual(stand.raw(b"", half_close=True), b"", "nothing asked, nothing answered")
        self.assertEqual(stand.get("/login").status, 200)
        # None of it is echoed into the log.
        self.assertNotIn("Broken", stand.log_text())
        self.assertNotIn("aaaa", stand.log_text())

    def test_one_request_per_connection(self):
        stand = self.stand
        two = b"GET /robots.txt HTTP/1.1\r\nHost: %s\r\n\r\n" % stand.host.encode("ascii")
        answer = stand.raw(two + two, half_close=True)
        self.assertEqual(answer.count(b"HTTP/1.1 "), 1)
        self.assertIn(b"Connection: close", answer)
        # A smuggled second request in the body of a GET is never served.
        hidden = b"GET /login HTTP/1.1\r\nHost: %s\r\nContent-Length: %d\r\n\r\n" % (stand.host.encode("ascii"), len(two))
        self.assertEqual(stand.raw(hidden + two, half_close=True).count(b"HTTP/1.1 "), 1)

    def test_deep_json_is_a_400_and_the_server_lives(self):
        stand = self.stand
        cookie = stand.session()
        deep = b"[" * 2048 + b"]" * 2048                    # a maximally nested 4 KiB body
        answer = stand.post("/api/auth/login", body=deep, headers={"Content-Type": "application/json"})
        self.assertRefused(answer, 400, "bad_json")
        self.assertRefused(stand.post("/api/auth/setup", body=b"{" * 4096, headers={"Content-Type": "application/json"}),
                           400, "bad_json")
        nested = b'{"base":0,"doc":' + b'{"a":' * 5000 + b"1" + b"}" * 5000 + b"}"
        self.assertRefused(stand.put(LEDGER, body=nested, cookie=cookie, headers={"Content-Type": "application/json"}),
                           400, "bad_money_doc")
        doc = "[" * 5000 + "]" * 5000
        self.assertRefused(stand.put(LEDGER, {"base": 0, "doc": doc}, cookie=cookie), 400, "bad_money_doc")
        self.assertEqual(stand.get("/api/me", cookie=cookie).status, 200)
        self.assertEqual([line for line in stand.log_lines() if line.get("event") == "exception"], [])

    def test_expect_continue_is_said_only_when_the_body_will_be_read(self):
        stand = self.stand
        cookie = stand.session()
        body = json.dumps({"base": 0, "doc": ledger()}).encode("utf-8")
        head = self.head("PUT", LEDGER, "Content-Type: application/json", "Origin: " + stand.origin,
                         "Content-Length: %d" % len(body), "Expect: 100-continue", cookie=cookie)
        answer = stand.raw(head, pause=0.2, then=body, half_close=True)
        self.assertTrue(answer.startswith(b"HTTP/1.1 100 Continue\r\n\r\nHTTP/1.1 200 "), answer[:80])
        refused = stand.raw(self.head("PUT", LEDGER, "Content-Type: application/json", "Origin: https://evil.example",
                                      "Content-Length: %d" % len(body), "Expect: 100-continue", cookie=cookie))
        self.assertEqual(self.status(refused), 403)

    def test_the_sign_in_limit_says_how_long_to_wait(self):
        stand = self.stand
        stand.set_password("mika")
        for _attempt in range(10):
            self.assertEqual(stand.post("/api/auth/login", {"login": "mika", "password": "wrong " + PASSWORD}).status, 401)
        blocked = stand.post("/api/auth/login", {"login": "mika", "password": PASSWORD})
        self.assertRefused(blocked, 429, "too_many_attempts")
        self.assertEqual(blocked.header("Retry-After"), str(blocked.json()["retryAfter"]))
        self.assertTrue(0 < blocked.json()["retryAfter"] <= 900)
        stand.clock.tick(seconds=901)
        self.assertEqual(stand.post("/api/auth/login", {"login": "mika", "password": PASSWORD}).status, 200)


class SessionTests(StandCase):
    def test_in_its_last_day_a_session_saves_but_does_not_open_the_page(self):
        stand = self.stand
        cookie = stand.session()
        self.assertEqual(stand.get("/", cookie=cookie).status, 200)
        # A session idles out after 14 days without use, so it is used along the way, as an open page does.
        for _week in range(4):
            stand.clock.tick(days=7)
            self.assertEqual(stand.get("/api/me", cookie=cookie).status, 200)
        stand.clock.tick(days=1, minutes=1)                 # 29 days and a minute after sign-in
        for path in ("/", "/index.html"):
            answer = stand.get(path, cookie=cookie)
            self.assertEqual((answer.status, answer.header("Location")), (302, "/login"), path)
        login = stand.get("/login", cookie=cookie)
        self.assertEqual(login.status, 200)
        self.assertIn('data-state="ending"', login.text)
        self.assertEqual(stand.get("/api/me", cookie=cookie).status, 200)
        self.assertEqual(stand.put(LEDGER, {"base": 0, "doc": ledger()}, cookie=cookie).json(), {"rev": 1})
        self.assertEqual(stand.get("/money/vendor/pdf.min.js", cookie=cookie).status, 200)
        stand.set_password("mika")                          # which also closes that session
        fresh = stand.post("/api/auth/login", {"login": "mika", "password": PASSWORD}, cookie=cookie).cookie("money-dev")
        self.assertEqual(stand.get("/", cookie=fresh).status, 200)
        stand.clock.tick(days=30, seconds=1)
        self.assertRefused(stand.get("/api/me", cookie=fresh), 401, "unauthenticated")

    def test_what_ctl_does_reaches_the_running_server(self):
        stand = self.stand
        mika, misha = stand.session("mika"), stand.session("misha")
        self.assertEqual(stand.ctl("sessions", "logout", "mika").status, 0)
        self.assertEqual(stand.get("/api/me", cookie=mika).status, 401)
        self.assertEqual(stand.get("/api/me", cookie=misha).status, 200)
        self.assertEqual(stand.ctl("user", "disable", "misha").status, 0)
        self.assertEqual(stand.get("/api/me", cookie=misha).status, 401)

    def test_damaged_state_is_503_and_never_401_or_revision_0(self):
        stand = self.stand
        cookie = stand.session()
        self.assertEqual(stand.put(LEDGER, {"base": 0, "doc": ledger()}, cookie=cookie).status, 200)
        with open(os.path.join(stand.data_dir, "ledger", "current.json"), "wb") as handle:
            handle.write(b'{"rev":1,"doc":{"tx":[')
        self.assertRefused(stand.get(LEDGER, cookie=cookie), 503, "storage_damaged")
        self.assertRefused(stand.put(LEDGER, {"base": 0, "doc": ledger()}, cookie=cookie), 503, "storage_damaged")
        self.assertEqual(stand.get(PLAN, cookie=cookie).status, 200)
        with open(os.path.join(stand.data_dir, "auth", "users.json"), "wb") as handle:
            handle.write(b"{")
        for answer in (stand.get("/api/me", cookie=cookie),
                       stand.get(PLAN, cookie=cookie), stand.put(PLAN, {"base": 0, "doc": plan()}, cookie=cookie),
                       stand.get("/", cookie=cookie), stand.get("/api/nothing", cookie=cookie),
                       stand.post("/api/auth/login", {"login": "mika", "password": PASSWORD})):
            self.assertRefused(answer, 503, "auth_damaged")
        self.assertRefused(stand.get("/api/me"), 401, "unauthenticated")       # without a cookie nothing is in doubt
        self.assertEqual(stand.get("/login", cookie=cookie).status, 200)


class FaultTests(StandCase):
    tune = {"ledger_warn_bytes": 1024 * 1024}

    def test_a_fault_of_ours_is_a_500_with_a_request_id_and_not_a_word_more(self):
        stand = self.stand
        cookie = stand.session()
        for fault in (RuntimeError("SECRET-DETAIL"), OSError(errno.EIO, "SECRET-DETAIL")):
            with mock.patch.object(stand.stores["plan"], "read", side_effect=fault):
                answer = stand.get(PLAN, cookie=cookie)
            self.assertEqual(answer.status, 500)
            said = answer.json()
            self.assertEqual(sorted(said), ["error", "message", "requestId"])
            self.assertEqual((said["error"], said["message"]), ("internal", "Something broke on our side."))
            for header, value in FIXED.items():
                self.assertEqual(answer.header(header), value)
            noted = [line for line in stand.log_lines() if line.get("rid") == said["requestId"]]
            self.assertEqual([(line.get("event"), line.get("kind"), line.get("status")) for line in noted],
                             [("exception", type(fault).__name__, None), (None, None, 500)])
            self.assertRegex(noted[0]["at"], r"httpd\.py:\d+")
        self.assertNotIn("SECRET-DETAIL", stand.log_text())
        self.assertEqual(stand.get(PLAN, cookie=cookie).status, 200, "and the server lives")

    def test_a_large_document_is_saved_one_at_a_time_and_said_out_loud(self):
        stand = self.stand
        cookie = stand.session()
        big = ledger(21000)
        self.assertGreater(len(big), 1024 * 1024)
        self.assertEqual(stand.put(LEDGER, {"base": 0, "doc": big}, cookie=cookie).json(), {"rev": 1})
        self.assertEqual(stand.get(LEDGER, cookie=cookie).body.decode("utf-8"),
                         '{"rev":1,"doc":%s,"updatedAt":"2026-10-07T12:00:00.000Z"}' % big)
        noted = [line for line in stand.log_lines() if line.get("event") == "large-body"]
        self.assertEqual([(line["doc"], line["limit"]) for line in noted], [("ledger", 16 * 1024 * 1024)])
        self.assertGreater(noted[0]["bytes"], len(big))
        # While one large save holds the gate, the next waits its turn - and is told to come back when that is too long.
        self.assertTrue(stand.server.heavy.acquire(blocking=False), "the gate was given back")
        try:
            with mock.patch.object(httpd, "_HEAVY_WAIT", 0.05):
                busy = stand.put(LEDGER, {"base": 1, "doc": big}, cookie=cookie)
            self.assertRefused(busy, 503, "storage_busy")
            self.assertEqual(busy.header("Retry-After"), "2")
            self.assertEqual(stand.put(PLAN, {"base": 0, "doc": plan()}, cookie=cookie).status, 200, "a small one does not wait")
        finally:
            stand.server.heavy.release()
        # And only three large bodies are in memory at once: the fourth is not even read.
        held = [stand.server.large.acquire(blocking=False) for _slot in range(4)]
        self.assertEqual(held, [True, True, True, False])
        try:
            with mock.patch.object(httpd, "_HEAVY_WAIT", 0.05):
                self.assertRefused(stand.put(LEDGER, {"base": 1, "doc": big}, cookie=cookie), 503, "storage_busy")
        finally:
            for _slot in range(3):
                stand.server.large.release()
        self.assertEqual(stand.put(LEDGER, {"base": 1, "doc": big}, cookie=cookie).json(), {"rev": 2})
        self.assertTrue(all(stand.server.large.acquire(blocking=False) for _slot in range(3)), "every slot was given back")


class AddressTests(unittest.TestCase):
    def addresses(self, stand, **headers):
        stand.get("/robots.txt", headers=headers)
        return stand.log_lines()[-1]["addr"]

    def test_forwarded_for_is_believed_from_the_edge_only(self):
        with _harness.Stand() as stand:
            self.assertEqual(self.addresses(stand, **{"X-Forwarded-For": "203.0.113.9"}), "127.0.0.1")
        with _harness.Stand(env={"MONEY_TRUSTED_PROXIES": "127.0.0.0/8"}) as stand:
            self.assertEqual(self.addresses(stand, **{"X-Forwarded-For": "198.51.100.1, 203.0.113.9"}), "203.0.113.9")
            self.assertEqual(self.addresses(stand, **{"X-Forwarded-For": "not an address"}), "127.0.0.1")
            self.assertEqual(self.addresses(stand), "127.0.0.1")
            # /healthz is the container's own health check: a caller the edge spoke for gets no such door.
            self.assertEqual(stand.get("/healthz").status, 200)
            answer = stand.get("/healthz", headers={"X-Forwarded-For": "203.0.113.9"})
            self.assertEqual((answer.status, answer.header("Location")), (302, "/login"))
            self.assertEqual(stand.get("/healthz", cookie=stand.session(), headers={"X-Forwarded-For": "203.0.113.9"}).status, 404)
            # X-Forwarded-Proto and X-Forwarded-Host change nothing.
            answer = stand.get("/login", headers={"X-Forwarded-Proto": "https", "X-Forwarded-Host": "evil.example"})
            self.assertEqual(answer.status, 200)


# ---------------------------------------------------------------------------
# Threads, slots, deadlines
# ---------------------------------------------------------------------------

class LimitsTests(unittest.TestCase):
    def hold(self, stand, data=b""):
        """A connection that stays open, having sent ``data``."""
        connection = socket.create_connection(("127.0.0.1", stand.port), timeout=5)
        self.addCleanup(connection.close)
        if data:
            connection.sendall(data)
        return connection

    def half_a_sign_in(self, stand, forwarded=None):
        """The head of a sign-in whose body never comes: it holds a signed-out slot until its deadline."""
        lines = ["POST /api/auth/login HTTP/1.1", "Host: " + stand.host, "Origin: " + stand.origin,
                 "Content-Type: application/json", "Content-Length: 40"]
        if forwarded:
            lines.append("X-Forwarded-For: " + forwarded)
        return ("\r\n".join(lines) + "\r\n\r\n").encode("ascii")

    def test_a_body_that_misses_its_deadline_is_cut_without_an_answer(self):
        with _harness.Stand(tune={"auth_body_deadline": 0.3}) as stand:
            began = time.monotonic()
            answer = stand.raw(self.half_a_sign_in(stand) + b'{"login":', timeout=5)
            self.assertEqual(answer, b"")
            self.assertLess(time.monotonic() - began, 2.0)
            line = until(lambda: [entry for entry in stand.log_lines() if entry.get("path") == "/api/auth/login"])
            self.assertEqual([entry["status"] for entry in line], [408])
            # A body that trickles in is cut at the same moment: the deadline is for all of it.
            connection = self.hold(stand, self.half_a_sign_in(stand))
            began = time.monotonic()
            try:
                for _byte in range(20):
                    connection.sendall(b" ")
                    time.sleep(0.05)
            except OSError:
                pass
            connection.settimeout(3)
            try:
                self.assertEqual(connection.recv(100), b"")
            except ConnectionError:
                pass
            self.assertLess(time.monotonic() - began, 2.5)

    def test_strangers_work_within_their_slots_and_founders_do_not_wait_behind_them(self):
        with _harness.Stand(tune={"signed_out_slots": 2, "auth_body_deadline": 5.0}) as stand:
            cookie = stand.session()
            held = [self.hold(stand, self.half_a_sign_in(stand)) for _slot in range(2)]
            busy = until(lambda: (lambda a: a if a.status == 503 else None)(stand.get("/login")))
            self.assertIsNotNone(busy, "with both slots taken a stranger is turned away at once")
            self.assertEqual(busy.json()["error"], "busy")
            self.assertEqual(busy.header("Retry-After"), "1")
            self.assertEqual(stand.get("/api/me").status, 503)
            self.assertEqual(stand.get("/api/me", cookie=cookie).status, 200)
            self.assertEqual(stand.get("/", cookie=cookie).status, 200)
            self.assertEqual(stand.get("/healthz").status, 200, "the health check is not a stranger")
            for connection in held:
                connection.close()
            self.assertTrue(until(lambda: stand.get("/login").status == 200))

    def test_no_thread_free_is_a_bare_503(self):
        with _harness.Stand(tune={"max_connections": 3}) as stand:
            held = [self.hold(stand) for _thread in range(3)]
            refused = until(lambda: (lambda a: a if a.startswith(b"HTTP/1.1 503 ") else None)(
                stand.raw(b"", half_close=True)))
            self.assertIsNotNone(refused)
            self.assertTrue(refused.endswith(b"\r\n\r\n"), "no body")
            self.assertIn(b"Content-Length: 0\r\n", refused)
            for connection in held:
                connection.close()
            self.assertTrue(until(lambda: stand.raw(b"", half_close=True) == b"" and stand.get("/login").status == 200))
            self.assertTrue(until(lambda: [line for line in stand.log_lines() if line.get("event") == "overload"]))

    def test_twelve_connections_per_client_address(self):
        env = {"MONEY_TRUSTED_PROXIES": "127.0.0.0/8"}
        with _harness.Stand(env=env, tune={"max_connections_per_address": 2, "auth_body_deadline": 5.0}) as stand:
            held = [self.hold(stand, self.half_a_sign_in(stand, "203.0.113.7")) for _connection in range(2)]
            mine = {"X-Forwarded-For": "203.0.113.7"}
            third = until(lambda: (lambda a: a if a.status == 503 else None)(stand.get("/login", headers=mine)))
            self.assertIsNotNone(third)
            self.assertEqual(third.json()["error"], "too_many_connections")
            self.assertEqual(stand.get("/login", headers={"X-Forwarded-For": "203.0.113.8"}).status, 200)
            for connection in held:
                connection.close()
            self.assertTrue(until(lambda: stand.get("/login", headers=mine).status == 200))

    def test_stop_lets_a_request_finish_and_cuts_what_is_idle(self):
        stand = _harness.Stand(tune={"auth_body_deadline": 5.0})
        self.addCleanup(stand.stop)
        idle = self.hold(stand)
        body = json.dumps({"login": "mika", "password": "x" * 12}).encode("ascii")
        busy = self.hold(stand, self.half_a_sign_in(stand).replace(b"Content-Length: 40", b"Content-Length: %d" % len(body)))
        server = stand.server
        self.assertTrue(until(lambda: server.connections() == 2 and server.in_flight() == 1))
        began = time.monotonic()
        finisher = threading.Timer(0.3, lambda: busy.sendall(body))
        finisher.start()
        self.addCleanup(finisher.cancel)
        cut = server.stop(grace=5.0)
        self.assertEqual(cut, 0, "the request in flight was let to finish")
        self.assertLess(time.monotonic() - began, 3.0)
        busy.settimeout(3)
        self.assertTrue(busy.recv(4096).startswith(b"HTTP/1.1 401 "))
        idle.settimeout(3)
        self.assertEqual(idle.recv(100), b"")
        with self.assertRaises(OSError):
            socket.create_connection(("127.0.0.1", stand.port), timeout=1).close()


# ---------------------------------------------------------------------------
# The command line
# ---------------------------------------------------------------------------

class CtlTests(StandCase):
    def test_ping_and_selfcheck_go_through_the_stands_own_port(self):
        stand = self.stand
        self.assertEqual(stand.ctl("ping"), _harness.CtlResult(0, "ok\n", ""))
        cookie = stand.session()
        stand.put(LEDGER, {"base": 0, "doc": ledger(7, note="SECRET-NOTE")}, cookie=cookie)
        before = stand.get(LEDGER, cookie=cookie).body
        check = stand.ctl("selfcheck")
        self.assertEqual(check.status, 0, check.out + check.err)
        self.assertIn("Money self-check: stand dev, version dev, http://finance.localhost:%d" % stand.port, check.out)
        self.assertIn("  policy: enforced\n", check.out)
        self.assertRegex(check.out, r"  image: Python \d+\.\d+")
        self.assertNotIn("FAIL", check.out)
        self.assertRegex(check.out, r"self-check: OK - \d+ checks passed\n$")
        self.assertIn("the ledger is readable (revision 1,", check.out)
        self.assertIn("the cash plan is readable (revision 0,", check.out)
        self.assertEqual(stand.get(LEDGER, cookie=cookie).body, before, "a self-check writes nothing")
        self.assertEqual(stand.get(PLAN, cookie=cookie).body, b'{"rev":0,"doc":{},"updatedAt":null}')
        self.assertEqual([session.kind for session in stand.auth.sessions.list()], ["web"], "its own session is gone")
        self.assertNotIn("SECRET-NOTE", check.out + check.err)
        events = [entry["event"] for entry in stand.security_events()]
        self.assertIn("session-created", events)
        # With nobody listening, both say so and fail.
        stand.server.stop(grace=1.0)
        stand.server = None
        self.assertEqual(stand.ctl("ping").status, 1)
        check = stand.ctl("selfcheck")
        self.assertEqual(check.status, 1)
        self.assertIn("FAIL  the service answers on 127.0.0.1:%d" % stand.port, check.out)
        self.assertEqual([session.kind for session in stand.auth.sessions.list()], ["web"])

    def test_a_link_is_shown_to_a_terminal_and_to_nothing_else(self):
        stand = self.stand
        piped = stand.ctl("user", "invite", "mika")
        self.assertEqual((piped.status, piped.out), (2, ""))
        self.assertIn("not a terminal", piped.err)
        self.assertIsNone(stand.auth.users.get("mika").invite_expires, "refused before a link was issued")
        shown = stand.ctl("user", "invite", "mika", terminal=True)
        self.assertEqual(shown.status, 0, shown.err)
        self.assertRegex(shown.out, r"\nhttp://finance\.localhost:%d/set-password#t=[A-Za-z0-9_-]{20,}\n$" % stand.port)
        self.assertIn("until 2026-10-09T12:00:00Z", shown.out)
        printed = stand.ctl("user", "invite", "mika", "--print")
        self.assertEqual(printed.status, 0)
        old, new = shown.out.split("#t=")[1].strip(), printed.out.split("#t=")[1].strip()
        self.assertEqual(stand.post("/api/auth/setup", {"token": old, "password": PASSWORD}).status, 404,
                         "a newer link retires the one before it")
        self.assertEqual(stand.post("/api/auth/setup", {"token": new, "password": PASSWORD}).status, 200)
        unknown = stand.ctl("user", "invite", "nobody", "--print")
        self.assertEqual((unknown.status, unknown.out), (1, ""))
        self.assertIn("unknown_login", unknown.err)
        self.assertEqual([entry["event"] for entry in stand.security_events() if entry["event"].startswith("link-")],
                         ["link-issued", "link-issued", "link-refused", "link-used"])

    def test_print_is_for_a_dev_stand_only(self):
        directory = tempfile.mkdtemp(prefix="money-test-")
        self.addCleanup(shutil.rmtree, directory, True)
        for stand in ("prod", "test"):
            environ = {
                "MONEY_STAND": stand, "MONEY_PUBLIC_URL": "https://finance.example.se", "MONEY_FOUNDERS": _harness.FOUNDERS,
                "MONEY_DATA_DIR": directory, "MONEY_BIND": "0.0.0.0:8080", "MONEY_TRUSTED_PROXIES": "10.0.0.0/8",
            }
            out, err = io.StringIO(), io.StringIO()
            with mock.patch.object(hashlib, "scrypt", create=True):
                status = ctl.main(["user", "invite", "mika", "--print"], environ=environ, stdout=out, stderr=err)
            self.assertEqual((status, out.getvalue()), (2, ""), stand)
            self.assertIn("--print exists on a dev stand only", err.getvalue())
            self.assertEqual(os.listdir(directory), [], "nothing was written, not even the STAND marker")

    def test_users_and_sessions(self):
        stand = self.stand
        stand.set_password("mika")
        mika, misha = stand.session("mika"), stand.session("misha")
        listed = stand.ctl("user", "list")
        self.assertEqual(listed.status, 0)
        lines = listed.out.splitlines()
        self.assertEqual(lines[0].split()[:2], ["login", "name"])
        self.assertRegex(lines[1], r"^mika +Mika +yes +set 2026-10-07T12:00:00Z")
        self.assertRegex(lines[2], r"^misha +Misha +yes +not set")
        sessions = stand.ctl("sessions", "list")
        self.assertEqual(sessions.status, 0)
        self.assertIn("2 session(s)\n", sessions.out)
        for cookie in (mika, misha):
            self.assertNotIn(stand.token_of(cookie), sessions.out)
        self.assertEqual(stand.ctl("user", "disable", "misha").status, 0)
        self.assertRegex(stand.ctl("user", "list").out, r"misha +Misha +no: disabled")
        self.assertEqual(stand.get("/api/me", cookie=misha).status, 401)
        self.assertEqual(stand.ctl("user", "enable", "misha").status, 0)
        self.assertEqual(stand.ctl("sessions", "logout", "mika").out, "1 session(s) of mika closed\n")
        self.assertEqual(stand.ctl("sessions", "logout", "nobody").status, 1)
        stand.session("vanya")
        self.assertEqual(stand.ctl("sessions", "logout", "--all").out, "1 session(s) closed: everybody signs in again\n")
        self.assertEqual(stand.ctl("sessions", "logout").status, 2)
        self.assertEqual(stand.ctl("sessions", "logout", "mika", "--all").status, 2)
        self.assertEqual(stand.ctl("sessions", "list").out, "0 session(s)\n")

    def test_seed_empty_snapshots_restore_and_purge(self):
        stand = self.stand
        self.assertEqual(stand.ctl("empty"), _harness.CtlResult(0, "empty: both documents are at revision 0\n", ""))
        seeded = stand.ctl("seed", "ledger", "--fresh", stdin=ledger(30, note="SEEDED-NOTE"))
        self.assertEqual(seeded.status, 0, seeded.err)
        self.assertRegex(seeded.out, r"^seeded the ledger: revision 1, [\d.]+ kB\n$")
        self.assertIn("WARNING: seed is writing over the ledger of Money's DEV stand (now at revision 0)", seeded.err)
        self.assertNotIn("SEEDED-NOTE", seeded.out + seeded.err)
        self.assertEqual(stand.ctl("empty").status, 1)
        cookie = stand.session()
        self.assertEqual(stand.get(LEDGER, cookie=cookie).body.decode("utf-8"),
                         '{"rev":1,"doc":%s,"updatedAt":"2026-10-07T12:00:00.000Z"}' % ledger(30, note="SEEDED-NOTE"))
        # Without --fresh a seed fills an empty document only.
        again = stand.ctl("seed", "ledger", stdin=ledger(2))
        self.assertEqual((again.status, again.out), (1, ""))
        self.assertIn("revision 1 already", again.err)
        self.assertNotIn("WARNING", again.err)
        self.assertEqual(stand.ctl("seed", "plan", stdin=plan(3)).status, 0)
        # What a door refuses, a seed cannot put in either; a saved answer is taken apart.
        self.assertEqual(stand.ctl("seed", "ledger", "--fresh", stdin=plan()).status, 1)
        self.assertEqual(stand.ctl("seed", "ledger", "--fresh", stdin="not json").status, 1)
        self.assertEqual(stand.ctl("seed", "ledger", "--fresh", stdin=b"\xff\xfe").status, 1)
        stand.clock.tick(days=1)
        envelope = '{"rev":7,"doc":%s,"updatedAt":"2026-01-01T00:00:00.000Z"}' % ledger(4)
        self.assertEqual(stand.ctl("seed", "ledger", "--fresh", stdin=envelope).status, 0)
        self.assertEqual(stand.get(LEDGER, cookie=cookie).body.decode("utf-8"),
                         '{"rev":2,"doc":%s,"updatedAt":"2026-10-08T12:00:00.000Z"}' % ledger(4))
        self.assertEqual([session.kind for session in stand.auth.sessions.list()], ["web"])
        self.assertEqual([(entry["doc"], entry["rev"]) for entry in stand.security_events() if entry["event"] == "seed"],
                         [("ledger", 1), ("plan", 1), ("ledger", 2)])

        # The second day's seed kept the first day's ledger as a day copy.
        listed = stand.ctl("snapshots", "ledger")
        self.assertEqual(listed.status, 0)
        snapshot = "day-2026-10-08-rev000001.json.gz"
        self.assertIn(snapshot, listed.out)
        self.assertIn("1 snapshot(s) of the ledger, newest first\n", listed.out)
        self.assertEqual(stand.ctl("snapshots", "plan").out, "0 snapshot(s) of the cash plan, newest first\n")
        self.assertEqual(stand.ctl("snapshots", "other").status, 2)

        refused = stand.ctl("restore", "ledger", snapshot, stdin="prod\n")
        self.assertEqual((refused.status, refused.out), (2, ""))
        self.assertIn("Type the stand's name to go on:", refused.err)
        self.assertTrue(stand.get(LEDGER, cookie=cookie).body.startswith(b'{"rev":2,'))
        self.assertEqual(stand.ctl("restore", "ledger", "day-2026-01-01-rev000009.json.gz", stdin="dev\n").status, 1)
        restored = stand.ctl("restore", "ledger", snapshot, stdin="dev\n")
        self.assertEqual(restored.status, 0, restored.err)
        self.assertIn("it is revision 3 now (the snapshot was taken at revision 1)", restored.out)
        self.assertNotIn("SEEDED-NOTE", restored.out + restored.err)
        body = stand.get(LEDGER, cookie=cookie).body.decode("utf-8")
        self.assertTrue(body.startswith('{"rev":3,"doc":%s,' % ledger(30, note="SEEDED-NOTE")))
        stale = stand.put(LEDGER, {"base": 2, "doc": ledger(1)}, cookie=cookie)
        self.assertEqual((stale.status, stale.json()["rev"]), (409, 3), "an open page is told to reload")

        self.assertEqual(stand.ctl("purge-snapshots").status, 2)
        self.assertEqual(stand.ctl("purge-snapshots", "--older-than-days", "-1").status, 2)
        self.assertEqual(stand.ctl("purge-snapshots", "--older-than-days", "2").out,
                         "ledger: 0 snapshot(s) older than 2 day(s) purged\nplan: 0 snapshot(s) older than 2 day(s) purged\n")
        self.assertRegex(stand.ctl("purge-snapshots", "--older-than-days", "0").out, r"^ledger: 2 snapshot\(s\)")
        self.assertIn("0 snapshot(s) of the ledger", stand.ctl("snapshots", "ledger").out)

    def test_seed_and_purge_exist_on_made_up_data_only(self):
        directory = tempfile.mkdtemp(prefix="money-test-")
        self.addCleanup(shutil.rmtree, directory, True)
        environ = {
            "MONEY_STAND": "prod", "MONEY_PUBLIC_URL": "https://finance.example.se", "MONEY_FOUNDERS": _harness.FOUNDERS,
            "MONEY_DATA_DIR": directory, "MONEY_BIND": "0.0.0.0:8080", "MONEY_TRUSTED_PROXIES": "10.0.0.0/8",
        }
        for command in (["seed", "ledger", "--fresh"], ["seed", "plan"], ["purge-snapshots", "--older-than-days", "0"]):
            out, err = io.StringIO(), io.StringIO()
            with mock.patch.object(hashlib, "scrypt", create=True):
                status = ctl.main(command, environ=environ, stdin=io.StringIO('{"tx":[]}'), stdout=out, stderr=err)
            self.assertEqual((status, out.getvalue()), (2, ""), command)
            self.assertIn("test and dev only. This stand is prod.", err.getvalue())
        self.assertEqual(os.listdir(directory), [], "nothing was read or written")

    def test_doctor_and_verify_count_and_never_show(self):
        stand = self.stand
        cookie = stand.session()
        stand.put(LEDGER, {"base": 0, "doc": ledger(12, note="SECRET-NOTE")}, cookie=cookie)
        stand.clock.tick(days=1)
        stand.put(LEDGER, {"base": 1, "doc": ledger(13, note="SECRET-NOTE")}, cookie=cookie)
        for command in (("doctor",), ("verify", stand.data_dir)):
            report = stand.ctl(*command)
            self.assertEqual(report.status, 0, report.out + report.err)
            self.assertIn("  STAND marker: dev\n", report.out)
            self.assertRegex(report.out, r"  ledger: revision 2, 13 rows, [\d.]+ k?B, saved 2026-10-08T12:00:00.000Z; "
                                         r"snapshots: 1 \(day 1, shrink 0, restore 0; \d+ B; newest day-2026-10-08-rev000001")
            self.assertIn("  plan: never saved (revision 0); snapshots: 0", report.out)
            self.assertIn("  accounts: 3 (with a password: 0, disabled: 0, pending links: 0)\n", report.out)
            self.assertRegex(report.out, r"%s: OK - nothing is wrong\n$" % command[0])
            self.assertNotIn("SECRET-NOTE", report.out + report.err)
            self.assertNotIn(stand.token_of(cookie), report.out)
        self.assertIn("read back: 1, bad: 0", stand.ctl("verify", stand.data_dir).out)
        with open(os.path.join(stand.data_dir, "ledger", "current.json"), "r+b") as handle:
            handle.truncate(40)
        sick = stand.ctl("doctor")
        self.assertEqual(sick.status, 1)
        self.assertIn("  ledger: DAMAGED; snapshots: 1", sick.out)
        self.assertIn("ctl restore ledger day-2026-10-08-rev000001.json.gz", sick.out)
        self.assertIn("doctor: 1 problem(s)\n", sick.out)
        self.assertEqual(stand.ctl("verify", stand.data_dir).status, 1)
        self.assertEqual(stand.ctl("empty").status, 1, "damaged is not empty")
        missing = stand.ctl("verify", os.path.join(stand.data_dir, "nowhere"))
        self.assertEqual(missing.status, 1)

    def test_a_wrong_command_line_and_a_wrong_setting_are_status_2(self):
        stand = self.stand
        for command in ((), ("nothing",), ("user",), ("user", "invite"), ("seed",), ("seed", "ledger", "--fre"),
                        ("restore", "ledger"), ("verify",)):
            answer = stand.ctl(*command)
            self.assertEqual((answer.status, answer.out), (2, ""), command)
            self.assertIn("usage: python -m moneyd.ctl", answer.err)
        self.assertEqual(stand.ctl("--help").status, 0)
        out, err = io.StringIO(), io.StringIO()
        self.assertEqual(ctl.main(["empty"], environ={"MONEY_STAND": "nowhere"}, stdout=out, stderr=err), 2)
        self.assertIn("refused: MONEY_STAND must be prod, test or dev", err.getvalue())
        # A directory that is another stand's: refused before anything is read.
        with open(os.path.join(stand.data_dir, "STAND"), "w") as handle:
            handle.write("prod\n")
        for command in (("empty",), ("user", "list"), ("sessions", "logout", "--all"), ("selfcheck",)):
            answer = stand.ctl(*command)
            self.assertEqual(answer.status, 2, command)
            self.assertIn("belongs to the 'prod' stand", answer.err)


# ---------------------------------------------------------------------------
# The boot, as a process
# ---------------------------------------------------------------------------

class BootTests(unittest.TestCase):
    def boot(self, environ):
        out, err = io.StringIO(), io.StringIO()
        return boot.main(environ=environ, stdout=out, stderr=err), out.getvalue(), err.getvalue()

    def test_what_stops_the_boot(self):
        directory = tempfile.mkdtemp(prefix="money-test-")
        self.addCleanup(shutil.rmtree, directory, True)
        port = _harness.free_port()
        good = _harness.dev_environ(directory, port)
        cases = {
            "MONEY_STAND must be": dict(good, MONEY_STAND="staging"),
            "must end in .localhost": dict(good, MONEY_PUBLIC_URL="http://finance.example.se:%d" % port),
            "must bind a loopback address": dict(good, MONEY_BIND="0.0.0.0:%d" % port),
            "must start with 'finance.'": dict(good, MONEY_PUBLIC_URL="http://money.localhost:%d" % port),
            "MONEY_CSP must be enforce or report-only": dict(good, MONEY_CSP="off"),
            "does not exist": dict(good, MONEY_DATA_DIR=os.path.join(directory, "missing")),
            "cannot be read": dict(good, MONEY_WEB_DIR=os.path.join(directory, "no-page-here")),
        }
        for words, environ in cases.items():
            status, out, err = self.boot(environ)
            self.assertEqual(status, 2, words)
            self.assertIn("moneyd: not starting: ", err)
            self.assertIn(words, err)
            self.assertIn('"event":"refused"', out)
        self.assertEqual(os.listdir(directory), [], "a refused boot has written nothing")

        with open(os.path.join(directory, "STAND"), "w") as handle:
            handle.write("prod\n")
        self.assertIn("belongs to the 'prod' stand", self.boot(good)[2])
        os.unlink(os.path.join(directory, "STAND"))
        with open(os.path.join(directory, "db.json"), "w") as handle:
            handle.write("{}")
        status, _out, err = self.boot(good)
        self.assertEqual(status, 2)
        self.assertIn("laptop tool's files (db.json)", err)
        os.unlink(os.path.join(directory, "db.json"))

        os.makedirs(os.path.join(directory, "auth"))
        with open(os.path.join(directory, "auth", "users.json"), "w") as handle:
            handle.write("{")
        with open(os.path.join(directory, "STAND"), "w") as handle:
            handle.write("dev\n")
        status, _out, err = self.boot(good)
        self.assertEqual(status, 2)
        self.assertIn("auth_damaged", err)

    def test_a_port_that_is_taken(self):
        with _harness.Stand() as stand:
            directory = tempfile.mkdtemp(prefix="money-test-")
            self.addCleanup(shutil.rmtree, directory, True)
            status, _out, err = self.boot(_harness.dev_environ(directory, stand.port))
            self.assertEqual(status, 2)
            self.assertIn("cannot listen on 127.0.0.1 port %d" % stand.port, err)

    def test_the_real_thing_from_boot_to_sigterm(self):
        stand = _harness.ProcessStand()
        self.addCleanup(stand.stop)
        self.assertEqual(stand.get("/login").status, 200)
        self.assertEqual(read(os.path.join(stand.data_dir, "STAND")), b"dev\n")

        self.assertEqual(stand.ctl("ping").stdout, "ok\n")
        self.assertEqual(stand.ctl("empty").returncode, 0)
        seeded = stand.ctl("seed", "ledger", "--fresh", input=ledger(25))
        self.assertEqual(seeded.returncode, 0, seeded.stderr)
        self.assertEqual(stand.ctl("seed", "plan", "--fresh", input=plan(4)).returncode, 0)
        self.assertEqual(stand.ctl("empty").returncode, 1)

        piped = stand.ctl("user", "invite", "mika")
        self.assertEqual((piped.returncode, piped.stdout), (2, ""))
        invited = stand.ctl("user", "invite", "mika", "--print")
        self.assertEqual(invited.returncode, 0, invited.stderr)
        token = re.search(r"http://finance\.localhost:%d/set-password#t=(\S+)" % stand.port, invited.stdout).group(1)
        setup = stand.post("/api/auth/setup", {"token": token, "password": PASSWORD})
        self.assertEqual(setup.status, 200, setup.body)
        signed = stand.post("/api/auth/login", {"login": "mika", "password": PASSWORD})
        self.assertEqual(signed.status, 200, signed.body)
        cookie = signed.cookie("money-dev")
        self.assertEqual(stand.get("/api/me", cookie=cookie).json()["firstName"], "Mika")
        self.assertEqual(stand.get("/", cookie=cookie).body, read(INDEX))
        self.assertTrue(stand.get(LEDGER, cookie=cookie).body.startswith(b'{"rev":1,"doc":%s,' % ledger(25).encode("utf-8")))
        self.assertEqual(stand.put(LEDGER, {"base": 1, "doc": ledger(26)}, cookie=cookie).json(), {"rev": 2})

        check = stand.ctl("selfcheck")
        self.assertEqual(check.returncode, 0, check.stdout + check.stderr)
        self.assertRegex(check.stdout, r"self-check: OK - \d+ checks passed\n$")
        self.assertEqual(stand.ctl("doctor").returncode, 0)
        self.assertEqual(stand.ctl("verify", stand.data_dir).returncode, 0)

        closed = stand.ctl("sessions", "logout", "mika")
        self.assertEqual(closed.returncode, 0, closed.stderr)
        self.assertEqual(stand.get(LEDGER, cookie=cookie).status, 401, "closed from the server, shut at the next request")

        self.assertEqual(stand.stop(), 0, "SIGTERM ends it with status 0")
        said = stand.output()
        lines = [json.loads(line) for line in said.splitlines()]
        self.assertEqual(lines[0]["event"], "boot")
        self.assertEqual((lines[0]["stand"], lines[0]["csp"], lines[0]["inlineScripts"]), ("dev", "enforce", 1))
        self.assertEqual(lines[-1], dict(lines[-1], event="stopped", cut=0))
        for secret in (PASSWORD, token, cookie.split("=", 1)[1]):
            self.assertNotIn(secret, said)
        with self.assertRaises(OSError):
            stand.get("/login", timeout=1.0)


if __name__ == "__main__":
    unittest.main()
