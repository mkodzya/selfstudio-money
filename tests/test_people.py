"""Who may do what: the owner, an editor and a reader; the owner's doors; one's own password.

    python3 -m unittest tests.test_people -v

Every test is one rule of docs/api.md ("Who may do what", the four doors under /api/people,
POST /api/auth/password) or of docs/security.md ("People and what each may do"), and its name
says the rule. The server is the real one, in this process (``tests/_harness.py``).

What the doors refuse before they are reached - a foreign origin, a body that is no JSON, a
length over the limit - is held for every door at once in ``test_http.py`` and
``test_routes_doc.py``; this file is about what the doors themselves decide.
"""
from tests import _safety  # noqa: F401  - first: no test runs beside a ledger

import hashlib
import json
import os
import unittest
from typing import Any, Dict, List, Optional

from tests import _harness
from tests._harness import PASSWORD, ledger, plan

from moneyd import auth, store

ME = "/api/me"
LEDGER = "/api/founder/money"
PLAN = "/api/founder/money/cash"
LOGIN = "/api/auth/login"
SETUP = "/api/auth/setup"
PASSWORD_DOOR = "/api/auth/password"
PEOPLE = "/api/people"
UPDATE = "/api/people/update"
LINK = "/api/people/link"
#: A second password the rules accept.
NEW_PASSWORD = "another horse battery staple"
EMPTY = {"rev": 0, "doc": {}, "updatedAt": None}


def sha256(text: str) -> str:
    return hashlib.sha256(text.encode("ascii")).hexdigest()


def accounts(stand: Any) -> Dict[str, Any]:
    """``users.json`` as it lies on the disk."""
    with open(os.path.join(stand.data_dir, "auth", "users.json")) as handle:
        return json.load(handle)


class Case(unittest.TestCase):
    """A dev stand whose owner, Mika, has a password and is signed in."""

    def setUp(self):
        self.stand = _harness.Stand()
        self.addCleanup(self.stand.stop)
        self.stand.set_password("mika")
        self.owner = self.stand.session("mika")

    def assertRefused(self, answer: Any, status: int, code: str) -> Dict[str, Any]:
        self.assertEqual((answer.status, answer.json().get("error")), (status, code), answer.body[:200])
        self.assertEqual(answer.header("Cache-Control"), "no-store")
        return answer.json()

    def people(self, cookie: Optional[str] = None) -> Dict[str, Dict[str, Any]]:
        answer = self.stand.get(PEOPLE, cookie=cookie or self.owner)
        self.assertEqual(answer.status, 200, answer.body[:200])
        return {person["login"]: person for person in answer.json()["people"]}

    def events(self, name: str) -> List[Dict[str, Any]]:
        return [entry for entry in self.stand.security_events() if entry.get("event") == name]

    def link_for(self, login: str) -> str:
        """A one-time link issued through the owner's door; the token that follows ``#t=``."""
        answer = self.stand.post(LINK, {"login": login, "password": PASSWORD}, cookie=self.owner)
        self.assertEqual(answer.status, 200, answer.body[:200])
        return answer.json()["link"].split("#t=", 1)[1]

    def sign_in_through_a_link(self, login: str) -> str:
        """The person opens their link, chooses a password and is signed in: their cookie."""
        answer = self.stand.post(SETUP, {"token": self.link_for(login), "password": PASSWORD})
        self.assertEqual(answer.status, 200, answer.body[:200])
        return answer.cookie(self.stand.settings.cookie_name)


# ---------------------------------------------------------------------------
# The three roles
# ---------------------------------------------------------------------------

