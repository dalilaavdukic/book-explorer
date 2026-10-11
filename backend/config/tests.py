from rest_framework import status
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.test import APIRequestFactory, APITestCase
from rest_framework.views import APIView


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
