from rest_framework import generics
from rest_framework.permissions import AllowAny

from config.pagination import StrictPageNumberPagination

from .filters import BOOK_ORDERINGS, BookFilter
from .models import Book
from .serializers import BookDetailSerializer, BookSerializer


class BookPagination(StrictPageNumberPagination):
    page_size = 12


class BookListView(generics.ListAPIView):
    permission_classes = [AllowAny]
    serializer_class = BookSerializer
    pagination_class = BookPagination
    filterset_class = BookFilter
    queryset = Book.objects.select_related("author", "genre").order_by(
        *BOOK_ORDERINGS["title"]
    )


class BookDetailView(generics.RetrieveAPIView):
    permission_classes = [AllowAny]
    serializer_class = BookDetailSerializer
    queryset = Book.objects.select_related("author", "genre")
