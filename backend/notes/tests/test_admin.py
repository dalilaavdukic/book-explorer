from django.test import TestCase
from django.urls import reverse

from accounts.models import User
from catalog.models import Book
from notes.models import Note
from notes.tests import create_books


class NoteAdminTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.admin = User.objects.create_superuser(
            username="admin", password="admin-pass"
        )
        cls.alice = User.objects.create_user(username="alice", password="alice-pass")
        cls.bob = User.objects.create_user(username="bob", password="bob-pass")
        cls.book, cls.other_book = create_books("Test Book", "Other Book")
        cls.note = Note.objects.create(
            user=cls.alice, book=cls.book, body="Big Brother is watching.", page=3
        )

    def setUp(self):
        self.client.force_login(self.admin)

    def test_book_with_notes_cannot_be_deleted_and_the_page_lists_them(self):
        url = reverse("admin:catalog_book_delete", args=[self.book.pk])

        response = self.client.get(url)

        self.assertContains(response, "Cannot delete book")
        self.assertContains(response, str(self.note))

        response = self.client.post(url, {"post": "yes"})

        self.assertContains(response, "Cannot delete book")
        self.assertTrue(Book.objects.filter(pk=self.book.pk).exists())
        self.assertTrue(Note.objects.filter(pk=self.note.pk).exists())

    def test_changelist_finds_a_note_by_its_text(self):
        Note.objects.create(user=self.bob, book=self.book, body="Something else.")

        response = self.client.get(
            reverse("admin:notes_note_changelist"), {"q": "Big Brother"}
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(list(response.context["cl"].result_list), [self.note])

    def test_editing_the_text_marks_the_note_edited_but_never_moves_it(self):
        response = self.client.post(
            reverse("admin:notes_note_change", args=[self.note.pk]),
            {
                "body": "War is peace.",
                "page": "",
                "user": self.bob.pk,
                "book": self.other_book.pk,
            },
        )

        self.assertEqual(response.status_code, 302)
        self.note.refresh_from_db()
        self.assertEqual(self.note.body, "War is peace.")
        self.assertIsNone(self.note.page)
        self.assertIsNotNone(self.note.edited_at)
        self.assertEqual(self.note.user, self.alice)
        self.assertEqual(self.note.book, self.book)
