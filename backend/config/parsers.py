from rest_framework import parsers
from rest_framework.exceptions import ParseError


class JSONParser(parsers.JSONParser):
    def parse(self, stream, media_type=None, parser_context=None):
        try:
            return super().parse(stream, media_type, parser_context)
        except RecursionError:
            # Python's decoder raises this for deeply nested JSON, and DRF
            # catches only ValueError, so it would be a 500.
            raise ParseError("JSON parse error - nested too deeply.") from None
