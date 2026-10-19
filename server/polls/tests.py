from django.test import TestCase
from django.utils import timezone

from polls.models import Author, Choice, Comment, Poll
from polls.test_utils.utils import GraphQLTestClient


class PollGraphQLTests(TestCase):
    def setUp(self):
        self.graphql = GraphQLTestClient()

        self.author = Author.objects.create(
            name="Test Author",
            email="author@example.com",
        )

        self.poll = Poll.objects.create(
            question="Favourite language?",
            pub_date=timezone.now(),
            author=self.author,
        )

        Choice.objects.create(
            poll=self.poll,
            choice_text="Python",
        )
        Choice.objects.create(
            poll=self.poll,
            choice_text="JavaScript",
        )

        Comment.objects.create(
            poll=self.poll,
            author=self.author,
            content="Python is great!",
        )

    def test_get_poll(self):
        result = self.graphql.query(
            """
            query GetPoll($id: ID!) {
                poll(id: $id) {
                    id
                    question
                }
            }
            """,
            {"id": str(self.poll.id)},
        )

        self.graphql.assert_no_errors(self, result)

        poll = result["data"]["poll"]
        self.assertEqual(poll["question"], "Favourite language?")

    def test_get_poll_with_choices_and_comments(self):
        result = self.graphql.query(
            """
            query GetPoll($id: ID!) {
                poll(id: $id) {
                    id
                    question
                    choices {
                        choiceText
                    }
                    comments {
                        content
                        author {
                            name
                        }
                    }
                }
            }
            """,
            {"id": str(self.poll.id)},
        )

        self.graphql.assert_no_errors(self, result)

        poll = result["data"]["poll"]

        self.assertEqual(poll["question"], "Favourite language?")
        self.assertEqual(
            {choice["choiceText"] for choice in poll["choices"]},
            {"Python", "JavaScript"},
        )
        self.assertEqual(len(poll["comments"]), 1)
        self.assertEqual(
            poll["comments"][0]["author"]["name"],
            "Test Author",
        )

    def test_graphql_typename(self):
        result = self.graphql.query("{ __typename }")

        self.graphql.assert_no_errors(self, result)
        self.assertEqual(result["data"]["__typename"], "Query")
