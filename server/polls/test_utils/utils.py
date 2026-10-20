import json

from django.test import Client
from django.urls import reverse


class GraphQLTestClient:
    def __init__(self, client=None, url=None, user=None):
        self.client = client or Client()
        self.url = url or reverse("graphql")

        if user is not None:
            self.client.force_login(user)

    def execute(self, query, variables=None):
        response = self.client.post(
            self.url,
            data=json.dumps(
                {
                    "query": query,
                    "variables": variables or {},
                }
            ),
            content_type="application/json",
        )

        return response

    def query(self, query, variables=None):
        response = self.execute(query, variables)
        return response.json()

    def assert_no_errors(self, test_case, result):
        test_case.assertNotIn(
            "errors",
            result,
            msg=str(result.get("errors")),
        )
