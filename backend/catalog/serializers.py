from rest_framework import serializers

from .models import Author, Book, Genre


class AuthorSerializer(serializers.ModelSerializer):
    class Meta:
        model = Author
        fields = ["id", "name"]


class GenreSerializer(serializers.ModelSerializer):
    class Meta:
        model = Genre
        fields = ["id", "name"]


class BookSerializer(serializers.ModelSerializer):
    author = AuthorSerializer()
    genre = GenreSerializer()

    class Meta:
        model = Book
        fields = ["id", "title", "author", "genre", "publication_year"]


class BookDetailSerializer(BookSerializer):
    class Meta(BookSerializer.Meta):
        fields = [*BookSerializer.Meta.fields, "description"]
