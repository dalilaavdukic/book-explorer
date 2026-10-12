from django.contrib import admin

from .models import Note


@admin.register(Note)
class NoteAdmin(admin.ModelAdmin):
    list_display = ["user", "book", "page", "created_at", "edited_at"]
    list_select_related = ["user", "book"]
    search_fields = ["body", "book__title", "user__username"]
    ordering = ["-created_at"]
    readonly_fields = ["created_at", "edited_at"]

    def get_readonly_fields(self, request, obj=None):
        # A note never changes owner or book once it exists (spec §5.5).
        if obj is not None:
            return [*self.readonly_fields, "user", "book"]
        return self.readonly_fields
