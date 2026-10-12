import re

from django.core.exceptions import ValidationError
from django.db.models import Q
from django.db.models.functions import Lower
from django_filters import fields
from django_filters import rest_framework as filters

from .models import Author, Genre

BOOK_ORDERINGS = {
    "title": (Lower("title"), "id"),
    "-title": (Lower("title").desc(), "id"),
    "author": (Lower("author__sort_name"), Lower("title"), "id"),
    "-author": (Lower("author__sort_name").desc(), Lower("title"), "id"),
    "year": ("publication_year", Lower("title"), "id"),
    "-year": ("-publication_year", Lower("title"), "id"),
}


class IdMultipleChoiceField(fields.ModelMultipleChoiceField):
    def clean(self, value):
        value = [pk for pk in value or () if pk != ""]
        for pk in value:
            # Django looks the ids up with an `in` lookup, which isn't guarded
            # against SQLite's integer overflow, so a longer id would be a 500.
            if not re.fullmatch(r"[0-9]{1,18}", pk):
                raise ValidationError(
                    self.error_messages["invalid_pk_value"],
                    code="invalid_pk_value",
                    params={"pk": pk},
                )
        return super().clean(value)


class IdMultipleChoiceFilter(filters.ModelMultipleChoiceFilter):
    field_class = IdMultipleChoiceField


class BookFilter(filters.FilterSet):
    search = filters.CharFilter(
        max_length=100,
        method="filter_search",
        help_text="Words that must all appear in the title or the author's name.",
    )
    author = filters.ModelChoiceFilter(
        queryset=Author.objects.all(), help_text="Only books by this author."
    )
    genre = IdMultipleChoiceFilter(
        queryset=Genre.objects.all(),
        distinct=False,
        help_text="Only books in any of these genres. Repeat for several.",
    )
    sort = filters.ChoiceFilter(
        choices=[(value, value) for value in BOOK_ORDERINGS],
        method="filter_sort",
        help_text="The order of the list, `title` by default. A leading `-` "
        "means descending. Ties are broken by title, then id.",
    )

    def filter_search(self, queryset, name, value):
        for word in value.split():
            queryset = queryset.filter(
                Q(title__icontains=word) | Q(author__name__icontains=word)
            )
        return queryset

    def filter_sort(self, queryset, name, value):
        return queryset.order_by(*BOOK_ORDERINGS[value])
