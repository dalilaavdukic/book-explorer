from django.db import IntegrityError, transaction
from django.db.models import ProtectedError
from django.test import TestCase
from django.urls import reverse

from accounts.models import User
from catalog.models import Author, Book, Genre


def create_book(title, author, genre):
    return Book.objects.create(
        title=title,
        author=author,
        genre=genre,
        publication_year=2000,
        description="A test book.",
    )


def catalog_counts():
    return Author.objects.count(), Genre.objects.count(), Book.objects.count()


class CatalogModelTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.author = Author.objects.create(name="Test Author", sort_name="Author, Test")
        cls.genre = Genre.objects.create(name="Test Genre")
        cls.book = create_book("Test Book", cls.author, cls.genre)

    def test_author_or_genre_with_books_cannot_be_deleted(self):
        counts = catalog_counts()
        for obj in (self.author, self.genre):
            with self.subTest(model=type(obj).__name__):
                with self.assertRaises(ProtectedError):
                    obj.delete()

                self.assertEqual(catalog_counts(), counts)

    def test_duplicate_title_by_the_same_author_is_rejected(self):
        with self.assertRaises(IntegrityError), transaction.atomic():
            create_book("Test Book", self.author, self.genre)

    def test_same_title_by_another_author_is_allowed(self):
        other = Author.objects.create(name="Other Author", sort_name="Author, Other")

        create_book("Test Book", other, self.genre)

        self.assertEqual(Book.objects.filter(title="Test Book").count(), 2)


class CatalogAdminTests(TestCase):
    def test_superuser_can_search_the_catalog_changelists(self):
        author = Author.objects.create(name="Test Author", sort_name="Author, Test")
        genre = Genre.objects.create(name="Test Genre")
        create_book("Test Book", author, genre)
        admin = User.objects.create_superuser(username="admin", password="s3cret-pass")
        self.client.force_login(admin)

        for model, expected in [
            ("book", "Test Book"),
            ("author", "Test Author"),
            ("genre", "Test Genre"),
        ]:
            with self.subTest(model=model):
                response = self.client.get(
                    reverse(f"admin:catalog_{model}_changelist"), {"q": "Test"}
                )

                self.assertEqual(response.status_code, 200)
                self.assertContains(response, expected)
