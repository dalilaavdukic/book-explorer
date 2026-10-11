from django.db import connection
from django.db.migrations.executor import MigrationExecutor
from django.db.models import Count
from django.test import TestCase, TransactionTestCase

from accounts.models import User
from catalog.models import Author, Book, Genre
from notes.models import Note


def migrate(targets=None):
    executor = MigrationExecutor(connection)
    executor.migrate(targets or executor.loader.graph.leaf_nodes())


class SeedDataTests(TestCase):
    def test_migrations_produce_the_documented_catalog(self):
        self.assertEqual(Book.objects.count(), 100)
        self.assertEqual(Author.objects.count(), 50)
        self.assertEqual(Genre.objects.count(), 12)

    def test_seeded_values(self):
        book = Book.objects.select_related("author", "genre").get(
            title="Nineteen Eighty-Four"
        )

        self.assertEqual(book.author.name, "George Orwell")
        self.assertEqual(book.author.sort_name, "Orwell, George")
        self.assertEqual(book.publication_year, 1949)
        self.assertEqual(book.genre.name, "Dystopian")
        self.assertEqual(
            Author.objects.get(name="Gabriel García Márquez").sort_name,
            "García Márquez, Gabriel",
        )

    def test_every_author_has_a_sort_key_and_every_book_a_description(self):
        for sort_name in Author.objects.values_list("sort_name", flat=True):
            self.assertTrue(sort_name.strip())
        for description in Book.objects.values_list("description", flat=True):
            self.assertTrue(description.strip())

    def test_several_authors_have_more_than_one_book(self):
        authors = Author.objects.annotate(book_count=Count("books"))

        self.assertEqual(authors.filter(book_count__gt=1).count(), 31)


# The SQLite schema editor can't run inside a test transaction, and
# serialized_rollback restores the seeded rows for the test.
class SeedRollbackTests(TransactionTestCase):
    serialized_rollback = True

    def test_rollback_removes_only_seeded_data_and_reapplying_reuses_the_rest(self):
        orwell = Author.objects.get(name="George Orwell")
        dystopian = Genre.objects.get(name="Dystopian")
        book = Book.objects.create(
            title="A Book Added Through Admin",
            author=orwell,
            genre=dystopian,
            publication_year=2000,
            description="Not part of the seed.",
        )
        reader = User.objects.create_user(username="reader", password="reader-pass")
        Note.objects.create(user=reader, book=book, body="Dropped with the table.")
        self.addCleanup(migrate)

        migrate([("catalog", "0001_initial")])

        # The notes migration depends on the seed, so it's rolled back first.
        self.assertNotIn("notes_note", connection.introspection.table_names())

        self.assertEqual(
            list(Book.objects.values_list("title", flat=True)),
            ["A Book Added Through Admin"],
        )
        self.assertEqual(
            list(Author.objects.values_list("name", flat=True)), ["George Orwell"]
        )
        self.assertEqual(
            list(Genre.objects.values_list("name", flat=True)), ["Dystopian"]
        )

        migrate()

        self.assertEqual(Book.objects.count(), 101)
        self.assertEqual(Author.objects.get(name="George Orwell").pk, orwell.pk)
        self.assertEqual(Genre.objects.get(name="Dystopian").pk, dystopian.pk)
        self.assertEqual(Note.objects.count(), 0)
        self.assertTrue(User.objects.filter(pk=reader.pk).exists())
