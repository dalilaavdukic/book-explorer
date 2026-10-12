import logging

from django.http import HttpRequest


class RequestContextFilter(logging.Filter):
    """Adds the method and user of the request a record is about, if any."""

    def filter(self, record):
        request = getattr(record, "request", None)
        # runserver's own records carry the socket, not an HttpRequest.
        if isinstance(request, HttpRequest):
            record.request_context = f" [{request.method}, {describe_user(request)}]"
        else:
            record.request_context = ""
        return True


def describe_user(request):
    # A filter's exceptions aren't caught by the logging module, so this must
    # never raise: loading the user fails when the database does.
    try:
        user = getattr(request, "user", None)
        if user is None:
            # Rejected before AuthenticationMiddleware ran, e.g. a bad Host.
            return "user unknown"
        return f"user {user.pk}" if user.is_authenticated else "anonymous"
    except Exception:
        return "user unknown"
