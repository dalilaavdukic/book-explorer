from drf_spectacular.authentication import SessionScheme
from rest_framework import authentication


class SessionAuthentication(authentication.SessionAuthentication):
    # DRF answers 403 to a logged-out request unless the first authentication
    # class names a WWW-Authenticate scheme. Cookie sessions have no standard
    # one, and browsers show their own login prompt only for Basic.
    def authenticate_header(self, request):
        return "Session"


# drf-spectacular's own scheme matches only DRF's exact class.
class SessionAuthenticationScheme(SessionScheme):
    target_class = "accounts.authentication.SessionAuthentication"
