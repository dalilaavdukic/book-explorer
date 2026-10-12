import re

from rest_framework.exceptions import ValidationError
from rest_framework.pagination import PageNumberPagination


class StrictPageNumberPagination(PageNumberPagination):
    """Rejects an invalid page_size, where DRF would silently use another size."""

    page_size_query_param = "page_size"
    max_page_size = 100
    # The schema documents `page` as an integer, so `page=last` isn't offered.
    last_page_strings = ()

    def get_page_size(self, request):
        value = request.query_params.get(self.page_size_query_param, "")
        if value == "":
            return self.page_size
        # Capping the length before int() avoids Python's 4,300-digit limit,
        # whose ValueError would be a 500. Three digits cover max_page_size.
        if not re.fullmatch(r"[0-9]{1,3}", value) or not (
            1 <= int(value) <= self.max_page_size
        ):
            raise ValidationError(
                {
                    self.page_size_query_param: [
                        f"Enter a whole number from 1 to {self.max_page_size}."
                    ]
                }
            )
        return int(value)

    def get_schema_operation_parameters(self, view):
        parameters = super().get_schema_operation_parameters(view)
        for parameter in parameters:
            if parameter["name"] == self.page_size_query_param:
                parameter["schema"].update(minimum=1, maximum=self.max_page_size)
        return parameters
