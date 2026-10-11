from rest_framework import status
from rest_framework.test import APITestCase

from catalog.models import Author, Book, Genre

LIST_URL = "/api/books/"


def detail_url(pk):
    return f"/api/books/{pk}/"


def create_book(title, author, genre, year=2000):
    return Book.objects.create(
        title=title,
        author=author,
        genre=genre,
        publication_year=year,
        description=f"About {title}.",
    )


class OwnBooksTestCase(APITestCase):
    """Replaces the seeded books with the test's own, inside the test transaction."""

    @classmethod
    def setUpTestData(cls):
        Book.objects.all().delete()
        cls.author = Author.objects.create(name="Test Author", sort_name="Author, Test")
        cls.genre = Genre.objects.create(name="Test Genre")


class BookEndpointTests(OwnBooksTestCase):
    @classmethod
    def setUpTestData(cls):
        super().setUpTestData()
        cls.book = create_book("Test Book", cls.author, cls.genre, year=1999)

    def test_visitor_can_read_the_list_and_a_book(self):
        for url in (LIST_URL, detail_url(self.book.pk)):
            with self.subTest(url=url):
                response = self.client.get(url)

                self.assertEqual(response.status_code, status.HTTP_200_OK)

    def test_list_items_have_exactly_the_documented_fields(self):
        response = self.client.get(LIST_URL)

        self.assertEqual(
            response.data["results"],
            [
                {
                    "id": self.book.pk,
                    "title": "Test Book",
                    "author": {"id": self.author.pk, "name": "Test Author"},
                    "genre": {"id": self.genre.pk, "name": "Test Genre"},
                    "publication_year": 1999,
                }
            ],
        )

    def test_detail_adds_the_description(self):
        response = self.client.get(detail_url(self.book.pk))

        self.assertEqual(
            response.data,
            {
                "id": self.book.pk,
                "title": "Test Book",
                "author": {"id": self.author.pk, "name": "Test Author"},
                "genre": {"id": self.genre.pk, "name": "Test Genre"},
                "publication_year": 1999,
                "description": "About Test Book.",
            },
        )

    def test_unknown_book_is_not_found(self):
        # The second id is beyond SQLite's integer range.
        for pk in (self.book.pk + 1, 99999999999999999999):
            with self.subTest(pk=pk):
                response = self.client.get(detail_url(pk))

                self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_books_are_read_only(self):
        for method, url in [
            ("post", LIST_URL),
            ("put", detail_url(self.book.pk)),
            ("patch", detail_url(self.book.pk)),
            ("delete", detail_url(self.book.pk)),
        ]:
            with self.subTest(method=method):
                response = getattr(self.client, method)(
                    url, {"title": "Changed"}, format="json"
                )

                self.assertEqual(
                    response.status_code, status.HTTP_405_METHOD_NOT_ALLOWED
                )
        self.book.refresh_from_db()
        self.assertEqual(self.book.title, "Test Book")
        self.assertEqual(Book.objects.count(), 1)


class BookPaginationTests(OwnBooksTestCase):
    @classmethod
    def setUpTestData(cls):
        super().setUpTestData()
        for number in range(1, 14):
            create_book(f"Book {number:02}", cls.author, cls.genre)

    def test_default_page_has_12_books(self):
        first = self.client.get(LIST_URL)
        second = self.client.get(LIST_URL, {"page": 2})

        self.assertEqual(first.data["count"], 13)
        self.assertEqual(len(first.data["results"]), 12)
        self.assertEqual(len(second.data["results"]), 1)

    def test_page_size_from_1_to_100_is_accepted(self):
        for page_size, expected in [(1, 1), (5, 5), (100, 13)]:
            with self.subTest(page_size=page_size):
                response = self.client.get(LIST_URL, {"page_size": page_size})

                self.assertEqual(response.status_code, status.HTTP_200_OK)
                self.assertEqual(len(response.data["results"]), expected)
                self.assertEqual(response.data["count"], 13)

    def test_empty_page_size_means_the_default(self):
        response = self.client.get(LIST_URL, {"page_size": ""})

        self.assertEqual(len(response.data["results"]), 12)

    def test_invalid_page_size_is_rejected(self):
        for value in ["abc", "0", "-1", "1.5", "101", "1_0"]:
            with self.subTest(page_size=value):
                response = self.client.get(LIST_URL, {"page_size": value})

                self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
                self.assertIn("page_size", response.data)

    def test_page_out_of_range_is_not_found(self):
        for value in ["999", "3", "0", "abc", "last"]:
            with self.subTest(page=value):
                response = self.client.get(LIST_URL, {"page": value})

                self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
                self.assertEqual(response.data, {"detail": "Invalid page."})


class BookOrderTests(OwnBooksTestCase):
    def collect_ids(self, page_size, pages):
        ids = []
        for page in range(1, pages + 1):
            response = self.client.get(LIST_URL, {"page": page, "page_size": page_size})
            ids += [book["id"] for book in response.data["results"]]
        return ids

    def test_titles_sort_ignoring_case(self):
        for title in ["cherry", "Banana", "apple"]:
            create_book(title, self.author, self.genre)

        response = self.client.get(LIST_URL)

        self.assertEqual(
            [book["title"] for book in response.data["results"]],
            ["apple", "Banana", "cherry"],
        )

    def test_equal_titles_keep_id_order_across_pages(self):
        # Created out of case order, so only the id tiebreaker gives this order.
        books = [
            create_book(title, self.author, self.genre)
            for title in ["echo", "ECHO", "Echo", "eCHO", "EcHo"]
        ]

        self.assertEqual(
            self.collect_ids(page_size=2, pages=3), [book.pk for book in books]
        )


class BookQueryCountTests(APITestCase):
    def test_list_takes_as_many_queries_for_3_books_as_for_30(self):
        for page_size in (3, 30):
            with self.subTest(page_size=page_size), self.assertNumQueries(2):
                response = self.client.get(LIST_URL, {"page_size": page_size})

                self.assertEqual(len(response.data["results"]), page_size)
