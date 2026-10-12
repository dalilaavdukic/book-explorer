from drf_spectacular.authentication import SessionScheme
from rest_framework import authentication, exceptions, status

READER_HEADER = "X-Reader-Id"


class ReaderChanged(exceptions.APIException):
    status_code = status.HTTP_412_PRECONDITION_FAILED
    default_detail = "The session belongs to another reader."
    default_code = "reader_changed"


class SessionAuthentication(authentication.SessionAuthentication):
    def authenticate(self, request):
        result = super().authenticate(request)
        # A tab that hasn't noticed another reader's login elsewhere would
        # otherwise read and write as that reader under the old one's name.
        expected = request.headers.get(READER_HEADER)
        if result is not None and expected is not None:
            user, _ = result
            if expected != str(user.pk):
                raise ReaderChanged()
        return result

    # DRF answers 403 to a logged-out request unless the first authentication
    # class names a WWW-Authenticate scheme. Cookie sessions have no standard
    # one, and browsers show their own login prompt only for Basic.
    def authenticate_header(self, request):
        return "Session"


# drf-spectacular's own scheme matches only DRF's exact class.
class SessionAuthenticationScheme(SessionScheme):
    target_class = "accounts.authentication.SessionAuthentication"
