from django.contrib.auth import login, logout
from django.utils.decorators import method_decorator
from django.views.decorators.csrf import ensure_csrf_cookie
from drf_spectacular.utils import extend_schema
from rest_framework import status
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from config.schema import CSRF_FAILED, invalid_body

from .authentication import SessionAuthentication
from .serializers import LoginSerializer, SessionSerializer


def session_body(user):
    return SessionSerializer({"user": user if user.is_authenticated else None}).data


def enforce_csrf(request):
    # DRF checks CSRF only for logged-in requests. Logging in and out must be
    # protected for visitors too, or another site could log a reader into its
    # own account. DRF's check answers in JSON, unlike Django's csrf_protect.
    SessionAuthentication().enforce_csrf(request)


@method_decorator(ensure_csrf_cookie, name="dispatch")
class SessionView(APIView):
    permission_classes = [AllowAny]

    @extend_schema(responses=SessionSerializer)
    def get(self, request):
        return Response(session_body(request.user))


class LoginView(APIView):
    permission_classes = [AllowAny]

    @extend_schema(
        request=LoginSerializer,
        responses={
            status.HTTP_200_OK: SessionSerializer,
            status.HTTP_400_BAD_REQUEST: invalid_body(
                "Wrong credentials, a missing field, or a body that isn't JSON."
            ),
            status.HTTP_403_FORBIDDEN: CSRF_FAILED,
        },
    )
    def post(self, request):
        enforce_csrf(request)
        serializer = LoginSerializer(data=request.data, context={"request": request})
        serializer.is_valid(raise_exception=True)
        user = serializer.validated_data["user"]
        login(request, user)
        return Response(session_body(user))


class LogoutView(APIView):
    permission_classes = [AllowAny]

    @extend_schema(
        request=None,
        responses={
            status.HTTP_204_NO_CONTENT: None,
            status.HTTP_403_FORBIDDEN: CSRF_FAILED,
        },
    )
    def post(self, request):
        enforce_csrf(request)
        logout(request)
        return Response(status=status.HTTP_204_NO_CONTENT)