class RolesTests(Case):
    def test_the_first_login_of_money_founders_is_the_owner_and_everybody_else_only_looks(self):
        stand = self.stand
        self.assertEqual(stand.settings.owner, "mika")
        told = {login: stand.get(ME, cookie=stand.session(login)).json() for login in ("mika", "misha", "vanya")}
        self.assertEqual({login: (me["role"], me["canWrite"], me["canManage"]) for login, me in told.items()},
                         {"mika": ("owner", True, True), "misha": ("reader", False, False),
                          "vanya": ("reader", False, False)})

    def test_a_reader_is_sent_both_documents_and_saves_neither(self):
        stand = self.stand
        self.assertEqual(stand.put(LEDGER, {"base": 0, "doc": ledger(3)}, cookie=self.owner).json(), {"rev": 1})
        self.assertEqual(stand.put(PLAN, {"base": 0, "doc": plan(2)}, cookie=self.owner).json(), {"rev": 1})
        reader = stand.session("misha")
        for path, text in ((LEDGER, ledger(5)), (PLAN, plan(4))):
            with self.subTest(path=path):
                before = stand.get(path, cookie=reader)
                self.assertEqual((before.status, before.json()["rev"]), (200, 1))
                for base in (0, 1, 7):
                    self.assertRefused(stand.put(path, {"base": base, "doc": text}, cookie=reader), 403, "read_only")
                self.assertEqual(stand.get(path, cookie=self.owner).body, before.body, "nothing was written")

    def test_a_readers_save_is_turned_away_before_a_byte_of_its_body_is_read(self):
        stand = self.stand
        reader = stand.session("misha")
        head = ("PUT %s HTTP/1.1\r\nHost: %s\r\nOrigin: %s\r\nCookie: %s\r\nContent-Type: application/json\r\n"
                "Content-Length: 9000000\r\n\r\n" % (LEDGER, stand.host, stand.origin, reader)).encode("ascii")
        answer = stand.raw(head, half_close=True)       # the head and nothing else: the body never comes
        self.assertTrue(answer.startswith(b"HTTP/1.1 403 "), answer[:80])
        self.assertIn(b'"error":"read_only"', answer)

    def test_a_reader_cannot_save_by_any_other_method_either(self):
        stand = self.stand
        reader = stand.session("misha")
        for method in ("POST", "PATCH", "DELETE"):
            with self.subTest(method=method):
                answer = stand.request(method, LEDGER, {"base": 0, "doc": ledger(2)}, cookie=reader)
                self.assertEqual(answer.status, 405)
        self.assertEqual(stand.get(LEDGER, cookie=reader).json(), EMPTY)

    def test_an_editor_saves_and_manages_nobody(self):
        stand = self.stand
        self.assertEqual(stand.post(UPDATE, {"login": "vanya", "role": "editor"}, cookie=self.owner).status, 200)
        editor = stand.session("vanya")
        me = stand.get(ME, cookie=editor).json()
        self.assertEqual((me["role"], me["canWrite"], me["canManage"]), ("editor", True, False))
        self.assertEqual(stand.put(LEDGER, {"base": 0, "doc": ledger(3)}, cookie=editor).json(), {"rev": 1})
        self.assertRefused(stand.get(PEOPLE, cookie=editor), 403, "not_owner")
        self.assertRefused(stand.post(UPDATE, {"login": "vanya", "role": "reader"}, cookie=editor), 403, "not_owner")

    def test_a_role_holds_from_the_next_request_of_a_page_that_is_already_open(self):
        stand = self.stand
        tab = stand.session("misha")                    # Misha's open page: one session, never signed in again
        self.assertRefused(stand.put(LEDGER, {"base": 0, "doc": ledger(2)}, cookie=tab), 403, "read_only")
        stand.post(UPDATE, {"login": "misha", "role": "editor"}, cookie=self.owner)
        self.assertEqual(stand.put(LEDGER, {"base": 0, "doc": ledger(2)}, cookie=tab).json(), {"rev": 1})
        stand.post(UPDATE, {"login": "misha", "role": "reader"}, cookie=self.owner)
        self.assertRefused(stand.put(LEDGER, {"base": 1, "doc": ledger(3)}, cookie=tab), 403, "read_only")
        self.assertEqual(stand.get(ME, cookie=tab).json()["role"], "reader")
        self.assertEqual([(entry["login"], entry["role"], entry["by"]) for entry in self.events("role-changed")],
                         [("misha", "editor", "mika"), ("misha", "reader", "mika")])

    def test_the_owners_doors_answer_the_owner_alone(self):
        stand = self.stand
        stand.post(UPDATE, {"login": "vanya", "role": "editor"}, cookie=self.owner)
        doors = (("GET", PEOPLE, None), ("POST", PEOPLE, {"login": "anna", "name": "Anna"}),
                 ("POST", UPDATE, {"login": "misha", "role": "editor"}),
                 ("POST", LINK, {"login": "misha", "password": PASSWORD}))
        for login in ("misha", "vanya"):
            cookie = stand.session(login)
            for method, path, body in doors:
                with self.subTest(login=login, door="%s %s" % (method, path)):
                    self.assertRefused(stand.request(method, path, body, cookie=cookie), 403, "not_owner")
        self.assertEqual(sorted(self.people()), ["mika", "misha", "vanya"])
        self.assertEqual(self.people()["misha"]["role"], "reader")
        self.assertIsNone(self.people()["misha"]["linkExpires"])

    def test_the_data_page_shows_a_reader_the_downloads_and_nothing_that_changes_or_tells(self):
        stand = self.stand
        stand.post(UPDATE, {"login": "vanya", "role": "editor"}, cookie=self.owner)
        pages = {login: stand.get("/data", cookie=stand.session(login)).text for login in ("mika", "misha", "vanya")}
        for login, state in (("mika", "owner"), ("vanya", "editor"), ("misha", "reader")):
            self.assertIn('<body data-page="data" data-state="%s">' % state, pages[login])
            self.assertIn('data-download="ledger"', pages[login])
        # What is not for somebody is sent with `hidden`: the page is right without its stylesheet.
        self.assertIn('<p class="upload" data-when="owner editor" hidden>', pages["misha"])
        self.assertNotIn('<p class="upload" data-when="owner editor" hidden>', pages["vanya"])
        self.assertIn('<section data-when="owner" hidden>', pages["misha"])
        self.assertIn('<section data-when="owner" hidden>', pages["vanya"])
        self.assertNotIn('<section data-when="owner" hidden>', pages["mika"])
        # The journal names everybody's sign-ins: its entries are in the owner's markup alone.
        self.assertIn("role-changed", pages["mika"].split('data-entries="', 1)[1].split('"', 1)[0])
        for login in ("misha", "vanya"):
            self.assertIn('data-entries="[]"', pages[login])
            self.assertNotIn("role-changed", pages[login])

    def test_ctls_own_session_is_one_that_may_save(self):
        from moneyd import ctl
        stand = self.stand
        self.assertEqual(ctl._usable_login(stand), "mika")
        stand.auth.update_person("vanya", by="mika", role="editor")
        stand.auth.set_disabled("mika", True)
        self.assertEqual(ctl._usable_login(stand), "vanya", "the owner is shut out: the next who may save")
        stand.auth.set_disabled("vanya", True)
        self.assertEqual(ctl._usable_login(stand), "misha", "nobody may save: the first who may sign in")


