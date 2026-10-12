from rest_framework import status
from rest_framework.test import APITestCase

from accounts.models import User
from accounts.tests.test_auth import AuthTestCase
from notes.models import Note
from notes.tests import create_books

UNKNOWN_BOOK_ID = 999999


def notes_url(book_id):
    return f"/api/books/{book_id}/notes/"


def note_url(note_id):
    return f"/api/notes/{note_id}/"


def send(client, method, url, data=None):
    if method in ("post", "patch"):
        return getattr(client, method)(url, data or {}, format="json")
    return getattr(client, method)(url)


def stored(note):
    return Note.objects.values().get(pk=note.pk)


class NotesAuthorizationTestCase(APITestCase):
    @classmethod
    def setUpTestData(cls):
        cls.alice = User.objects.create_user(username="alice", password="alice-pass")
        cls.bob = User.objects.create_user(username="bob", password="bob-pass")
        cls.book, cls.other_book = create_books("Test Book", "Other Book")
        cls.alices_note = Note.objects.create(
            user=cls.alice, book=cls.book, body="Alice's note.", page=1
        )
        cls.bobs_note = Note.objects.create(
            user=cls.bob, book=cls.book, body="Bob's note."
        )


class VisitorTests(NotesAuthorizationTestCase):
    def test_visitor_gets_401_from_every_notes_endpoint(self):
        before = stored(self.alices_note)

        for method, url in [
            ("get", notes_url(self.book.pk)),
            ("post", notes_url(self.book.pk)),
            ("get", note_url(self.alices_note.pk)),
            ("patch", note_url(self.alices_note.pk)),
            ("delete", note_url(self.alices_note.pk)),
            ("get", notes_url(UNKNOWN_BOOK_ID)),
            ("post", notes_url(UNKNOWN_BOOK_ID)),
        ]:
            with self.subTest(method=method, url=url):
                response = send(self.client, method, url, {"body": "A visitor's."})

                self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)
                self.assertEqual(response.headers["WWW-Authenticate"], "Session")

        self.assertEqual(Note.objects.count(), 2)
        self.assertEqual(stored(self.alices_note), before)


class NoteListAuthorizationTests(NotesAuthorizationTestCase):
    def test_list_holds_only_the_readers_notes_on_the_book_newest_first(self):
        newer = Note.objects.create(user=self.alice, book=self.book, body="Newer.")
        Note.objects.create(user=self.alice, book=self.other_book, body="Elsewhere.")
        self.client.force_login(self.alice)

        response = self.client.get(notes_url(self.book.pk))

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(
            [note["id"] for note in response.data["results"]],
            [newer.pk, self.alices_note.pk],
        )

    def test_count_and_pages_depend_only_on_the_readers_notes(self):
        Note.objects.bulk_create(
            [Note(user=self.alice, book=self.book, body="A.") for _ in range(20)]
            + [Note(user=self.bob, book=self.book, body="B.") for _ in range(29)]
        )
        self.client.force_login(self.alice)

        first = self.client.get(notes_url(self.book.pk))
        second = self.client.get(notes_url(self.book.pk), {"page": 2})
        third = self.client.get(notes_url(self.book.pk), {"page": 3})

        self.assertEqual(first.data["count"], 21)
        self.assertEqual(len(first.data["results"]), 20)
        self.assertEqual(len(second.data["results"]), 1)
        self.assertEqual(third.status_code, status.HTTP_404_NOT_FOUND)
        self.assertEqual(third.data, {"detail": "Invalid page."})


