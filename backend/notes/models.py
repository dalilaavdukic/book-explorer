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
        return f"Note {self.pk} by {self.user} on {self.book}"

    def save(self, *args, **kwargs):
        # Compared with the stored row, not a snapshot taken on load, which would
        # go stale after refresh_from_db().
        if not self._state.adding:
            stored = Note.objects.filter(pk=self.pk).values("body", "page").first()
            if stored and (stored["body"], stored["page"]) != (self.body, self.page):
                self.edited_at = timezone.now()
        super().save(*args, **kwargs)
