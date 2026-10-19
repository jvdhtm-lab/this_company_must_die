import json

from ariadne import graphql_sync
from django.http import JsonResponse
from django.views.decorators.csrf import csrf_exempt

from .schema import schema


@csrf_exempt
def graphql_view(request):
    if request.method != "POST":
        return JsonResponse(
            {"error": "Only POST requests are supported."},
            status=405,
        )

    try:
        data = json.loads(request.body)
    except (json.JSONDecodeError, UnicodeDecodeError):
        return JsonResponse(
            {"error": "Invalid JSON body."},
            status=400,
        )

    success, result = graphql_sync(
        schema,
        data,
        context_value={"request": request},
        debug=False,
    )

    return JsonResponse(result, status=200 if success else 400)