# ---------------------------------------------------------------------------
# The owner's doors
# ---------------------------------------------------------------------------

class PeopleTests(Case):
    def test_the_list_is_everybody_who_can_be_signed_in_and_never_a_hash_a_token_or_a_link(self):
        stand = self.stand
        token = self.link_for("misha")
        stand.clock.tick(minutes=7)
        stand.get(ME, cookie=self.owner)                # a use of the owner's sign-in, noted
        answer = stand.get(PEOPLE, cookie=self.owner)
        listed = answer.json()
        self.assertEqual(sorted(listed), ["max", "people"])
        self.assertEqual(listed["max"], auth.PEOPLE_MAX)
        self.assertEqual([person["login"] for person in listed["people"]], ["mika", "misha", "vanya"])
        mika, misha, vanya = listed["people"]
        self.assertEqual(sorted(mika), ["added", "disabled", "hasPassword", "lastSeen", "linkExpires", "login", "me",
                                        "name", "passwordSetAt", "role"])
        self.assertEqual((mika["name"], mika["role"], mika["me"], mika["hasPassword"], mika["added"], mika["disabled"]),
                         ("Mika", "owner", True, True, False, False))
        self.assertEqual(mika["lastSeen"], "2026-10-07T12:07:00Z")
        self.assertEqual((misha["role"], misha["me"], misha["hasPassword"], misha["lastSeen"]), ("reader", False, False, None))
        self.assertEqual(misha["linkExpires"], "2026-10-09T12:00:00Z", "48 hours from the moment it was issued")
        self.assertEqual((vanya["linkExpires"], vanya["passwordSetAt"]), (None, None))
        stored = accounts(stand)["users"]
        for secret in (token, sha256(token), stored["mika"]["hash"], stand.token_of(self.owner)):
            self.assertNotIn(secret, answer.text)

    def test_a_person_the_owner_adds_only_looks_and_has_no_password_until_their_link(self):
        stand = self.stand
        added = stand.post(PEOPLE, {"login": " Anna ", "name": "  Анна  "}, cookie=self.owner)
        self.assertEqual(added.status, 200, added.body[:200])
        anna = {person["login"]: person for person in added.json()["people"]}["anna"]
        self.assertEqual((anna["name"], anna["role"], anna["hasPassword"], anna["added"], anna["disabled"]),
                         ("Анна", "reader", False, True, False))
        self.assertEqual([person["login"] for person in added.json()["people"]], ["mika", "misha", "vanya", "anna"])
        self.assertEqual([(entry["login"], entry["by"]) for entry in self.events("user-added")], [("anna", "mika")])
        self.assertRefused(stand.post(LOGIN, {"login": "anna", "password": PASSWORD}), 401, "invalid_credentials")

        cookie = self.sign_in_through_a_link("anna")
        me = stand.get(ME, cookie=cookie).json()
        self.assertEqual((me["id"], me["firstName"], me["role"], me["canWrite"]), ("anna", "Анна", "reader", False))
        self.assertRefused(stand.put(LEDGER, {"base": 0, "doc": ledger(2)}, cookie=cookie), 403, "read_only")
        self.assertEqual(stand.post(LOGIN, {"login": "anna", "password": PASSWORD}).status, 200)

    def test_an_added_person_is_still_there_after_a_restart(self):
        stand = self.stand
        stand.post(PEOPLE, {"login": "anna", "name": "Anna"}, cookie=self.owner)
        again = auth.Auth(stand.settings, stand.clock)          # what a new process reads off the disk
        again.boot()
        self.assertEqual([(user.login, user.first_name, user.listed, user.added, user.role) for user in again.users.list()],
                         [("mika", "Mika", True, False, "owner"), ("misha", "Misha", True, False, "reader"),
                          ("vanya", "Vanya", True, False, "reader"), ("anna", "Anna", True, True, "reader")])

    def test_what_cannot_be_a_login_or_a_name_is_refused_and_nobody_is_added(self):
        stand = self.stand
        bad = (({"login": "Anna Maria", "name": "Anna"}, "login"), ({"login": "1anna", "name": "Anna"}, "login"),
               ({"login": "a" * 33, "name": "Anna"}, "login"), ({"login": "", "name": "Anna"}, "login"),
               ({"name": "Anna"}, "login"), ({"login": 7, "name": "Anna"}, "login"),
               ({"login": "../etc", "name": "Anna"}, "login"), ({"login": "анна", "name": "Anna"}, "login"),
               ({"login": "anna"}, "name"), ({"login": "anna", "name": ""}, "name"),
               ({"login": "anna", "name": "   "}, "name"), ({"login": "anna", "name": "A" * 41}, "name"),
               ({"login": "anna", "name": "An\nna"}, "name"), ({"login": "anna", "name": ["Anna"]}, "name"))
        for body, reason in bad:
            with self.subTest(body=body):
                refusal = self.assertRefused(stand.post(PEOPLE, body, cookie=self.owner), 400, "bad_person")
                self.assertEqual(refusal["reason"], reason)
        self.assertEqual(sorted(self.people()), ["mika", "misha", "vanya"])
        self.assertEqual(self.events("user-added"), [])

    def test_a_login_is_never_handed_to_a_second_person(self):
        stand = self.stand
        self.assertEqual(stand.post(PEOPLE, {"login": "anna", "name": "Anna"}, cookie=self.owner).status, 200)
        for login in ("anna", "misha", "mika", "ANNA"):
            with self.subTest(login=login):
                self.assertRefused(stand.post(PEOPLE, {"login": login, "name": "Another"}, cookie=self.owner),
                                   409, "login_taken")
        self.assertEqual(self.people()["anna"]["name"], "Anna")

    def test_a_stand_holds_twenty_accounts_and_not_one_more(self):
        stand = self.stand
        for number in range(auth.PEOPLE_MAX - 3):
            self.assertEqual(stand.post(PEOPLE, {"login": "p%d" % number, "name": "P"}, cookie=self.owner).status, 200)
        self.assertRefused(stand.post(PEOPLE, {"login": "last", "name": "Last"}, cookie=self.owner), 409, "too_many_people")
        self.assertEqual(len(self.people()), auth.PEOPLE_MAX)

    def test_a_new_name_is_what_the_person_is_called_from_then_on(self):
        stand = self.stand
        tab = stand.session("misha")
        renamed = stand.post(UPDATE, {"login": "misha", "name": " Миша "}, cookie=self.owner)
        self.assertEqual({person["login"]: person["name"] for person in renamed.json()["people"]}["misha"], "Миша")
        self.assertEqual(stand.get(ME, cookie=tab).json()["firstName"], "Миша")
        self.assertEqual([(entry["login"], entry["by"]) for entry in self.events("user-renamed")], [("misha", "mika")])
        # The owner's own name is the owner's to change as well; the role and the switch are not.
        self.assertEqual(stand.post(UPDATE, {"login": "mika", "name": "Мика"}, cookie=self.owner).status, 200)
        self.assertEqual(stand.get(ME, cookie=self.owner).json()["firstName"], "Мика")

    def test_what_an_update_cannot_take_changes_nothing(self):
        stand = self.stand
        bad = (({"login": "misha"}, 400, "bad_person", "nothing"), ({"login": "misha", "role": "owner"}, 400, "bad_person", "role"),
               ({"login": "misha", "role": "admin"}, 400, "bad_person", "role"), ({"login": "misha", "role": True}, 400, "bad_person", "role"),
               ({"login": "misha", "name": ""}, 400, "bad_person", "name"), ({"login": "misha", "name": 5}, 400, "bad_person", "name"),
               ({"login": "misha", "disabled": "yes"}, 400, "bad_person", "nothing"),
               ({"login": "nobody", "name": "N"}, 404, "unknown_login", None), ({"login": "nobody", "disabled": True}, 404, "unknown_login", None),
               ({"login": 5, "role": "editor"}, 404, "unknown_login", None), ({"name": "N"}, 404, "unknown_login", None))
        for body, status, code, reason in bad:
            with self.subTest(body=body):
                refusal = self.assertRefused(stand.post(UPDATE, body, cookie=self.owner), status, code)
                self.assertEqual(refusal.get("reason"), reason)
        misha = self.people()["misha"]
        self.assertEqual((misha["name"], misha["role"], misha["disabled"]), ("Misha", "reader", False))

    def test_the_owners_own_sign_in_is_not_changed_from_the_page(self):
        stand = self.stand
        for body in ({"login": "mika", "role": "reader"}, {"login": "mika", "role": "editor"},
                     {"login": "mika", "disabled": True}, {"login": "mika", "disabled": False},
                     {"login": "mika", "name": "X", "disabled": True}):
            with self.subTest(body=body):
                self.assertRefused(stand.post(UPDATE, body, cookie=self.owner), 409, "owner_fixed")
        self.assertRefused(stand.post(LINK, {"login": "mika", "password": PASSWORD}, cookie=self.owner), 409, "owner_fixed")
        mika = self.people()["mika"]
        self.assertEqual((mika["name"], mika["role"], mika["disabled"], mika["linkExpires"]), ("Mika", "owner", False, None))
        self.assertEqual(stand.put(LEDGER, {"base": 0, "doc": ledger(2)}, cookie=self.owner).json(), {"rev": 1})

    def test_disabling_shuts_a_person_out_at_once_and_enabling_lets_them_back_in(self):
        stand = self.stand
        cookie = self.sign_in_through_a_link("misha")
        second = stand.post(LOGIN, {"login": "misha", "password": PASSWORD}).cookie(stand.settings.cookie_name)
        pending = self.link_for("vanya")
        off = stand.post(UPDATE, {"login": "misha", "disabled": True}, cookie=self.owner)
        self.assertTrue({person["login"]: person["disabled"] for person in off.json()["people"]}["misha"])
        for held in (cookie, second):
            self.assertRefused(stand.get(ME, cookie=held), 401, "unauthenticated")
        self.assertRefused(stand.post(LOGIN, {"login": "misha", "password": PASSWORD}), 401, "invalid_credentials")
        self.assertRefused(stand.post(LINK, {"login": "misha", "password": PASSWORD}, cookie=self.owner), 409, "login_disabled")
        stand.post(UPDATE, {"login": "vanya", "disabled": True}, cookie=self.owner)
        self.assertRefused(stand.post(SETUP, {"token": pending, "password": PASSWORD}), 404, "invalid_link")
        self.assertEqual([(entry["login"], entry["by"], entry.get("count")) for entry in self.events("user-disabled")],
                         [("misha", "mika", 2), ("vanya", "mika", 0)])

        on = stand.post(UPDATE, {"login": "misha", "disabled": False}, cookie=self.owner)
        self.assertFalse({person["login"]: person["disabled"] for person in on.json()["people"]}["misha"])
        self.assertEqual(stand.post(LOGIN, {"login": "misha", "password": PASSWORD}).status, 200, "the password was kept")
        self.assertRefused(stand.get(ME, cookie=cookie), 401, "unauthenticated")     # what was closed stays closed

    def test_a_sign_in_that_was_open_when_a_login_was_shut_out_never_works_again(self):
        # review, 9 October 2026: the login was disabled, the sessions file would not be written, the
        # session stayed on file - dead while the login was disabled, alive again once it was enabled.
        stand = self.stand
        cookie = self.sign_in_through_a_link("misha")
        patient = stand.auth.sessions
        stand.auth.sessions = auth.Sessions(stand.data_dir, stand.clock, lock_timeout=0.05)
        with store.FileLock(os.path.join(stand.data_dir, "auth", ".sessions.json.lock")):
            refused = stand.post(UPDATE, {"login": "misha", "disabled": True}, cookie=self.owner)
        stand.auth.sessions = patient
        self.assertRefused(refused, 503, "busy")
        self.assertTrue(self.people()["misha"]["disabled"], "the login is shut out all the same")
        self.assertRefused(stand.get(ME, cookie=cookie), 401, "unauthenticated")
        self.assertEqual([(entry["login"], entry.get("detail")) for entry in self.events("user-disabled")],
                         [("misha", "its sessions could not be closed; disable it again")])
        self.assertEqual(len([s for s in stand.auth.sessions.list() if s.login == "misha"]), 1, "the session is still on file")
        self.assertEqual(stand.post(UPDATE, {"login": "misha", "disabled": False}, cookie=self.owner).status, 200)
        self.assertRefused(stand.get(ME, cookie=cookie), 401, "unauthenticated")     # enabling hands nothing back
        self.assertEqual([s for s in stand.auth.sessions.list() if s.login == "misha"], [])


