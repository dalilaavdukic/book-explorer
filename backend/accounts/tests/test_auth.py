from django.contrib.sessions.models import Session
from rest_framework import status
from rest_framework.test import APIClient, APITestCase

from accounts.models import User
from catalog.models import Author, Book, Genre

SESSION_URL = "/api/auth/session/"
LOGIN_URL = "/api/auth/login/"
LOGOUT_URL = "/api/auth/logout/"

CREDENTIALS = {"username": "alice", "password": "alice-password"}
INVALID_CREDENTIALS = {"non_field_errors": ["Invalid username or password."]}


class AuthTestCase(APITestCase):
    @classmethod
    def setUpTestData(cls):
        cls.alice = User.objects.create_user(**CREDENTIALS)

    def setUp(self):
        self.client = APIClient(enforce_csrf_checks=True)

    def csrf_token(self):
        """Gets the CSRF cookie from the session endpoint, as the app does."""
        self.client.get(SESSION_URL)
        return self.client.cookies["csrftoken"].value

    def log_in(self, credentials=CREDENTIALS):
        return self.client.post(
            LOGIN_URL,
            credentials,
            format="json",
            headers={"X-CSRFToken": self.csrf_token()},
        )

    def log_out(self):
        return self.client.post(LOGOUT_URL, headers={"X-CSRFToken": self.csrf_token()})

    def session_user(self):
        return self.client.get(SESSION_URL).json()["user"]


class SessionEndpointTests(AuthTestCase):
    def test_visitor_gets_no_user_and_a_csrf_cookie(self):
        response = self.client.get(SESSION_URL)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.json(), {"user": None})
        self.assertIn("csrftoken", response.cookies)

    def test_logged_in_reader_gets_exactly_their_id_and_username(self):
        self.client.force_login(self.alice)

        response = self.client.get(SESSION_URL)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(
            response.json(), {"user": {"id": self.alice.pk, "username": "alice"}}
        )

    def test_reader_deactivated_after_logging_in_gets_no_user(self):
        self.client.force_login(self.alice)
        self.alice.is_active = False
        self.alice.save()

        self.assertIsNone(self.session_user())


class LoginTests(AuthTestCase):
    def test_valid_credentials_log_the_reader_in(self):
        token_before = self.csrf_token()

        response = self.client.post(
            LOGIN_URL,
            CREDENTIALS,
            format="json",
            headers={"X-CSRFToken": token_before},
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(
            response.json(), {"user": {"id": self.alice.pk, "username": "alice"}}
        )
        session_cookie = response.cookies["sessionid"]
        self.assertTrue(session_cookie["httponly"])
        self.assertEqual(session_cookie["samesite"], "Lax")
        csrf_cookie = response.cookies["csrftoken"]
        self.assertFalse(csrf_cookie["httponly"])
        self.assertNotEqual(csrf_cookie.value, token_before)
        self.assertEqual(self.session_user()["username"], "alice")

    def test_password_with_leading_and_trailing_spaces_works(self):
        User.objects.create_user(username="carol", password="  carol-password  ")

        response = self.log_in({"username": "carol", "password": "  carol-password  "})

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.json()["user"]["username"], "carol")

    def test_wrong_credentials_get_one_generic_error_and_no_session(self):
        User.objects.create_user(
            username="dave", password="dave-password", is_active=False
        )
        cases = {
            "wrong password": {"username": "alice", "password": "wrong-password"},
            "unknown username": {"username": "nobody", "password": "alice-password"},
            "deactivated user": {"username": "dave", "password": "dave-password"},
        }
        for case, credentials in cases.items():
            with self.subTest(case):
                response = self.log_in(credentials)

                self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
                self.assertEqual(response.json(), INVALID_CREDENTIALS)
                self.assertFalse(Session.objects.exists())
                self.assertIsNone(self.session_user())

    def test_missing_field_is_named(self):
        for field in CREDENTIALS:
            with self.subTest(field=field):
                credentials = {
                    name: value for name, value in CREDENTIALS.items() if name != field
                }

                response = self.log_in(credentials)

                self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
                self.assertEqual(response.json(), {field: ["This field is required."]})


class CsrfTests(AuthTestCase):
    def test_login_without_the_token_is_refused_before_checking_credentials(self):
        self.csrf_token()

        response = self.client.post(LOGIN_URL, CREDENTIALS, format="json")

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertTrue(response.json()["detail"].startswith("CSRF Failed"))
        self.assertIsNone(self.session_user())

    def test_logout_without_the_token_is_refused_for_a_visitor(self):
        self.csrf_token()

        response = self.client.post(LOGOUT_URL)

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertTrue(response.json()["detail"].startswith("CSRF Failed"))

    def test_logout_without_the_token_is_refused_and_keeps_the_reader_logged_in(self):
        self.log_in()

        response = self.client.post(LOGOUT_URL)

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertTrue(response.json()["detail"].startswith("CSRF Failed"))
        self.assertEqual(self.session_user()["username"], "alice")


class LogoutTests(AuthTestCase):
    def test_logout_deletes_the_session(self):
        self.log_in()
        session_key = self.client.cookies["sessionid"].value

        response = self.log_out()

        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)
        self.assertFalse(Session.objects.filter(session_key=session_key).exists())

    def test_old_session_cookie_is_worthless_after_logout(self):
        self.log_in()
        session_key = self.client.cookies["sessionid"].value
        self.log_out()

        self.client.cookies["sessionid"] = session_key

        self.assertIsNone(self.session_user())

    def test_logging_out_when_logged_out_still_succeeds(self):
        response = self.log_out()

        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)


class CatalogStaysPublicTests(AuthTestCase):
    @classmethod
    def setUpTestData(cls):
        super().setUpTestData()
        book = Book.objects.create(
            title="Test Book",
            author=Author.objects.create(name="Test Author", sort_name="Author, Test"),
            genre=Genre.objects.create(name="Test Genre"),
            publication_year=2000,
            description="About Test Book.",
        )
        cls.urls = ["/api/books/", f"/api/books/{book.pk}/"]

    def assert_catalog_is_readable(self):
        for url in self.urls:
            with self.subTest(url=url):
                self.assertEqual(self.client.get(url).status_code, status.HTTP_200_OK)

    def test_logged_in_reader_can_read_the_catalog(self):
        self.log_in()

        self.assert_catalog_is_readable()

    def test_replayed_old_session_cookie_can_still_read_the_catalog(self):
        self.log_in()
        session_key = self.client.cookies["sessionid"].value
        self.log_out()
        self.client.cookies["sessionid"] = session_key

        self.assert_catalog_is_readable()
