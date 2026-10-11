from django.db import IntegrityError, transaction
from django.db.models import ProtectedError
from django.test import TestCase

from accounts.models import User
from catalog.models import Book
from notes.models import Note


class NoteTestCase(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.alice = User.objects.create_user(username="alice", password="alice-pass")
        cls.bob = User.objects.create_user(username="bob", password="bob-pass")
        cls.book = Book.objects.get(title="Nineteen Eighty-Four")

    def create_note(self, user=None, **fields):
        fields = {"body": "A note.", "page": 12, **fields}
        return Note.objects.create(user=user or self.alice, book=self.book, **fields)


class NoteConstraintTests(NoteTestCase):
    def test_database_rejects_an_out_of_range_page_or_empty_body(self):
        for fields in [{"page": 0}, {"page": 10001}, {"body": ""}]:
            with self.subTest(**fields):
                with self.assertRaises(IntegrityError), transaction.atomic():
                    self.create_note(**fields)

                note = self.create_note()
                with self.assertRaises(IntegrityError), transaction.atomic():
                    Note.objects.filter(pk=note.pk).update(**fields)

    def test_page_can_be_empty(self):
        note = self.create_note(page=None)

        note.refresh_from_db()
        self.assertIsNone(note.page)


class NoteEditedAtTests(NoteTestCase):
    def test_new_note_is_not_edited(self):
        self.assertIsNone(self.create_note().edited_at)

    def test_saving_unchanged_values_does_not_mark_the_note_edited(self):
        note = self.create_note()

        note.save()

        note.refresh_from_db()
        self.assertIsNone(note.edited_at)

    def test_changing_the_body_or_page_marks_the_note_edited(self):
        for fields in [{"body": "Changed."}, {"page": 13}, {"page": None}]:
            with self.subTest(**fields):
                note = self.create_note()
                for name, value in fields.items():
                    setattr(note, name, value)

                note.save()

                note.refresh_from_db()
                self.assertIsNotNone(note.edited_at)


class NoteDeleteRuleTests(NoteTestCase):
    def test_book_with_notes_cannot_be_deleted(self):
        note = self.create_note()

        with self.assertRaises(ProtectedError):
            self.book.delete()

        self.assertTrue(Book.objects.filter(pk=self.book.pk).exists())
        self.assertTrue(Note.objects.filter(pk=note.pk).exists())

    def test_deleting_a_user_removes_only_their_notes(self):
        self.create_note(user=self.alice)
        bobs_note = self.create_note(user=self.bob)

        self.alice.delete()

        self.assertEqual(list(Note.objects.all()), [bobs_note])