# ---------------------------------------------------------------------------
# A one-time link, issued from the page
# ---------------------------------------------------------------------------

class LinkTests(Case):
    def test_the_link_is_given_once_after_the_owners_password_and_it_signs_its_holder_in(self):
        stand = self.stand
        answer = stand.post(LINK, {"login": "misha", "password": PASSWORD}, cookie=self.owner)
        self.assertEqual(answer.status, 200, answer.body[:200])
        self.assertEqual(answer.header("Cache-Control"), "no-store")
        said = answer.json()
        self.assertEqual(sorted(said), ["expires", "link", "login"])
        self.assertEqual((said["login"], said["expires"]), ("misha", "2026-10-09T12:00:00Z"))
        self.assertRegex(said["link"], r"^http://finance\.localhost:\d+/set-password#t=[A-Za-z0-9_-]{43}$")
        token = said["link"].split("#t=", 1)[1]
        setup = stand.post(SETUP, {"token": token, "password": PASSWORD})
        self.assertEqual((setup.status, setup.json()["login"]), (200, "misha"))
        self.assertRefused(stand.post(SETUP, {"token": token, "password": PASSWORD}), 404, "invalid_link")   # once
        self.assertEqual([(entry["login"], entry["by"]) for entry in self.events("link-issued")], [("misha", "mika")])

    def test_the_link_is_in_the_answer_and_in_no_log_and_no_file(self):
        stand = self.stand
        token = self.link_for("misha")
        for name, text in (("the request log", json.dumps(stand.log_lines())),
                           ("the security log", json.dumps(stand.security_events()))):
            self.assertNotIn(token, text, name)
        for directory, _folders, files in os.walk(stand.data_dir):
            for name in files:
                with open(os.path.join(directory, name), "rb") as handle:
                    self.assertNotIn(token.encode("ascii"), handle.read(), name)
        stored = accounts(stand)["users"]["misha"]["invite"]
        self.assertEqual(stored["sha256"], sha256(token), "the server keeps the sha256 and nothing else")

    def test_a_new_link_retires_the_one_before_it(self):
        stand = self.stand
        first, second = self.link_for("misha"), self.link_for("misha")
        self.assertRefused(stand.post(SETUP, {"token": first, "password": PASSWORD}), 404, "invalid_link")
        self.assertEqual(stand.post(SETUP, {"token": second, "password": PASSWORD}).status, 200)

    def test_without_the_owners_password_no_link_is_made(self):
        stand = self.stand
        for body in ({"login": "misha"}, {"login": "misha", "password": ""}, {"login": "misha", "password": 7},
                     {"login": "misha", "password": "wrong " + PASSWORD}, {"login": "misha", "password": PASSWORD.upper()}):
            with self.subTest(body=body):
                self.assertRefused(stand.post(LINK, body, cookie=self.owner), 403, "wrong_password")
        self.assertIsNone(self.people()["misha"]["linkExpires"])
        self.assertEqual(self.events("link-issued"), [])
        self.assertEqual(stand.get(ME, cookie=self.owner).status, 200, "a wrong password does not end the sign-in")
        failed = self.events("password-check-failed")
        self.assertEqual({(entry["login"], entry["what"]) for entry in failed}, {("mika", "link")})

    def test_a_session_somebody_walked_away_from_is_not_a_way_to_guess_the_password_without_a_limit(self):
        stand = self.stand
        wrong = {"login": "misha", "password": "wrong " + PASSWORD}
        answers = [stand.post(LINK, wrong, cookie=self.owner) for _attempt in range(12)]
        self.assertEqual([answer.status for answer in answers], [403] * 10 + [429] * 2)
        blocked = self.assertRefused(answers[-1], 429, "too_many_attempts")
        self.assertEqual(answers[-1].header("Retry-After"), str(blocked["retryAfter"]))
        # The right password is refused too while the count is full: nothing is hashed for it.
        self.assertRefused(stand.post(LINK, {"login": "misha", "password": PASSWORD}, cookie=self.owner), 429, "too_many_attempts")
        stand.clock.tick(minutes=16)
        self.assertEqual(stand.post(LINK, {"login": "misha", "password": PASSWORD}, cookie=self.owner).status, 200)

    def test_a_link_is_for_somebody_the_stand_knows(self):
        stand = self.stand
        for login in ("nobody", "", None, 7, ["misha"]):
            with self.subTest(login=login):
                self.assertRefused(stand.post(LINK, {"login": login, "password": PASSWORD}, cookie=self.owner), 404, "unknown_login")
        self.assertEqual(self.events("link-issued"), [])

    def test_ctl_issues_a_link_for_an_added_person_too(self):
        stand = self.stand
        stand.post(PEOPLE, {"login": "anna", "name": "Anna"}, cookie=self.owner)
        shown = stand.ctl("user", "invite", "anna", terminal=True)
        self.assertEqual(shown.status, 0, shown.err)
        self.assertIn("login: anna\n", shown.out)
        token = shown.out.strip().rsplit("#t=", 1)[1]
        self.assertEqual(stand.post(SETUP, {"token": token, "password": PASSWORD}).json()["login"], "anna")
        listed = stand.ctl("user", "list").out
        self.assertRegex(listed, r"(?m)^anna +Anna +yes +set \S+ +- +reader$")