class NoteCreateAuthorizationTests(NotesAuthorizationTestCase):
    def test_owner_comes_from_the_session_and_book_from_the_url(self):
        self.client.force_login(self.alice)

        response = self.client.post(
            notes_url(self.book.pk),
            {"body": "Mine.", "user": self.bob.pk, "book": self.other_book.pk},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        note = Note.objects.get(pk=response.data["id"])
        self.assertEqual(note.user, self.alice)
        self.assertEqual(note.book, self.book)


class NoteOwnershipTests(NotesAuthorizationTestCase):
    def test_owner_can_read_edit_and_delete_their_note(self):
        self.client.force_login(self.alice)
        url = note_url(self.alices_note.pk)

        self.assertEqual(self.client.get(url).status_code, status.HTTP_200_OK)
        self.assertEqual(
            self.client.patch(url, {"body": "Edited."}, format="json").status_code,
            status.HTTP_200_OK,
        )
        self.assertEqual(
            self.client.delete(url).status_code, status.HTTP_204_NO_CONTENT
        )
        self.assertFalse(Note.objects.filter(pk=self.alices_note.pk).exists())

    def test_another_readers_note_looks_exactly_like_a_missing_one(self):
        missing_id = Note.objects.latest("pk").pk + 1000
        before = stored(self.alices_note)
        self.client.force_login(self.bob)

        for method in ("get", "patch", "delete"):
            with self.subTest(method=method):
                data = {"body": "Bob was here."}
                alices = send(self.client, method, note_url(self.alices_note.pk), data)
                missing = send(self.client, method, note_url(missing_id), data)

                self.assertEqual(alices.status_code, status.HTTP_404_NOT_FOUND)
                self.assertEqual(alices.content, missing.content)

        self.assertEqual(stored(self.alices_note), before)

    def test_editing_never_moves_a_note(self):
        self.client.force_login(self.alice)

        response = self.client.patch(
            note_url(self.alices_note.pk),
            {"body": "Edited.", "user": self.bob.pk, "book": self.other_book.pk},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.alices_note.refresh_from_db()
        self.assertEqual(self.alices_note.body, "Edited.")
        self.assertEqual(self.alices_note.user, self.alice)
        self.assertEqual(self.alices_note.book, self.book)

    def test_unknown_book_is_not_found_even_with_an_invalid_body(self):
        self.client.force_login(self.alice)

        for method, data in [
            ("get", None),
            ("post", {"body": "Valid."}),
            ("post", {"body": ""}),
        ]:
            with self.subTest(method=method, data=data):
                response = send(self.client, method, notes_url(UNKNOWN_BOOK_ID), data)

                self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

        self.assertEqual(Note.objects.count(), 2)

    def test_nonexistent_note_is_not_found(self):
        self.client.force_login(self.alice)
        # The second id is beyond SQLite's integer range.
        for note_id in (Note.objects.latest("pk").pk + 1, 99999999999999999999):
            for method in ("get", "patch", "delete"):
                with self.subTest(note_id=note_id, method=method):
                    response = send(
                        self.client, method, note_url(note_id), {"body": "Edited."}
                    )

                    self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)


class NoteSessionSecurityTests(AuthTestCase):
    @classmethod
    def setUpTestData(cls):
        super().setUpTestData()
        (cls.book,) = create_books("Test Book")

    def test_writes_without_the_csrf_token_are_refused(self):
        self.log_in()
        note = Note.objects.create(user=self.alice, book=self.book, body="Kept.")
        before = stored(note)

        for method, url in [
            ("post", notes_url(self.book.pk)),
            ("patch", note_url(note.pk)),
            ("delete", note_url(note.pk)),
        ]:
            with self.subTest(method=method):
                response = send(self.client, method, url, {"body": "Forged."})

                self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
                self.assertTrue(response.json()["detail"].startswith("CSRF Failed"))

        self.assertEqual(Note.objects.count(), 1)
        self.assertEqual(stored(note), before)

    def test_writes_with_the_csrf_token_succeed(self):
        self.log_in()
        headers = {"X-CSRFToken": self.csrf_token()}

        created = self.client.post(
            notes_url(self.book.pk), {"body": "New."}, format="json", headers=headers
        )
        url = note_url(created.data["id"])
        edited = self.client.patch(
            url, {"body": "Edited."}, format="json", headers=headers
        )
        deleted = self.client.delete(url, headers=headers)

        self.assertEqual(created.status_code, status.HTTP_201_CREATED)
        self.assertEqual(edited.status_code, status.HTTP_200_OK)
        self.assertEqual(deleted.status_code, status.HTTP_204_NO_CONTENT)

    def test_replayed_old_session_cookie_cannot_read_notes(self):
        self.log_in()
        session_key = self.client.cookies["sessionid"].value
        self.log_out()
        self.client.cookies["sessionid"] = session_key

        response = self.client.get(notes_url(self.book.pk))

        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)
