from django.db import models
from rest_framework import serializers

from .models import Note


class JsonStringField(serializers.CharField):
    """Accepts only a JSON string, where DRF would turn a number into text."""

    def to_internal_value(self, data):
        if not isinstance(data, str):
            self.fail("invalid")
        return super().to_internal_value(data)


class JsonIntegerField(serializers.IntegerField):
    """Accepts only a JSON integer, where DRF would also take "5" and 1.0."""

    def to_internal_value(self, data):
        if not isinstance(data, int) or isinstance(data, bool):
            self.fail("invalid")
        return super().to_internal_value(data)


class NoteSerializer(serializers.ModelSerializer):
    serializer_field_mapping = {
        **serializers.ModelSerializer.serializer_field_mapping,
        models.TextField: JsonStringField,
        models.PositiveSmallIntegerField: JsonIntegerField,
    }

    class Meta:
        model = Note
        fields = ["id", "body", "page", "created_at", "edited_at"]
        read_only_fields = ["id", "created_at", "edited_at"]


class DetailSerializer(serializers.Serializer):
    detail = serializers.CharField()
