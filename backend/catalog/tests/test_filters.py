from rest_framework import status

from catalog.models import Author, Genre
from catalog.tests import OwnBooksTestCase, create_book

LIST_URL = "/api/books/"


class FilterTestCase(OwnBooksTestCase):
    """Several authors and genres, with titles in mixed case."""

    @classmethod
    def setUpTestData(cls):
        super().setUpTestData()
        cls.tolkien = Author.objects.create(
            name="J. R. R. Tolkien", sort_name="Tolkien, J. R. R."
        )
        cls.herbert = Author.objects.create(
            name="Frank Herbert", sort_name="Herbert, Frank"
        )
        cls.du_maurier = Author.objects.create(
            name="Daphne du Maurier", sort_name="du Maurier, Daphne"
        )
        cls.fantasy = Genre.objects.create(name="Fantasy")
        cls.science_fiction = Genre.objects.create(name="Science fiction")
        cls.mystery = Genre.objects.create(name="Mystery")
        create_book("The Hobbit", cls.tolkien, cls.fantasy, 1937)
        create_book("the Silmarillion", cls.tolkien, cls.fantasy, 1977)
        create_book("Dune", cls.herbert, cls.science_fiction, 1965)
        create_book("dune Messiah", cls.herbert, cls.science_fiction, 1969)
        create_book("Rebecca", cls.du_maurier, cls.mystery, 1938)

    def titles(self, params):
        response = self.client.get(LIST_URL, params)

        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        return [book["title"] for book in response.data["results"]]

    def assert_rejected(self, params, parameter):
        response = self.client.get(LIST_URL, params)

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(list(response.data), [parameter])


ALL_TITLES = ["Dune", "dune Messiah", "Rebecca", "The Hobbit", "the Silmarillion"]


class SearchTests(FilterTestCase):
    def test_a_word_matches_the_title_or_the_author(self):
        self.assertEqual(self.titles({"search": "rebecca"}), ["Rebecca"])
        self.assertEqual(self.titles({"search": "herbert"}), ["Dune", "dune Messiah"])

    def test_matches_are_partial_and_ignore_case(self):
        for search, expected in [
            ("HOBB", ["The Hobbit"]),
            ("maur", ["Rebecca"]),
            ("DUNE", ["Dune", "dune Messiah"]),
        ]:
            with self.subTest(search=search):
                self.assertEqual(self.titles({"search": search}), expected)

    def test_every_word_must_match_in_the_title_or_the_author(self):
        for search, expected in [
            ("tolkien hobbit", ["The Hobbit"]),
            ("messiah dune", ["dune Messiah"]),
            ("herbert hobbit", []),
        ]:
            with self.subTest(search=search):
                self.assertEqual(self.titles({"search": search}), expected)

    def test_words_are_split_on_any_whitespace(self):
        for search in ["tolkien\thobbit", "tolkien\nhobbit", " tolkien \r\n hobbit "]:
            with self.subTest(search=search):
                self.assertEqual(self.titles({"search": search}), ["The Hobbit"])

    def test_wildcards_and_quotes_match_literally(self):
        for title in [
            "100% Wolf",
            "1000 Wolves",
            "snake_case",
            "snakeXcase",
            'The "Quoted" Book',
            "Don't Panic",
            "Dont Panic",
        ]:
            create_book(title, self.author, self.genre)

        for search, expected in [
            ("100%", ["100% Wolf"]),
            ("snake_case", ["snake_case"]),
            ('"quoted"', ['The "Quoted" Book']),
            ("don't", ["Don't Panic"]),
        ]:
            with self.subTest(search=search):
                self.assertEqual(self.titles({"search": search}), expected)

    def test_empty_or_blank_search_means_no_search(self):
        for search in ["", "   ", "\t\n"]:
            with self.subTest(search=search):
                self.assertEqual(self.titles({"search": search}), ALL_TITLES)

    def test_search_up_to_100_characters_after_trimming(self):
        for search in ["a" * 100, f"  {'a' * 100}  "]:
            with self.subTest(length=len(search)):
                self.assertEqual(self.titles({"search": search}), [])

        self.assert_rejected({"search": "a" * 101}, "search")


