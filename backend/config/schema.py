"""Error responses for the OpenAPI schema, in DRF's shapes (arch §7.3)."""

from drf_spectacular.extensions import OpenApiSerializerExtension
from drf_spectacular.utils import OpenApiResponse, PolymorphicProxySerializer
from rest_framework import serializers


class DetailSerializer(serializers.Serializer):
    detail = serializers.CharField()


class ValidationErrorSerializer(serializers.Serializer):
    """A list of messages per invalid field, described by the extension below."""


class ValidationErrorExtension(OpenApiSerializerExtension):
    target_class = "config.schema.ValidationErrorSerializer"

    def map_serializer(self, auto_schema, direction):
        return {
            "type": "object",
            "description": "A list of messages for each invalid field, or "
            "`non_field_errors` for an error about the whole request.",
            "additionalProperties": {"type": "array", "items": {"type": "string"}},
        }


# A body that isn't valid JSON gets {"detail": …}, not field errors.
BadRequestSerializer = PolymorphicProxySerializer(
    component_name="BadRequest",
    serializers=[ValidationErrorSerializer, DetailSerializer],
    resource_type_field_name=None,
)


def detail_error(description):
    return OpenApiResponse(DetailSerializer, description=description)


def invalid_parameters(description):
    return OpenApiResponse(ValidationErrorSerializer, description=description)


def invalid_body(description):
    return OpenApiResponse(BadRequestSerializer, description=description)


NOT_LOGGED_IN = detail_error("Not logged in.")
CSRF_FAILED = detail_error("The CSRF token is missing or wrong.")
