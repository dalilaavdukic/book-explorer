from django.shortcuts import get_object_or_404
from drf_spectacular.utils import extend_schema, extend_schema_view
from rest_framework import generics, status

from catalog.models import Book
from config.pagination import StrictPageNumberPagination

from .models import Note
from .serializers import DetailSerializer, NoteSerializer

ERRORS = {
    status.HTTP_401_UNAUTHORIZED: DetailSerializer,
    status.HTTP_404_NOT_FOUND: DetailSerializer,
}


class NotePagination(StrictPageNumberPagination):
    page_size = 20


# Tagged "notes" so Swagger UI groups them with the other note operations,
# not under "books" as their path would.
@extend_schema_view(
    get=extend_schema(
        tags=["notes"], responses={status.HTTP_200_OK: NoteSerializer, **ERRORS}
    ),
    post=extend_schema(
        tags=["notes"], responses={status.HTTP_201_CREATED: NoteSerializer, **ERRORS}
    ),
)
class BookNoteListView(generics.ListCreateAPIView):
    serializer_class = NoteSerializer
    pagination_class = NotePagination

    def initial(self, request, *args, **kwargs):
        super().initial(request, *args, **kwargs)
        # After the authentication and permission checks, so a visitor gets 401
        # first, and before the body is validated, so an unknown book gets 404
        # even when the body is invalid (AC-N8).
        self.book = get_object_or_404(Book, pk=self.kwargs["book_id"])

    def get_queryset(self):
        return Note.objects.filter(user=self.request.user, book=self.book).order_by(
            "-created_at", "-id"
        )

    def perform_create(self, serializer):
        serializer.save(user=self.request.user, book=self.book)


@extend_schema_view(
    get=extend_schema(responses={status.HTTP_200_OK: NoteSerializer, **ERRORS}),
    patch=extend_schema(responses={status.HTTP_200_OK: NoteSerializer, **ERRORS}),
    delete=extend_schema(responses={status.HTTP_204_NO_CONTENT: None, **ERRORS}),
)
class NoteDetailView(generics.RetrieveUpdateDestroyAPIView):
    serializer_class = NoteSerializer
    http_method_names = ["get", "patch", "delete", "head", "options"]

    def get_queryset(self):
        # Another reader's note is simply not found: a 404 like a missing note.
        return Note.objects.filter(user=self.request.user)
