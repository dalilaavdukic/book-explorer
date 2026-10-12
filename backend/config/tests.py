import io
import json
import logging
from unittest import mock

from django.conf import settings
from django.contrib.auth.views import LoginView
from django.db import DatabaseError
from django.test import RequestFactory, SimpleTestCase, override_settings
from django.utils.functional import SimpleLazyObject
from drf_spectacular.generators import SchemaGenerator
from rest_framework import status
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.test import APIClient, APIRequestFactory, APITestCase
from rest_framework.views import APIView

from accounts.models import User
from catalog.models import Book
from catalog.views import GenreListView
from notes.models import Note

from .logging import RequestContextFilter


class DefaultView(APIView):
    def get(self, request):
        return Response({})


class PublicEchoView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        return Response(request.data)


class ApiDefaultsTests(APITestCase):
    def setUp(self):
        self.factory = APIRequestFactory()

    def test_view_without_a_permission_override_rejects_visitors(self):
        response = DefaultView.as_view()(self.factory.get("/"))

        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)
        self.assertEqual(response["WWW-Authenticate"], "Session")

    def test_bodies_an_html_form_can_send_are_rejected(self):
        form_bodies = {
            "application/x-www-form-urlencoded": "body=text",
            "multipart/form-data; boundary=x": (
                '--x\r\nContent-Disposition: form-data; name="body"\r\n\r\ntext\r\n--x--'
            ),
            "text/plain": "body=text",
        }
        for content_type, body in form_bodies.items():
            with self.subTest(content_type=content_type):
                request = self.factory.post("/", body, content_type=content_type)

                response = PublicEchoView.as_view()(request)

                self.assertEqual(
                    response.status_code, status.HTTP_415_UNSUPPORTED_MEDIA_TYPE
                )

    def test_json_body_is_accepted(self):
        request = self.factory.post("/", {"body": "text"}, format="json")

        response = PublicEchoView.as_view()(request)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data, {"body": "text"})


class ApiDocsTests(APITestCase):
    def test_schema_is_public(self):
        response = self.client.get("/api/schema/")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn(b"title: Book Explorer API", response.content)

    def test_swagger_ui_is_public_and_uses_local_assets(self):
        response = self.client.get("/api/docs/")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertContains(response, "/static/drf_spectacular_sidecar/")
        self.assertNotContains(response, "cdn.jsdelivr.net")


def capture_console_output(test):
    """Swaps the configured console handler's stream for a StringIO."""
    handler = next(
        h for h in logging.getLogger("django").handlers if h.name == "console"
    )
    output = io.StringIO()
    test.addCleanup(handler.setStream, handler.setStream(output))
    return output


def failing(target, attribute):
    return mock.patch.object(
        target, attribute, side_effect=RuntimeError("probe failure")
    )


@override_settings(DEBUG=False)
class ServerErrorLoggingTests(APITestCase):
    def setUp(self):
        self.output = capture_console_output(self)
        self.client.raise_request_exception = False

    def test_unexpected_error_is_logged_with_traceback_method_path_and_user(self):
        reader = User.objects.create_user(username="reader")
        self.client.force_login(reader)

        with failing(GenreListView, "list"):
            response = self.client.get("/api/genres/")

        self.assertEqual(response.status_code, status.HTTP_500_INTERNAL_SERVER_ERROR)
        output = self.output.getvalue()
        self.assertIn(
            "ERROR django.request Internal Server Error: /api/genres/ "
            f"[GET, user {reader.pk}]",
            output,
        )
        self.assertIn("Traceback (most recent call last):", output)
        self.assertIn("RuntimeError: probe failure", output)

    def test_unexpected_error_for_a_visitor_is_logged_as_anonymous(self):
        with failing(GenreListView, "list"):
            self.client.get("/api/genres/")

        self.assertIn(
            "Internal Server Error: /api/genres/ [GET, anonymous]",
            self.output.getvalue(),
        )

    def test_client_errors_are_not_logged(self):
        for path in ("/api/books/0/", "/api/books/?sort=banana"):
            with self.subTest(path=path):
                self.client.get(path)

        self.assertEqual(self.output.getvalue(), "")

    def test_passwords_never_reach_the_log(self):
        password = "a-password-that-must-not-be-logged"
        credentials = {"username": "nobody", "password": password}

        self.client.post("/api/auth/login/", credentials, format="json")
        with mock.patch(
            "accounts.serializers.authenticate", side_effect=RuntimeError("down")
        ):
            response = self.client.post("/api/auth/login/", credentials, format="json")

        self.assertEqual(response.status_code, status.HTTP_500_INTERNAL_SERVER_ERROR)
        self.assertIn("Internal Server Error: /api/auth/login/", self.output.getvalue())
        self.assertNotIn(password, self.output.getvalue())

    def test_note_text_never_reaches_the_log(self):
        text = "note text that must not be logged"
        self.client.force_login(User.objects.create_user(username="reader"))
        book = Book.objects.first()

        with failing(Note, "save"):
            response = self.client.post(
                f"/api/books/{book.pk}/notes/", {"body": text}, format="json"
            )

        self.assertEqual(response.status_code, status.HTTP_500_INTERNAL_SERVER_ERROR)
        self.assertIn("Internal Server Error", self.output.getvalue())
        self.assertNotIn(text, self.output.getvalue())


