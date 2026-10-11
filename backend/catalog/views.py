from django.db.models.functions import Lower
from rest_framework import generics
from rest_framework.permissions import AllowAny

from config.pagination import StrictPageNumberPagination

from .models import Book
from .serializers import BookDetailSerializer, BookSerializer


class BookPagination(StrictPageNumberPagination):
    page_size = 12


class BookListView(generics.ListAPIView):
    permission_classes = [AllowAny]
    serializer_class = BookSerializer
    pagination_class = BookPagination
    queryset = Book.objects.select_related("author", "genre").order_by(
        Lower("title"), "id"
    )


class BookDetailView(generics.RetrieveAPIView):
    permission_classes = [AllowAny]
    serializer_class = BookDetailSerializer
    queryset = Book.objects.select_related("author", "genre")