class AuthorFilterTests(FilterTestCase):
    def test_only_books_by_the_author(self):
        self.assertEqual(
            self.titles({"author": self.herbert.pk}), ["Dune", "dune Messiah"]
        )

    def test_empty_author_means_no_filter(self):
        self.assertEqual(self.titles({"author": ""}), ALL_TITLES)

    def test_invalid_or_unknown_author_is_rejected(self):
        for value in ["abc", "999999", "9" * 20, "1" * 4301]:
            with self.subTest(author=value[:25]):
                self.assert_rejected({"author": value}, "author")


class GenreFilterTests(FilterTestCase):
    def test_only_books_in_the_genre(self):
        self.assertEqual(
            self.titles({"genre": self.fantasy.pk}), ["The Hobbit", "the Silmarillion"]
        )

    def test_several_genres_combine_with_or(self):
        self.assertEqual(
            self.titles({"genre": [self.mystery.pk, self.fantasy.pk]}),
            ["Rebecca", "The Hobbit", "the Silmarillion"],
        )

    def test_a_repeated_genre_changes_nothing(self):
        self.assertEqual(
            self.titles({"genre": [self.fantasy.pk, self.fantasy.pk]}),
            ["The Hobbit", "the Silmarillion"],
        )

    def test_empty_genre_is_ignored(self):
        self.assertEqual(self.titles({"genre": ""}), ALL_TITLES)
        self.assertEqual(
            self.titles({"genre": ["", self.fantasy.pk]}),
            ["The Hobbit", "the Silmarillion"],
        )

    def test_invalid_or_unknown_genre_is_rejected(self):
        # The last two are beyond SQLite's integer range, and Python's limit
        # for converting a string to an int.
        for value in ["abc", "999999", "-1", "9" * 20, "1" * 4301]:
            with self.subTest(genre=value[:25]):
                self.assert_rejected({"genre": [self.fantasy.pk, value]}, "genre")


class CombinedFilterTests(FilterTestCase):
    def test_search_author_genres_and_sort_together(self):
        create_book("The Dune Encyclopedia", self.tolkien, self.science_fiction, 1984)
        create_book("Children of Dune", self.herbert, self.mystery, 1976)
        create_book("The Dosadi Experiment", self.herbert, self.science_fiction, 1977)
        create_book("Dune: House Atreides", self.herbert, self.fantasy, 1999)

        titles = self.titles(
            {
                "search": "dune",
                "author": self.herbert.pk,
                "genre": [self.science_fiction.pk, self.fantasy.pk],
                "sort": "-year",
            }
        )

        self.assertEqual(titles, ["Dune: House Atreides", "dune Messiah", "Dune"])