class RequestContextFilterTests(SimpleTestCase):
    def context(self, **extra):
        record = logging.LogRecord("django", logging.ERROR, "", 0, "msg", None, None)
        record.__dict__.update(extra)

        self.assertTrue(RequestContextFilter().filter(record))
        return record.request_context

    def test_record_without_a_request_gets_no_context(self):
        self.assertEqual(self.context(), "")

    def test_runserver_record_carrying_a_socket_gets_no_context(self):
        self.assertEqual(self.context(request=object()), "")

    def test_request_without_a_user_says_so(self):
        request = RequestFactory().get("/api/books/")

        self.assertEqual(self.context(request=request), " [GET, user unknown]")

    def test_user_that_cannot_be_loaded_does_not_raise(self):
        def unavailable():
            raise DatabaseError("database is down")

        request = RequestFactory().post("/api/auth/login/")
        request.user = SimpleLazyObject(unavailable)

        self.assertEqual(self.context(request=request), " [POST, user unknown]")


NOT_FOUND = {"detail": "Not found."}


class ApiNotFoundTests(APITestCase):
    def assert_json_not_found(self, response):
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
        self.assertEqual(response["Content-Type"], "application/json")
        self.assertEqual(response.json(), NOT_FOUND)

    def test_paths_no_route_matches_get_a_json_404(self):
        for path in ("/api/nope/", "/api/books/abc/", "/api/notes/-1/", "/api/books"):
            with self.subTest(path=path):
                self.assert_json_not_found(self.client.get(path))

    @override_settings(DEBUG=True)
    def test_paths_no_route_matches_get_a_json_404_in_debug_mode_too(self):
        for path in ("/api/nope/", "/api/auth/login"):
            with self.subTest(path=path):
                self.assert_json_not_found(self.client.post(path, {}, format="json"))

    def test_writes_to_unmatched_paths_get_a_json_404_without_a_csrf_token(self):
        client = APIClient(enforce_csrf_checks=True)
        for path in ("/api/nope/", "/api/notes/abc/"):
            for method in ("post", "patch", "delete"):
                with self.subTest(path=path, method=method):
                    response = getattr(client, method)(path, {}, format="json")

                    self.assert_json_not_found(response)


