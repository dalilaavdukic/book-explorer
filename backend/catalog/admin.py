from django.contrib import admin

from .models import Author, Book, Genre


@admin.register(Book)
class BookAdmin(admin.ModelAdmin):
    list_display = ["title", "author", "genre", "publication_year"]
    list_filter = ["genre"]
    list_select_related = ["author", "genre"]
    search_fields = ["title", "author__name"]
    ordering = ["title"]


@admin.register(Author)
class AuthorAdmin(admin.ModelAdmin):
    list_display = ["name", "sort_name"]
    search_fields = ["name"]
    ordering = ["sort_name"]


@admin.register(Genre)
class GenreAdmin(admin.ModelAdmin):
    search_fields = ["name"]
    ordering = ["name"]