# ---------------------------------------------------------------------------
# One's own password
# ---------------------------------------------------------------------------

class PasswordTests(Case):
    def test_a_new_password_closes_every_sign_in_of_the_login_and_opens_one_for_this_browser(self):
        stand = self.stand
        name = stand.settings.cookie_name
        elsewhere = stand.post(LOGIN, {"login": "mika", "password": PASSWORD}).cookie(name)
        answer = stand.post(PASSWORD_DOOR, {"current": PASSWORD, "password": NEW_PASSWORD}, cookie=self.owner)
        self.assertEqual((answer.status, answer.json()), (200, {"ok": True}))
        fresh = answer.cookie(name)
        for closed in (self.owner, elsewhere):
            self.assertRefused(stand.get(ME, cookie=closed), 401, "unauthenticated")
        self.assertEqual(stand.get(ME, cookie=fresh).json()["id"], "mika")
        self.assertRefused(stand.post(LOGIN, {"login": "mika", "password": PASSWORD}), 401, "invalid_credentials")
        self.assertEqual(stand.post(LOGIN, {"login": "mika", "password": NEW_PASSWORD}).status, 200)
        changed = self.events("password-changed")
        self.assertEqual([(entry["login"], entry["count"]) for entry in changed], [("mika", 2)])
        for secret in (PASSWORD, NEW_PASSWORD):
            self.assertNotIn(secret, json.dumps(stand.security_events()) + json.dumps(stand.log_lines()))

    def test_a_reader_changes_their_own_password_and_nobody_elses(self):
        stand = self.stand
        cookie = self.sign_in_through_a_link("misha")
        answer = stand.post(PASSWORD_DOOR, {"current": PASSWORD, "password": NEW_PASSWORD, "login": "mika"}, cookie=cookie)
        self.assertEqual(answer.status, 200, answer.body[:200])
        self.assertEqual(stand.post(LOGIN, {"login": "misha", "password": NEW_PASSWORD}).status, 200)
        self.assertEqual(stand.post(LOGIN, {"login": "mika", "password": PASSWORD}).status, 200, "the owner's is untouched")
        self.assertEqual(stand.get(ME, cookie=self.owner).status, 200)

    def test_without_the_current_password_nothing_changes(self):
        stand = self.stand
        for body in ({"password": NEW_PASSWORD}, {"current": "", "password": NEW_PASSWORD},
                     {"current": "wrong " + PASSWORD, "password": NEW_PASSWORD}, {"current": NEW_PASSWORD, "password": NEW_PASSWORD},
                     {"current": ["x"], "password": NEW_PASSWORD}):
            with self.subTest(body=body):
                self.assertRefused(stand.post(PASSWORD_DOOR, body, cookie=self.owner), 403, "wrong_password")
        self.assertEqual(stand.get(ME, cookie=self.owner).status, 200, "the sign-in is still open")
        self.assertEqual(stand.post(LOGIN, {"login": "mika", "password": PASSWORD}).status, 200)
        self.assertEqual(self.events("password-changed"), [])
        self.assertEqual({entry["what"] for entry in self.events("password-check-failed")}, {"password"})

    def test_a_weak_new_password_is_refused_by_the_rules_of_the_set_password_door(self):
        stand = self.stand
        for weak in ("short", "x" * 257, "my name is mika and so on", "the password of the studio", 12345678901234, None):
            with self.subTest(password=weak):
                refusal = self.assertRefused(stand.post(PASSWORD_DOOR, {"current": PASSWORD, "password": weak}, cookie=self.owner),
                                             400, "weak_password")
                self.assertEqual(refusal["min"], 12)
        self.assertEqual(stand.get(ME, cookie=self.owner).status, 200)
        self.assertEqual(stand.post(LOGIN, {"login": "mika", "password": PASSWORD}).status, 200)

    def test_wrong_current_passwords_are_counted_like_failed_sign_ins(self):
        stand = self.stand
        wrong = {"current": "wrong " + PASSWORD, "password": NEW_PASSWORD}
        statuses = [stand.post(PASSWORD_DOOR, wrong, cookie=self.owner).status for _attempt in range(12)]
        self.assertEqual(statuses, [403] * 10 + [429] * 2)
        self.assertRefused(stand.post(LOGIN, {"login": "mika", "password": PASSWORD}), 429, "too_many_attempts")

    def test_the_door_asks_a_session(self):
        answer = self.stand.post(PASSWORD_DOOR, {"current": PASSWORD, "password": NEW_PASSWORD})
        self.assertRefused(answer, 401, "unauthenticated")

    def test_a_password_that_was_stored_is_never_told_as_nothing_happened(self):
        # review, 9 October 2026: the password was stored, the sessions file would not be written, and
        # the caller was told 503 "busy" - with the new password in force and no line in the log.
        stand = self.stand
        stand.auth.sessions = auth.Sessions(stand.data_dir, stand.clock, lock_timeout=0.05)
        with store.FileLock(os.path.join(stand.data_dir, "auth", ".sessions.json.lock")):
            answer = stand.post(PASSWORD_DOOR, {"current": PASSWORD, "password": NEW_PASSWORD}, cookie=self.owner)
        self.assertRefused(answer, 503, "password_changed")
        self.assertEqual(answer.all("Set-Cookie"), [], "no sign-in was opened, and none is promised")
        self.assertRefused(stand.get(ME, cookie=self.owner), 401, "unauthenticated")     # void, whatever the file holds
        self.assertRefused(stand.post(LOGIN, {"login": "mika", "password": PASSWORD}), 401, "invalid_credentials")
        self.assertEqual(stand.post(LOGIN, {"login": "mika", "password": NEW_PASSWORD}).status, 200)
        self.assertEqual([(entry["login"], entry.get("detail")) for entry in self.events("password-changed")],
                         [("mika", "no new sign-in could be opened")], "the change is in the log all the same")

    def test_a_login_shut_out_while_its_new_password_was_being_made_gets_neither_password_nor_session(self):
        # review, 9 October 2026: the current password is checked, then the new hash is made - and in
        # between the owner may have disabled the login.
        stand = self.stand
        stand.set_password("misha")
        old = stand.auth.users.password_hash("misha")
        stand.auth.set_disabled("misha", True, by="mika")
        with self.assertRaises(auth.Busy):
            stand.auth.users.change_password("misha", old, auth.hash_password(NEW_PASSWORD, stand.settings.kdf))
        self.assertEqual(stand.auth.users.password_hash("misha"), old)

    def test_a_strangers_failed_sign_ins_do_not_shut_the_owners_own_doors(self):
        # review, 9 October 2026: the password asked for again was counted in the sign-in door's count
        # per login, which anybody fills from three addresses.
        stand = self.stand
        for attempt in range(30):
            with self.assertRaises(auth.InvalidCredentials):
                stand.auth.sign_in("mika", "wrong " + PASSWORD, "198.51.100.%d" % (attempt // 10 + 1))
        with self.assertRaises(auth.TooManyAttempts):
            stand.auth.sign_in("mika", PASSWORD, "203.0.113.9")           # the sign-in door is shut for the login
        self.assertEqual(stand.post(LINK, {"login": "misha", "password": PASSWORD}, cookie=self.owner).status, 200)
        self.assertEqual(stand.post(PASSWORD_DOOR, {"current": PASSWORD, "password": NEW_PASSWORD}, cookie=self.owner).status, 200)

    def test_the_password_asked_again_has_thirty_tries_per_login_whatever_the_address(self):
        stand = self.stand
        for attempt in range(30):
            with self.assertRaises(auth.WrongPassword):
                stand.auth.confirm_password("mika", "wrong " + PASSWORD, "198.51.100.%d" % (attempt // 10 + 1))
        with self.assertRaises(auth.TooManyAttempts) as refused:
            stand.auth.confirm_password("mika", PASSWORD, "203.0.113.9")
        self.assertEqual(refused.exception.key, "recheck")


# ---------------------------------------------------------------------------
# The accounts file
# ---------------------------------------------------------------------------

class AccountsFileTests(Case):
    def users(self) -> Dict[str, Any]:
        return accounts(self.stand)

    def write(self, data: Dict[str, Any]) -> None:
        with open(os.path.join(self.stand.data_dir, "auth", "users.json"), "w") as handle:
            json.dump(data, handle)

    def test_a_file_of_the_release_before_reads_as_one_owner_and_readers(self):
        data = self.users()
        for record in data["users"].values():
            self.assertEqual(sorted(record), ["disabled", "gen", "hash", "invite", "setAt", "totp"],
                             "nothing is written into an account until the owner says something about it")
        self.assertEqual([user.role for user in self.stand.auth.users.list()], ["owner", "reader", "reader"])

    def test_owner_is_never_a_role_on_disk_and_a_role_on_disk_never_makes_an_owner(self):
        stand = self.stand
        stand.post(UPDATE, {"login": "misha", "role": "editor"}, cookie=self.owner)
        data = self.users()
        self.assertEqual({login: record.get("role") for login, record in data["users"].items()},
                         {"mika": None, "misha": "editor", "vanya": None})
        data["users"]["vanya"]["role"] = "owner"
        self.write(data)
        self.assertRefused(stand.get(ME, cookie=self.owner), 503, "auth_damaged")    # it is not as this program writes one

    def test_an_account_the_list_has_dropped_and_nobody_added_gets_no_way_back_in(self):
        stand = self.stand
        data = self.users()
        data["users"]["olga"] = dict(data["users"]["vanya"])       # an account from a time MONEY_FOUNDERS named her
        self.write(data)
        self.assertNotIn("olga", self.people())
        self.assertRefused(stand.post(LINK, {"login": "olga", "password": PASSWORD}, cookie=self.owner), 404, "unknown_login")
        self.assertRefused(stand.post(UPDATE, {"login": "olga", "role": "editor"}, cookie=self.owner), 404, "unknown_login")
        self.assertRefused(stand.post(UPDATE, {"login": "olga", "disabled": False}, cookie=self.owner), 404, "unknown_login")
        self.assertRefused(stand.post(PEOPLE, {"login": "olga", "name": "Olga"}, cookie=self.owner), 409, "login_taken")
        self.assertEqual(stand.ctl("user", "invite", "olga", terminal=True).status, 1)

    def test_what_is_not_a_name_a_role_or_a_note_of_who_added_is_a_damaged_file(self):
        stand = self.stand
        good = self.users()
        for field, value in (("name", ""), ("name", 5), ("name", "x" * 41), ("role", "owner"), ("role", "admin"),
                             ("role", 1), ("added", True), ("added", {"by": "mika"}), ("added", {"by": "Mika!", "at": "2026-10-07T12:00:00Z"}),
                             ("added", {"by": "mika", "at": "yesterday"})):
            with self.subTest(field=field, value=value):
                data = json.loads(json.dumps(good))
                data["users"]["misha"][field] = value
                self.write(data)
                self.assertRefused(stand.get(ME, cookie=self.owner), 503, "auth_damaged")
        self.write(good)
        self.assertEqual(stand.get(ME, cookie=self.owner).status, 200)


if __name__ == "__main__":
    unittest.main()
