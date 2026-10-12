from catalog.models import Author, Book, Genre


def create_books(*titles):
    """Creates the test's own books, so the notes tests don't rely on the seed."""
    author = Author.objects.create(name="Test Author", sort_name="Author, Test")
    genre = Genre.objects.create(name="Test Genre")
    return [
        Book.objects.create(
            title=title,
            author=author,
            genre=genre,
            publication_year=2000,
            description=f"About {title}.",
        )
        for title in titles
    ]
