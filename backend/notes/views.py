from django.http import Http404
from django.shortcuts import get_object_or_404
from drf_spectacular.utils import extend_schema, extend_schema_view
from rest_framework import generics, status

from catalog.models import Book
from config.pagination import StrictPageNumberPagination
from config.schema import (
    CSRF_FAILED,
    NOT_LOGGED_IN,
    detail_error,
    invalid_body,
    invalid_parameters,
)

from .models import Note
from .serializers import NoteSerializer

NO_SUCH_NOTE = detail_error("No such note among the reader's own.")
INVALID_NOTE = invalid_body("A field is invalid, or the body isn't JSON.")


class NotePagination(StrictPageNumberPagination):
    page_size = 20


# Tagged "notes" so Swagger UI groups them with the other note operations,
# not under "books" as their path would.
@extend_schema_view(
    get=extend_schema(
        tags=["notes"],
        responses={
            status.HTTP_200_OK: NoteSerializer,
            status.HTTP_400_BAD_REQUEST: invalid_parameters("`page_size` is invalid."),
            status.HTTP_401_UNAUTHORIZED: NOT_LOGGED_IN,
            status.HTTP_404_NOT_FOUND: detail_error(
                "No such book, or the page is past the last one."
            ),
        },
    ),
    post=extend_schema(
        tags=["notes"],
        responses={
            status.HTTP_201_CREATED: NoteSerializer,
            status.HTTP_400_BAD_REQUEST: INVALID_NOTE,
            status.HTTP_401_UNAUTHORIZED: NOT_LOGGED_IN,
            status.HTTP_403_FORBIDDEN: CSRF_FAILED,
            status.HTTP_404_NOT_FOUND: detail_error("No such book."),
        },
    ),
)
class BookNoteListView(generics.ListCreateAPIView):
    serializer_class = NoteSerializer
    pagination_class = NotePagination
    # No filters, and drf-spectacular can't read the model without a request.
    filter_backends = []

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
    get=extend_schema(
        responses={
            status.HTTP_200_OK: NoteSerializer,
            status.HTTP_401_UNAUTHORIZED: NOT_LOGGED_IN,
            status.HTTP_404_NOT_FOUND: NO_SUCH_NOTE,
        }
    ),
    patch=extend_schema(
        responses={
            status.HTTP_200_OK: NoteSerializer,
            status.HTTP_400_BAD_REQUEST: INVALID_NOTE,
            status.HTTP_401_UNAUTHORIZED: NOT_LOGGED_IN,
            status.HTTP_403_FORBIDDEN: CSRF_FAILED,
            status.HTTP_404_NOT_FOUND: NO_SUCH_NOTE,
        }
    ),
    delete=extend_schema(
        responses={
            status.HTTP_204_NO_CONTENT: None,
            status.HTTP_401_UNAUTHORIZED: NOT_LOGGED_IN,
            status.HTTP_403_FORBIDDEN: CSRF_FAILED,
            status.HTTP_404_NOT_FOUND: NO_SUCH_NOTE,
        }
    ),
)
class NoteDetailView(generics.RetrieveUpdateDestroyAPIView):
    serializer_class = NoteSerializer
    http_method_names = ["get", "patch", "delete", "head", "options"]

    def get_queryset(self):
        # Another reader's note is simply not found: a 404 like a missing note.
        return Note.objects.filter(user=self.request.user)

    def perform_update(self, serializer):
        try:
            serializer.save()
        except Note.DoesNotExist:
            # Deleted after this request loaded it, e.g. from another tab.
            raise Http404("No Note matches the given query.") from None
