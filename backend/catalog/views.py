import re

from django.db.models import Exists, OuterRef
from django.db.models.functions import Lower
from drf_spectacular.utils import OpenApiParameter, extend_schema
from rest_framework import generics, status
from rest_framework.exceptions import ValidationError
from rest_framework.permissions import AllowAny

from config.pagination import StrictPageNumberPagination
from config.schema import NOT_LOGGED_IN, detail_error, invalid_parameters

from .filters import BOOK_ORDERINGS, AuthorFilter, BookFilter
from .models import Author, Book, Genre
from .serializers import (
    AuthorSerializer,
    BookDetailSerializer,
    BookSerializer,
    GenreSerializer,
)

DEFAULT_AUTHOR_LIMIT = 10
MAX_AUTHOR_LIMIT = 20


class BookPagination(StrictPageNumberPagination):
    page_size = 12


@extend_schema(
    responses={
        status.HTTP_200_OK: BookSerializer,
        status.HTTP_400_BAD_REQUEST: invalid_parameters(
            "A query parameter is invalid."
        ),
        status.HTTP_401_UNAUTHORIZED: NOT_LOGGED_IN,
        status.HTTP_404_NOT_FOUND: detail_error("The page is past the last one."),
    }
)
class BookListView(generics.ListAPIView):
    permission_classes = [AllowAny]
    serializer_class = BookSerializer
    pagination_class = BookPagination
    filterset_class = BookFilter
    queryset = Book.objects.select_related("author", "genre").order_by(
        *BOOK_ORDERINGS["title"]
    )


@extend_schema(
    responses={
        status.HTTP_200_OK: BookDetailSerializer,
        status.HTTP_404_NOT_FOUND: detail_error("No such book."),
    }
)
class BookDetailView(generics.RetrieveAPIView):
    permission_classes = [AllowAny]
    serializer_class = BookDetailSerializer
    queryset = Book.objects.select_related("author", "genre")


@extend_schema(
    parameters=[
        OpenApiParameter(
            "limit",
            {
                "type": "integer",
                "minimum": 1,
                "maximum": MAX_AUTHOR_LIMIT,
                "default": DEFAULT_AUTHOR_LIMIT,
            },
            description="The maximum number of suggestions.",
        )
    ],
    responses={
        status.HTTP_200_OK: AuthorSerializer,
        status.HTTP_400_BAD_REQUEST: invalid_parameters(
            "`search` or `limit` is invalid."
        ),
    },
)
class AuthorListView(generics.ListAPIView):
    permission_classes = [AllowAny]
    serializer_class = AuthorSerializer
    filterset_class = AuthorFilter
    queryset = Author.objects.filter(
        Exists(Book.objects.filter(author=OuterRef("pk")))
    ).order_by(Lower("sort_name"), "id")

    def filter_queryset(self, queryset):
        return super().filter_queryset(queryset)[: self.get_limit()]

    def get_limit(self):
        value = self.request.query_params.get("limit", "")
        if value == "":
            return DEFAULT_AUTHOR_LIMIT
        # Capping the length before int() avoids Python's 4,300-digit limit,
        # whose ValueError would be a 500.
        if not re.fullmatch(r"[0-9]{1,2}", value) or not (
            1 <= int(value) <= MAX_AUTHOR_LIMIT
        ):
            raise ValidationError(
                {"limit": [f"Enter a whole number from 1 to {MAX_AUTHOR_LIMIT}."]}
            )
        return int(value)


@extend_schema(
    responses={
        status.HTTP_200_OK: AuthorSerializer,
        status.HTTP_404_NOT_FOUND: detail_error("No such author."),
    }
)
class AuthorDetailView(generics.RetrieveAPIView):
    permission_classes = [AllowAny]
    serializer_class = AuthorSerializer
    queryset = Author.objects.all()


class GenreListView(generics.ListAPIView):
    permission_classes = [AllowAny]
    serializer_class = GenreSerializer
    queryset = Genre.objects.filter(
        Exists(Book.objects.filter(genre=OuterRef("pk")))
    ).order_by(Lower("name"), "id")
