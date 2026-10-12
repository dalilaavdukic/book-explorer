from django.urls import path

from .views import (
    AuthorDetailView,
    AuthorListView,
    BookDetailView,
    BookListView,
    GenreListView,
)

urlpatterns = [
    path("books/", BookListView.as_view(), name="book-list"),
    path("books/<int:pk>/", BookDetailView.as_view(), name="book-detail"),
    path("authors/", AuthorListView.as_view(), name="author-list"),
    path("authors/<int:pk>/", AuthorDetailView.as_view(), name="author-detail"),
    path("genres/", GenreListView.as_view(), name="genre-list"),
]
