from django.conf import settings
from django.core.validators import MaxValueValidator, MinValueValidator
from django.db import models
from django.db.models import Q
from django.utils import timezone

from catalog.models import Book


class Note(models.Model):
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="notes"
    )
    book = models.ForeignKey(Book, on_delete=models.PROTECT, related_name="notes")
    body = models.TextField(max_length=5000)
    page = models.PositiveSmallIntegerField(
        null=True,
        blank=True,
        validators=[MinValueValidator(1), MaxValueValidator(10000)],
    )
    created_at = models.DateTimeField(auto_now_add=True)
    edited_at = models.DateTimeField(null=True, editable=False)

    class Meta:
        constraints = [
            models.CheckConstraint(
                condition=Q(page__isnull=True) | Q(page__gte=1, page__lte=10000),
                name="note_page_in_range",
            ),
            models.CheckConstraint(condition=~Q(body=""), name="note_body_not_empty"),
        ]
        indexes = [
            models.Index(
                fields=["user", "book", "created_at"], name="note_user_book_created"
            ),
        ]

    def __str__(self):
        # No related lookups: the admin's delete pages list a book's or a
        # reader's notes by this, which would otherwise be a query per note.
        return f"Note {self.pk}"

    def save(self, *args, **kwargs):
        if not self._state.adding:
            # Compared with the stored row, not a snapshot taken on load, which
            # would go stale after refresh_from_db().
            stored = Note.objects.filter(pk=self.pk).values("body", "page").first()
            # Deleted since it was loaded: Django would insert it again.
            if stored is None:
                raise Note.DoesNotExist("The note was deleted.")
            if (stored["body"], stored["page"]) != (self.body, self.page):
                self.edited_at = timezone.now()
            # A deletion after the check above then fails the save instead.
            kwargs["force_update"] = True
        super().save(*args, **kwargs)
