from rest_framework import status

from accounts.models import User
from catalog.models import Author, Genre
from catalog.tests import OwnBooksTestCase, create_book
from notes.models import Note

LIST_URL = "/api/books/"


class HasNotesTestCase(OwnBooksTestCase):
    """Alice and Bob have notes on some of the same books and on different ones."""

    @classmethod
    def setUpTestData(cls):
        super().setUpTestData()
        cls.alice = User.objects.create_user(username="alice", password="alice-pw")
        cls.bob = User.objects.create_user(username="bob", password="bob-pw")
        cls.other_author = Author.objects.create(
            name="Other Author", sort_name="Other, Author"
        )
        cls.second_genre = Genre.objects.create(name="Second Genre")
        cls.third_genre = Genre.objects.create(name="Third Genre")

        cls.shared = create_book("Shared Book", cls.author, cls.genre, 2001)
        cls.alices = create_book("Alice's Book", cls.author, cls.second_genre, 2002)
        cls.bobs = create_book("Bob's Book", cls.author, cls.genre, 2003)
        create_book("Unnoted Book", cls.author, cls.genre, 2004)
        # Alice's notes that the combined filters leave out, one filter each.
        alices_others = [
            create_book("Book by Another", cls.other_author, cls.genre, 2005),
            create_book("Book in a Third Genre", cls.author, cls.third_genre, 2006),
            create_book("Unrelated Title", cls.author, cls.genre, 2007),
        ]

        for body in ["First", "Second", "Third"]:
            Note.objects.create(user=cls.alice, book=cls.shared, body=body)
        for book in [cls.alices, *alices_others]:
            Note.objects.create(user=cls.alice, book=book, body="Alice's note")
        for book in [cls.shared, cls.bobs]:
            Note.objects.create(user=cls.bob, book=book, body="Bob's note")

    def titles(self, params):
        response = self.client.get(LIST_URL, params)

        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        return [book["title"] for book in response.data["results"]]


class VisitorHasNotesTests(HasNotesTestCase):
    def test_visitor_asking_for_noted_books_gets_401(self):
        for params in [
            {"has_notes": "true"},
            {
                "has_notes": "true",
                "search": "book",
                "author": self.author.pk,
                "genre": [self.genre.pk, self.second_genre.pk],
                "sort": "-year",
            },
        ]:
            with self.subTest(params=params):
                response = self.client.get(LIST_URL, params)

                self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)
                self.assertEqual(response["WWW-Authenticate"], "Session")
                self.assertNotIn("results", response.data)

    def test_false_or_empty_means_the_full_list(self):
        full = self.titles({})

        self.assertEqual(len(full), 7)
        for value in ["false", ""]:
            with self.subTest(has_notes=value):
                self.assertEqual(self.titles({"has_notes": value}), full)


class ReaderHasNotesTests(HasNotesTestCase):
    def test_each_reader_gets_only_the_books_they_noted(self):
        for reader, expected in [
            (
                self.alice,
                [
                    "Alice's Book",
                    "Book by Another",
                    "Book in a Third Genre",
                    "Shared Book",
                    "Unrelated Title",
                ],
            ),
            (self.bob, ["Bob's Book", "Shared Book"]),
        ]:
            with self.subTest(reader=reader.username):
                self.client.force_login(reader)

                response = self.client.get(LIST_URL, {"has_notes": "true"})

                self.assertEqual(
                    [book["title"] for book in response.data["results"]], expected
                )
                self.assertEqual(response.data["count"], len(expected))

    def test_a_book_noted_several_times_appears_once(self):
        self.client.force_login(self.alice)

        titles = self.titles({"has_notes": "true", "search": "shared"})

        self.assertEqual(titles, ["Shared Book"])

    def test_no_parameter_names_another_reader(self):
        self.client.force_login(self.alice)

        titles = self.titles({"has_notes": "true", "user": self.bob.pk})

        self.assertNotIn("Bob's Book", titles)
        self.assertEqual(len(titles), 5)

    def test_combines_with_search_author_genres_and_sort(self):
        self.client.force_login(self.alice)

        titles = self.titles(
            {
                "has_notes": "true",
                "search": "book",
                "author": self.author.pk,
                "genre": [self.genre.pk, self.second_genre.pk],
                "sort": "-year",
            }
        )

        self.assertEqual(titles, ["Alice's Book", "Shared Book"])

    def test_false_means_the_full_list(self):
        self.client.force_login(self.alice)

        self.assertEqual(len(self.titles({"has_notes": "false"})), 7)

    def test_invalid_values_are_rejected(self):
        self.client.force_login(self.alice)

        for value in ["banana", "1", "TRUE"]:
            with self.subTest(has_notes=value):
                response = self.client.get(LIST_URL, {"has_notes": value})

                self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
                self.assertEqual(list(response.data), ["has_notes"])


class HasNotesQueryCountTests(OwnBooksTestCase):
    @classmethod
    def setUpTestData(cls):
        super().setUpTestData()
        cls.alice = User.objects.create_user(username="alice", password="alice-pw")
        for number in range(1, 31):
            book = create_book(f"Book {number:02}", cls.author, cls.genre)
            Note.objects.create(user=cls.alice, book=book, body="Note")

    def test_takes_as_many_queries_for_3_books_as_for_30(self):
        self.client.force_login(self.alice)

        for page_size in (3, 30):
            # The session, the reader, the count and the page.
            with self.subTest(page_size=page_size), self.assertNumQueries(4):
                response = self.client.get(
                    LIST_URL, {"has_notes": "true", "page_size": page_size}
                )

                self.assertEqual(len(response.data["results"]), page_size)
