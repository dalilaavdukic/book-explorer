from django.contrib import admin
from django.urls import include, path, re_path
from drf_spectacular.views import SpectacularAPIView, SpectacularSwaggerView

from .views import api_not_found

urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/auth/", include("accounts.urls")),
    path("api/", include("catalog.urls")),
    path("api/", include("notes.urls")),
    path("api/schema/", SpectacularAPIView.as_view(), name="schema"),
    path(
        "api/docs/",
        SpectacularSwaggerView.as_view(url_name="schema"),
        name="swagger-ui",
    ),
    # Last, so any other API path gets a JSON 404, including one missing its
    # trailing slash, which would otherwise be redirected.
    re_path(r"^api/", api_not_found),
]

handler400 = "config.views.bad_request"
handler500 = "config.views.server_error"
