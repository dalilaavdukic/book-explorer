from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from accounts.models import User
from notes.models import Note
from notes.tests import create_books


class NoteApiTestCase(APITestCase):
    @classmethod
    def setUpTestData(cls):
        cls.alice = User.objects.create_user(username="alice", password="alice-pass")
        (cls.book,) = create_books("Test Book")
        cls.list_url = f"/api/books/{cls.book.pk}/notes/"

    def setUp(self):
        self.client.force_login(self.alice)

    def create_note(self, **fields):
        fields = {"body": "A note.", "page": 12, **fields}
        return Note.objects.create(user=self.alice, book=self.book, **fields)

    def post(self, data):
        return self.client.post(self.list_url, data, format="json")

    def patch(self, note, data):
        return self.client.patch(f"/api/notes/{note.pk}/", data, format="json")


class NoteRepresentationTests(NoteApiTestCase):
    def test_note_has_exactly_the_documented_fields(self):
        response = self.client.get(f"/api/notes/{self.create_note().pk}/")

        self.assertEqual(
            set(response.data), {"id", "body", "page", "created_at", "edited_at"}
        )


class NoteBodyTests(NoteApiTestCase):
    def test_invalid_body_is_rejected(self):
        for label, data in [
            ("missing", {}),
            ("empty", {"body": ""}),
            ("whitespace only", {"body": " \n\t \r\n "}),
            ("null", {"body": None}),
            ("too long", {"body": "x" * 5001}),
        ]:
            with self.subTest(label):
                response = self.post(data)

                self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
                self.assertIn("body", response.data)

        self.assertFalse(Note.objects.exists())

    def test_longest_body_is_accepted_after_trimming(self):
        for body in ["x" * 5000, f"  {'x' * 5000}  "]:
            with self.subTest(length=len(body)):
                response = self.post({"body": body})

                self.assertEqual(response.status_code, status.HTTP_201_CREATED)
                self.assertEqual(response.data["body"], "x" * 5000)

    def test_surrounding_whitespace_is_trimmed_and_inner_line_breaks_kept(self):
        response = self.post({"body": "\n  First line.\nSecond line.  \n"})

        self.assertEqual(response.data["body"], "First line.\nSecond line.")
        self.assertEqual(
            Note.objects.get(pk=response.data["id"]).body, "First line.\nSecond line."
        )


class NotePageTests(NoteApiTestCase):
    def test_invalid_page_is_rejected(self):
        for page in [0, -1, 1.5, "abc", 10001, True]:
            with self.subTest(page=page):
                response = self.post({"body": "A note.", "page": page})

                self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
                self.assertIn("page", response.data)

        self.assertFalse(Note.objects.exists())

    def test_page_with_thousands_of_digits_is_a_bad_request(self):
        response = self.client.post(
            self.list_url,
            '{"body": "A note.", "page": 1' + "0" * 4999 + "}",
            content_type="application/json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertFalse(Note.objects.exists())

    def test_valid_or_empty_page_is_accepted(self):
        for label, data, expected in [
            ("first", {"page": 1}, 1),
            ("last", {"page": 10000}, 10000),
            ("null", {"page": None}, None),
            ("missing", {}, None),
        ]:
            with self.subTest(label):
                response = self.post({"body": "A note.", **data})

                self.assertEqual(response.status_code, status.HTTP_201_CREATED)
                self.assertEqual(response.data["page"], expected)
                self.assertEqual(
                    Note.objects.get(pk=response.data["id"]).page, expected
                )

    def test_editing_with_a_null_page_clears_it(self):
        note = self.create_note(page=12)

        response = self.patch(note, {"body": note.body, "page": None})

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        note.refresh_from_db()
        self.assertIsNone(note.page)


class NoteEditedAtApiTests(NoteApiTestCase):
    def test_new_note_is_not_edited(self):
        response = self.post({"body": "A note."})

        self.assertIsNone(response.data["edited_at"])

    def test_saving_the_same_values_does_not_mark_the_note_edited(self):
        note = self.create_note(body="A note.", page=12)

        for body in ["A note.", "  A note.  "]:
            with self.subTest(body=body):
                response = self.patch(note, {"body": body, "page": 12})

                self.assertEqual(response.status_code, status.HTTP_200_OK)
                self.assertIsNone(response.data["edited_at"])

    def test_real_change_marks_the_note_edited(self):
        note = self.create_note()

        response = self.patch(note, {"body": "Changed.", "page": 12})

        self.assertIsNotNone(response.data["edited_at"])


class NotePagingTests(NoteApiTestCase):
    def test_notes_created_at_the_same_instant_page_in_descending_id_order(self):
        Note.objects.bulk_create(
            [Note(user=self.alice, book=self.book, body="A.") for _ in range(25)]
        )
        Note.objects.update(created_at=timezone.now())

        ids = []
        for page in (1, 2):
            response = self.client.get(self.list_url, {"page": page})
            ids += [note["id"] for note in response.data["results"]]

        self.assertEqual(
            ids, list(Note.objects.order_by("-id").values_list("pk", flat=True))
        )

    def test_page_out_of_range_is_not_found(self):
        self.create_note()

        response = self.client.get(self.list_url, {"page": 2})

        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
        self.assertEqual(response.data, {"detail": "Invalid page."})

    def test_invalid_page_size_is_rejected(self):
        response = self.client.get(self.list_url, {"page_size": "abc"})

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("page_size", response.data)


class NoteMethodTests(NoteApiTestCase):
    def test_put_is_not_allowed(self):
        note = self.create_note()

        response = self.client.put(
            f"/api/notes/{note.pk}/", {"body": "Replaced.", "page": 1}, format="json"
        )

        self.assertEqual(response.status_code, status.HTTP_405_METHOD_NOT_ALLOWED)
        note.refresh_from_db()
        self.assertEqual((note.body, note.page), ("A note.", 12))
