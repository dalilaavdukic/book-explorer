from rest_framework.test import APITestCase

from catalog.models import Author, Book, Genre


def create_book(title, author, genre, year=2000):
    return Book.objects.create(
        title=title,
        author=author,
        genre=genre,
        publication_year=year,
        description=f"About {title}.",
    )


class OwnBooksTestCase(APITestCase):
    """Replaces the seeded catalog with the test's own, inside the test transaction."""

    @classmethod
    def setUpTestData(cls):
        Book.objects.all().delete()
        Author.objects.all().delete()
        Genre.objects.all().delete()
        cls.author = Author.objects.create(name="Test Author", sort_name="Author, Test")
        cls.genre = Genre.objects.create(name="Test Genre")