class SortTests(OwnBooksTestCase):
    @classmethod
    def setUpTestData(cls):
        super().setUpTestData()
        christie = Author.objects.create(
            name="Agatha Christie", sort_name="Christie, Agatha"
        )
        du_maurier = Author.objects.create(
            name="Daphne du Maurier", sort_name="du Maurier, Daphne"
        )
        eco = Author.objects.create(name="Umberto Eco", sort_name="Eco, Umberto")
        # Created out of every expected order, so only the sort can produce it.
        cls.rose = create_book("The Name of the Rose", eco, cls.genre, 1980)
        cls.eco_stories = create_book("Collected Stories", eco, cls.genre, 1950)
        cls.rebecca = create_book("rebecca", du_maurier, cls.genre, 1938)
        cls.baudolino = create_book("Baudolino", eco, cls.genre, 1938)
        cls.christie_stories = create_book(
            "Collected Stories", christie, cls.genre, 1950
        )
        cls.orient = create_book(
            "Murder on the Orient Express", christie, cls.genre, 1934
        )
        cls.jamaica = create_book("Jamaica Inn", du_maurier, cls.genre, 1936)
        cls.none = create_book("And Then There Were None", christie, cls.genre, 1939)

    def ids(self, params):
        response = self.client.get(LIST_URL, params)

        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        return [book["id"] for book in response.data["results"]]

    def test_each_sort_ignores_case_and_breaks_ties_by_title_then_id(self):
        by_title = [
            self.none,
            self.baudolino,
            self.eco_stories,
            self.christie_stories,
            self.jamaica,
            self.orient,
            self.rebecca,
            self.rose,
        ]
        expected = {
            "title": by_title,
            "-title": [
                self.rose,
                self.rebecca,
                self.orient,
                self.jamaica,
                self.eco_stories,
                self.christie_stories,
                self.baudolino,
                self.none,
            ],
            "author": [
                self.none,
                self.christie_stories,
                self.orient,
                self.jamaica,
                self.rebecca,
                self.baudolino,
                self.eco_stories,
                self.rose,
            ],
            "-author": [
                self.baudolino,
                self.eco_stories,
                self.rose,
                self.jamaica,
                self.rebecca,
                self.none,
                self.christie_stories,
                self.orient,
            ],
            "year": [
                self.orient,
                self.jamaica,
                self.baudolino,
                self.rebecca,
                self.none,
                self.eco_stories,
                self.christie_stories,
                self.rose,
            ],
            "-year": [
                self.rose,
                self.eco_stories,
                self.christie_stories,
                self.none,
                self.baudolino,
                self.rebecca,
                self.jamaica,
                self.orient,
            ],
        }
        for sort, books in expected.items():
            with self.subTest(sort=sort):
                self.assertEqual(self.ids({"sort": sort}), [book.pk for book in books])

    def test_missing_or_empty_sort_is_by_title(self):
        by_title = self.ids({"sort": "title"})

        self.assertEqual(self.ids({}), by_title)
        self.assertEqual(self.ids({"sort": ""}), by_title)

    def test_unknown_sort_is_rejected(self):
        for value in ["banana", "Title", "title,year"]:
            with self.subTest(sort=value):
                response = self.client.get(LIST_URL, {"sort": value})

                self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
                self.assertEqual(list(response.data), ["sort"])


class SortTiesAcrossPagesTests(OwnBooksTestCase):
    @classmethod
    def setUpTestData(cls):
        super().setUpTestData()
        other = Author.objects.create(name="Other Author", sort_name="Other, Author")
        # Every book has the same author or year as another one, and two share
        # a title.
        for title in ["echo", "Delta", "alpha", "Charlie", "bravo", "foxtrot"]:
            create_book(title, cls.author, cls.genre, year=2000)
        create_book("alpha", other, cls.genre, year=2000)

    def test_tied_books_appear_once_each_across_pages(self):
        for sort in ["author", "-author", "year", "-year"]:
            with self.subTest(sort=sort):
                ids = []
                for page in range(1, 5):
                    response = self.client.get(
                        LIST_URL, {"sort": sort, "page": page, "page_size": 2}
                    )
                    ids += [book["id"] for book in response.data["results"]]
                one_page = self.client.get(LIST_URL, {"sort": sort, "page_size": 7})

                self.assertEqual(ids, [book["id"] for book in one_page.data["results"]])
                self.assertEqual(len(set(ids)), 7)


class InvalidParameterTests(FilterTestCase):
    def test_each_bad_parameter_gets_a_message_in_one_response(self):
        response = self.client.get(LIST_URL, {"sort": "banana", "genre": "abc"})

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(set(response.data), {"sort", "genre"})

    def test_unknown_parameters_are_ignored(self):
        self.assertEqual(self.titles({"utm_source": "newsletter"}), ALL_TITLES)
