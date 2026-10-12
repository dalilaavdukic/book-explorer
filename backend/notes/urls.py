from django.urls import path

from .views import BookNoteListView, NoteDetailView

urlpatterns = [
    path("books/<int:book_id>/notes/", BookNoteListView.as_view(), name="book-notes"),
    path("notes/<int:pk>/", NoteDetailView.as_view(), name="note-detail"),
]