@override_settings(DEBUG=False)
class ApiErrorHandlerTests(APITestCase):
    def setUp(self):
        self.output = capture_console_output(self)
        self.client.raise_request_exception = False

    def test_server_error_is_json_under_the_api_and_html_elsewhere(self):
        with failing(GenreListView, "list"):
            response = self.client.get("/api/genres/")

        self.assertEqual(response.status_code, status.HTTP_500_INTERNAL_SERVER_ERROR)
        self.assertEqual(response.json(), {"detail": "A server error occurred."})

        with failing(LoginView, "dispatch"):
            response = self.client.get("/admin/login/")

        self.assertEqual(response.status_code, status.HTTP_500_INTERNAL_SERVER_ERROR)
        self.assertIn("text/html", response["Content-Type"])

    def test_host_outside_allowed_hosts_gets_a_json_400_under_the_api(self):
        response = self.client.get("/api/books/", headers={"host": "evil.example"})

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(response.json(), {"detail": "Bad request."})

        response = self.client.get("/admin/login/", headers={"host": "evil.example"})

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("text/html", response["Content-Type"])

    def test_json_body_over_the_size_limit_gets_a_json_400(self):
        # DRF applies Django's size limit only to its own JSON and form
        # parsers, so this holds while config.parsers.JSONParser subclasses DRF's.
        self.client.force_login(User.objects.create_user(username="reader"))
        book = Book.objects.first()
        body = json.dumps({"body": "x" * settings.DATA_UPLOAD_MAX_MEMORY_SIZE})

        response = self.client.post(
            f"/api/books/{book.pk}/notes/", body, content_type="application/json"
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(response.json(), {"detail": "Bad request."})
        self.assertIn("ERROR django.security.RequestDataTooBig", self.output.getvalue())
        self.assertFalse(Note.objects.exists())


DEEPLY_NESTED = "[" * 100_000


class JsonParsingTests(APITestCase):
    def assert_parse_error(self, response):
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertTrue(response.json()["detail"].startswith("JSON parse error"))

    def test_deeply_nested_json_to_login_is_a_400(self):
        client = APIClient(enforce_csrf_checks=True)
        token = client.get("/api/auth/session/").cookies["csrftoken"].value

        response = client.post(
            "/api/auth/login/",
            DEEPLY_NESTED,
            content_type="application/json",
            headers={"X-CSRFToken": token},
        )

        self.assert_parse_error(response)

    def test_deeply_nested_or_truncated_json_to_a_note_is_a_400(self):
        self.client.force_login(User.objects.create_user(username="reader"))
        book = Book.objects.first()

        for body in (DEEPLY_NESTED, '{"body":'):
            with self.subTest(body=body[:10]):
                response = self.client.post(
                    f"/api/books/{book.pk}/notes/",
                    body,
                    content_type="application/json",
                )

                self.assert_parse_error(response)
        self.assertFalse(Note.objects.exists())


class SchemaErrorResponseTests(SimpleTestCase):
    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.paths = SchemaGenerator().get_schema(request=None, public=True)["paths"]

    def test_each_operation_documents_its_error_responses(self):
        expected = {
            ("/api/books/", "get"): {"200", "400", "401", "404"},
            ("/api/books/{id}/", "get"): {"200", "404"},
            ("/api/authors/", "get"): {"200", "400"},
            ("/api/authors/{id}/", "get"): {"200", "404"},
            ("/api/genres/", "get"): {"200"},
            ("/api/auth/session/", "get"): {"200"},
            ("/api/auth/login/", "post"): {"200", "400", "403"},
            ("/api/auth/logout/", "post"): {"204", "403"},
            ("/api/books/{book_id}/notes/", "get"): {"200", "400", "401", "404"},
            ("/api/books/{book_id}/notes/", "post"): {
                "201",
                "400",
                "401",
                "403",
                "404",
            },
            ("/api/notes/{id}/", "get"): {"200", "401", "404"},
            ("/api/notes/{id}/", "patch"): {"200", "400", "401", "403", "404"},
            ("/api/notes/{id}/", "delete"): {"204", "401", "403", "404"},
        }
        for (path, method), codes in expected.items():
            with self.subTest(path=path, method=method):
                self.assertEqual(set(self.paths[path][method]["responses"]), codes)

    def test_page_size_and_search_document_their_bounds(self):
        def parameter(path, name):
            parameters = self.paths[path]["get"]["parameters"]
            return next(p for p in parameters if p["name"] == name)["schema"]

        for path in ("/api/books/", "/api/books/{book_id}/notes/"):
            with self.subTest(path=path):
                schema = parameter(path, "page_size")
                self.assertEqual((schema["minimum"], schema["maximum"]), (1, 100))
        for path in ("/api/books/", "/api/authors/"):
            with self.subTest(path=path):
                self.assertEqual(parameter(path, "search")["maxLength"], 100)
