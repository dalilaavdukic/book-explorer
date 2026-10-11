from django.db import models


class Author(models.Model):
    name = models.CharField(max_length=200, unique=True)
    sort_name = models.CharField(max_length=200)

    def __str__(self):
        return self.name


class Genre(models.Model):
    name = models.CharField(max_length=100, unique=True)

    def __str__(self):
        return self.name


class Book(models.Model):
    title = models.CharField(max_length=255)
    author = models.ForeignKey(Author, on_delete=models.PROTECT, related_name="books")
    genre = models.ForeignKey(Genre, on_delete=models.PROTECT, related_name="books")
    publication_year = models.PositiveSmallIntegerField()
    description = models.TextField()

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["title", "author"], name="unique_book_title_per_author"
            ),
        ]

    def __str__(self):
        return self.title
