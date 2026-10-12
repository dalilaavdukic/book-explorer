from django.http import JsonResponse
from django.views import defaults
from django.views.decorators.csrf import csrf_exempt


def is_api(request):
    return request.path.startswith("/api/")


# A plain view, so it stays out of the schema. DRF exempts its own views from
# Django's CSRF middleware and checks CSRF itself, in JSON; this one would
# otherwise get the middleware's HTML 403. It reads and changes nothing.
@csrf_exempt
def api_not_found(request, *args, **kwargs):
    return JsonResponse({"detail": "Not found."}, status=404)


# Django uses these two only with DEBUG off; with it on, it shows its debug page.
def bad_request(request, exception):
    if is_api(request):
        return JsonResponse({"detail": "Bad request."}, status=400)
    return defaults.bad_request(request, exception)


def server_error(request):
    if is_api(request):
        return JsonResponse({"detail": "A server error occurred."}, status=500)
    return defaults.server_error(request)
