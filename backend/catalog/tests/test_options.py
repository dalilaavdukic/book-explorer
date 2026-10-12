from rest_framework import status

from catalog.models import Author, Genre
from catalog.tests import OwnBooksTestCase, create_book

AUTHORS_URL = "/api/authors/"
GENRES_URL = "/api/genres/"


def author_url(pk):
    return f"/api/authors/{pk}/"


# In the expected order. "du Maurier" sorts among the D's only if case is ignored.
SORT_NAMES = [
    "Austen, Jane",
    "Bradbury, Ray",
    "Christie, Agatha",
    "du Maurier, Daphne",
    "Eco, Umberto",
    "Fitzgerald, F. Scott",
    "Gaiman, Neil",
    "Herbert, Frank",
    "Ishiguro, Kazuo",
    "James, Henry",
    "Kafka, Franz",
    "Le Guin, Ursula K.",
]


def name_from(sort_name):
    surname, _, given = sort_name.partition(", ")
    return f"{given} {surname}"


class AuthorSuggestionTests(OwnBooksTestCase):
    @classmethod
    def setUpTestData(cls):
        super().setUpTestData()
        # Created in reverse, so the limit must apply after ordering. The
        # inherited test author has no books.
        for sort_name in reversed(SORT_NAMES):
            author = Author.objects.create(
                name=name_from(sort_name), sort_name=sort_name
            )
            create_book(f"A Book by {author.name}", author, cls.genre)

    def suggestions(self, params):
        response = self.client.get(AUTHORS_URL, params)

        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        return [author["name"] for author in response.data]

    def test_first_ten_authors_with_books_by_sort_name(self):
        self.assertEqual(
            self.suggestions({}), [name_from(name) for name in SORT_NAMES[:10]]
        )

    def test_limit_from_1_to_20(self):
        for limit, expected in [(1, 1), (12, 12), (20, 12)]:
            with self.subTest(limit=limit):
                self.assertEqual(len(self.suggestions({"limit": limit})), expected)

    def test_empty_limit_means_10(self):
        self.assertEqual(len(self.suggestions({"limit": ""})), 10)

    def test_search_is_partial_and_ignores_case(self):
        for search, expected in [
            ("GAI", ["Neil Gaiman"]),
            ("an", ["Jane Austen", "Neil Gaiman", "Frank Herbert", "Franz Kafka"]),
            ("  maurier  ", ["Daphne du Maurier"]),
            ("zzz", []),
        ]:
            with self.subTest(search=search):
                self.assertEqual(self.suggestions({"search": search}), expected)

    def test_equal_sort_names_ignoring_case_keep_id_order(self):
        # Created so that a case-sensitive sort would reverse them.
        first = Author.objects.create(name="John Smith", sort_name="Smith, John")
        second = Author.objects.create(name="JOHN SMITH", sort_name="SMITH, JOHN")
        for author in (first, second):
            create_book("A Book", author, self.genre)

        response = self.client.get(AUTHORS_URL, {"search": "smith"})

        self.assertEqual(
            [author["id"] for author in response.data], [first.pk, second.pk]
        )

    def test_wildcards_match_literally(self):
        for name in ["Ann_Lee", "AnnXLee", "50% Smith", "500 Smith"]:
            author = Author.objects.create(name=name, sort_name=name)
            create_book("A Book", author, self.genre)

        for search, expected in [("n_l", ["Ann_Lee"]), ("50%", ["50% Smith"])]:
            with self.subTest(search=search):
                self.assertEqual(self.suggestions({"search": search}), expected)

    def test_response_is_a_plain_list_of_id_and_name(self):
        gaiman = Author.objects.get(name="Neil Gaiman")

        response = self.client.get(AUTHORS_URL, {"search": "gaiman"})

        self.assertEqual(response.data, [{"id": gaiman.pk, "name": "Neil Gaiman"}])

    def test_invalid_limit_is_rejected(self):
        for value in ["0", "21", "-1", "1.5", "abc", "1" * 4301]:
            with self.subTest(limit=value[:25]):
                response = self.client.get(AUTHORS_URL, {"limit": value})

                self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
                self.assertEqual(list(response.data), ["limit"])

    def test_search_over_100_characters_is_rejected(self):
        response = self.client.get(AUTHORS_URL, {"search": "a" * 101})

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(list(response.data), ["search"])

    def test_unknown_parameters_are_ignored(self):
        self.assertEqual(
            self.suggestions({"utm_source": "newsletter"}), self.suggestions({})
        )


class AuthorDetailTests(OwnBooksTestCase):
    def test_any_existing_author_even_without_books(self):
        response = self.client.get(author_url(self.author.pk))

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data, {"id": self.author.pk, "name": "Test Author"})

    def test_unknown_author_is_not_found(self):
        # The second id is beyond SQLite's integer range.
        for pk in (self.author.pk + 1, 99999999999999999999):
            with self.subTest(pk=pk):
                response = self.client.get(author_url(pk))

                self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)


class GenreListTests(OwnBooksTestCase):
    def test_genres_with_books_by_name_ignoring_case(self):
        # The inherited test genre has no books.
        Genre.objects.create(name="Biography")
        genres = [
            Genre.objects.create(name=name)
            for name in ["Mystery", "fantasy", "classics"]
        ]
        for genre in genres:
            create_book(f"A {genre.name} book", self.author, genre)

        response = self.client.get(GENRES_URL)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(
            response.data,
            [
                {"id": genre.pk, "name": genre.name}
                for genre in [genres[2], genres[1], genres[0]]
            ],
        )


class OptionEndpointAccessTests(OwnBooksTestCase):
    def test_public_and_read_only(self):
        for url in (AUTHORS_URL, author_url(self.author.pk), GENRES_URL):
            with self.subTest(url=url):
                self.assertEqual(self.client.get(url).status_code, status.HTTP_200_OK)
                self.assertEqual(
                    self.client.post(url, {"name": "New"}, format="json").status_code,
                    status.HTTP_405_METHOD_NOT_ALLOWED,
                )
