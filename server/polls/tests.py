from datetime import timedelta
from io import StringIO

from django.contrib.auth import get_user_model
from django.core.management import call_command
from django.test import TestCase
from django.utils import timezone

from polls.auto_polls import current_week_window, ensure_weekly_poll
from polls.company_data import AUTO_POLL_QUESTION, SP500_TOP_20
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


class MutationAuthTests(TestCase):
    def setUp(self):
        self.user = get_user_model().objects.create_user(
            username="owner",
            email="owner@example.com",
            password="secret-pass",
        )
        self.author = Author.objects.create(
            name="Owner",
            email="owner@example.com",
            user=self.user,
        )
        self.poll = Poll.objects.create(
            question="Owned poll?",
            pub_date=timezone.now(),
            author=self.author,
        )

    def login(self, graphql):
        result = graphql.query(
            """
            mutation Login($username: String!, $password: String!) {
                login(username: $username, password: $password) {
                    username
                    author {
                        id
                    }
                }
            }
            """,
            {"username": "owner", "password": "secret-pass"},
        )

        self.assertNotIn("errors", result, msg=str(result.get("errors")))
        return result

    def test_create_choice_requires_authentication(self):
        graphql = GraphQLTestClient()

        result = graphql.query(
            """
            mutation CreateChoice($pollId: ID!, $choiceText: String!) {
                createChoice(pollId: $pollId, choiceText: $choiceText) {
                    id
                }
            }
            """,
            {"pollId": str(self.poll.id), "choiceText": "Unauthorized"},
        )

        self.assertIn("errors", result)
        self.assertFalse(
            Choice.objects.filter(choice_text="Unauthorized").exists(),
        )

    def test_login_allows_create_choice(self):
        graphql = GraphQLTestClient()
        login_result = self.login(graphql)

        self.assertEqual(
            login_result["data"]["login"]["author"]["id"],
            str(self.author.id),
        )

        result = graphql.query(
            """
            mutation CreateChoice($pollId: ID!, $choiceText: String!) {
                createChoice(pollId: $pollId, choiceText: $choiceText) {
                    choiceText
                }
            }
            """,
            {"pollId": str(self.poll.id), "choiceText": "Authorized"},
        )

        self.assertNotIn("errors", result, msg=str(result.get("errors")))
        self.assertEqual(
            result["data"]["createChoice"]["choiceText"],
            "Authorized",
        )

    def test_create_choice_rejects_foreign_poll(self):
        other_user = get_user_model().objects.create_user(
            username="other",
            email="other@example.com",
            password="secret-pass",
        )
        other_author = Author.objects.create(
            name="Other",
            email="other@example.com",
            user=other_user,
        )
        other_poll = Poll.objects.create(
            question="Other poll?",
            pub_date=timezone.now(),
            author=other_author,
        )
        graphql = GraphQLTestClient(user=self.user)

        result = graphql.query(
            """
            mutation CreateChoice($pollId: ID!, $choiceText: String!) {
                createChoice(pollId: $pollId, choiceText: $choiceText) {
                    id
                }
            }
            """,
            {"pollId": str(other_poll.id), "choiceText": "Forbidden"},
        )

        self.assertIn("errors", result)
        self.assertFalse(
            Choice.objects.filter(choice_text="Forbidden").exists(),
        )

    def test_create_author_links_user(self):
        user = get_user_model().objects.create_user(
            username="new-author",
            email="new-author@example.com",
            password="secret-pass",
        )
        graphql = GraphQLTestClient(user=user)

        result = graphql.query(
            """
            mutation CreateAuthor($name: String!, $email: String!) {
                createAuthor(name: $name, email: $email) {
                    name
                }
            }
            """,
            {"name": "New Author", "email": "new-author@example.com"},
        )

        self.assertNotIn("errors", result, msg=str(result.get("errors")))
        self.assertEqual(
            Author.objects.get(user=user).name,
            "New Author",
        )

    def test_login_accepts_email_and_normalized_username(self):
        for identifier in ("OWNER", " owner ", "owner@example.com"):
            with self.subTest(identifier=identifier):
                graphql = GraphQLTestClient()
                result = graphql.query(
                    """
                    mutation Login($username: String!, $password: String!) {
                        login(username: $username, password: $password) {
                            username
                        }
                    }
                    """,
                    {"username": identifier, "password": "secret-pass"},
                )

                self.assertNotIn(
                    "errors",
                    result,
                    msg=str(result.get("errors")),
                )
                self.assertEqual(result["data"]["login"]["username"], "owner")

    def test_login_rejects_invalid_credentials(self):
        graphql = GraphQLTestClient()

        result = graphql.query(
            """
            mutation Login($username: String!, $password: String!) {
                login(username: $username, password: $password) {
                    username
                }
            }
            """,
            {"username": "owner", "password": "wrong"},
        )

        self.assertIn("errors", result)

    def test_me_returns_authenticated_user(self):
        graphql = GraphQLTestClient(user=self.user)

        result = graphql.query("{ me { username } }")

        self.assertNotIn("errors", result, msg=str(result.get("errors")))
        self.assertEqual(result["data"]["me"]["username"], "owner")


class PublicVoteTests(TestCase):
    def setUp(self):
        self.author = Author.objects.create(
            name="Vote Author",
            email="vote-author@example.com",
        )
        self.poll = Poll.objects.create(
            question="Pick one?",
            pub_date=timezone.now(),
            author=self.author,
        )
        self.first_choice = Choice.objects.create(
            poll=self.poll,
            choice_text="First",
        )
        self.second_choice = Choice.objects.create(
            poll=self.poll,
            choice_text="Second",
        )

    def vote(self, graphql, choice):
        return graphql.query(
            """
            mutation Vote($pollId: ID!, $choiceId: ID!) {
                vote(pollId: $pollId, choiceId: $choiceId) {
                    id
                    totalVotes
                    viewerChoiceId
                    choices {
                        id
                        choiceText
                        votes
                    }
                }
            }
            """,
            {
                "pollId": str(self.poll.id),
                "choiceId": str(choice.id),
            },
        )

    def test_anonymous_vote_is_counted(self):
        graphql = GraphQLTestClient()

        result = self.vote(graphql, self.first_choice)

        self.assertNotIn("errors", result, msg=str(result.get("errors")))
        poll = result["data"]["vote"]
        self.assertEqual(poll["totalVotes"], 1)
        self.assertEqual(poll["viewerChoiceId"], str(self.first_choice.id))
        self.assertEqual(
            {choice["choiceText"]: choice["votes"] for choice in poll["choices"]},
            {"First": 1, "Second": 0},
        )

    def test_same_session_changes_vote_instead_of_adding(self):
        graphql = GraphQLTestClient()
        self.vote(graphql, self.first_choice)

        result = self.vote(graphql, self.second_choice)

        self.assertNotIn("errors", result, msg=str(result.get("errors")))
        poll = result["data"]["vote"]
        self.assertEqual(poll["totalVotes"], 1)
        self.assertEqual(poll["viewerChoiceId"], str(self.second_choice.id))
        self.assertEqual(
            {choice["choiceText"]: choice["votes"] for choice in poll["choices"]},
            {"First": 0, "Second": 1},
        )

    def test_different_sessions_vote_independently(self):
        self.vote(GraphQLTestClient(), self.first_choice)
        result = self.vote(GraphQLTestClient(), self.first_choice)

        self.assertNotIn("errors", result, msg=str(result.get("errors")))
        self.assertEqual(result["data"]["vote"]["totalVotes"], 2)

    def test_vote_rejects_choice_from_another_poll(self):
        other_poll = Poll.objects.create(
            question="Other?",
            pub_date=timezone.now(),
            author=self.author,
        )
        other_choice = Choice.objects.create(
            poll=other_poll,
            choice_text="Elsewhere",
        )

        result = self.vote(GraphQLTestClient(), other_choice)

        self.assertIn("errors", result)
        self.assertEqual(self.poll.votes.count(), 0)

    def test_vote_rejects_closed_poll(self):
        self.poll.is_active = False
        self.poll.save(update_fields=["is_active"])

        result = self.vote(GraphQLTestClient(), self.first_choice)

        self.assertIn("errors", result)
        self.assertEqual(self.poll.votes.count(), 0)

    def test_active_filter_only_returns_active_polls(self):
        inactive_poll = Poll.objects.create(
            question="Closed?",
            pub_date=timezone.now(),
            author=self.author,
            is_active=False,
        )

        result = GraphQLTestClient().query(
            """
            query ActivePolls {
                polls(filter: { isActive: true }) {
                    nodes {
                        id
                    }
                }
            }
            """
        )

        self.assertNotIn("errors", result, msg=str(result.get("errors")))
        ids = [node["id"] for node in result["data"]["polls"]["nodes"]]
        self.assertIn(str(self.poll.id), ids)
        self.assertNotIn(str(inactive_poll.id), ids)


class CreatePollTests(TestCase):
    def setUp(self):
        self.user = get_user_model().objects.create_user(
            username="creator",
            email="creator@example.com",
            password="secret-pass",
        )
        self.author = Author.objects.create(
            name="Creator",
            email="creator@example.com",
            user=self.user,
        )
        self.graphql = GraphQLTestClient(user=self.user)

    def test_create_poll_with_choices(self):
        result = self.graphql.query(
            """
            mutation CreatePoll(
                $question: String!
                $pubDate: DateTime!
                $authorId: ID!
                $choices: [String!]
            ) {
                createPoll(
                    question: $question
                    pubDate: $pubDate
                    authorId: $authorId
                    choices: $choices
                ) {
                    id
                    isActive
                    author {
                        id
                    }
                    choices {
                        choiceText
                    }
                }
            }
            """,
            {
                "question": "Which option?",
                "pubDate": timezone.now().isoformat(),
                "authorId": str(self.author.id),
                "choices": ["Alpha", "Beta"],
            },
        )

        self.assertNotIn("errors", result, msg=str(result.get("errors")))
        poll = result["data"]["createPoll"]
        self.assertTrue(poll["isActive"])
        self.assertEqual(poll["author"]["id"], str(self.author.id))
        self.assertEqual(
            {choice["choiceText"] for choice in poll["choices"]},
            {"Alpha", "Beta"},
        )


class CommentTests(TestCase):
    def setUp(self):
        self.author = Author.objects.create(
            name="Comment Author",
            email="comment-author@example.com",
        )
        self.poll = Poll.objects.create(
            question="Which one?",
            pub_date=timezone.now(),
            author=self.author,
        )
        self.first_choice = Choice.objects.create(
            poll=self.poll,
            choice_text="First",
        )

    def create_comment(self, graphql, name, content):
        result = graphql.query(
            """
            mutation CreateComment(
                $pollId: ID!
                $content: String!
                $authorName: String
            ) {
                createComment(
                    pollId: $pollId
                    content: $content
                    authorName: $authorName
                ) {
                    id
                    authorName
                    content
                    likes
                    viewerLiked
                }
            }
            """,
            {
                "pollId": str(self.poll.id),
                "content": content,
                "authorName": name,
            },
        )
        self.assertNotIn("errors", result, msg=str(result.get("errors")))
        return result["data"]["createComment"]

    def toggle_like(self, graphql, comment_id):
        return graphql.query(
            """
            mutation ToggleLike($commentId: ID!) {
                toggleCommentLike(commentId: $commentId) {
                    id
                    likes
                    viewerLiked
                }
            }
            """,
            {"commentId": comment_id},
        )

    def test_anonymous_comment_is_public(self):
        graphql = GraphQLTestClient()
        comment = self.create_comment(graphql, "Anon", "Never trust the market.")

        self.assertEqual(comment["authorName"], "Anon")
        self.assertEqual(comment["content"], "Never trust the market.")
        self.assertEqual(comment["likes"], 0)
        self.assertFalse(comment["viewerLiked"])

    def test_comment_defaults_to_anonymous_name(self):
        graphql = GraphQLTestClient()
        comment = self.create_comment(graphql, "", "No name needed.")

        self.assertEqual(comment["authorName"], "Anonymous")

    def test_comment_requires_content(self):
        result = GraphQLTestClient().query(
            """
            mutation CreateComment($pollId: ID!, $content: String!) {
                createComment(pollId: $pollId, content: $content) {
                    id
                }
            }
            """,
            {"pollId": str(self.poll.id), "content": "   "},
        )

        self.assertIn("errors", result)
        self.assertEqual(Comment.objects.count(), 0)

    def test_top_three_comments_are_sorted_by_likes(self):
        graphql = GraphQLTestClient()
        first = self.create_comment(graphql, "One", "First comment")
        second = self.create_comment(graphql, "Two", "Second comment")
        third = self.create_comment(graphql, "Three", "Third comment")
        fourth = self.create_comment(graphql, "Four", "Fourth comment")

        self.toggle_like(graphql, second["id"])
        self.toggle_like(GraphQLTestClient(), second["id"])
        self.toggle_like(graphql, fourth["id"])

        result = graphql.query(
            """
            query TopComments($pollId: ID!) {
                poll(id: $pollId) {
                    topComments {
                        id
                        authorName
                        content
                        likes
                        viewerLiked
                    }
                }
            }
            """,
            {"pollId": str(self.poll.id)},
        )

        self.assertNotIn("errors", result, msg=str(result.get("errors")))
        comments = result["data"]["poll"]["topComments"]
        self.assertEqual(len(comments), 3)
        self.assertEqual(
            [comment["id"] for comment in comments],
            [second["id"], fourth["id"], third["id"]],
        )
        self.assertEqual(comments[0]["likes"], 2)
        self.assertTrue(comments[0]["viewerLiked"])
        self.assertFalse(comments[2]["viewerLiked"])

    def test_same_session_toggles_like_off(self):
        graphql = GraphQLTestClient()
        comment = self.create_comment(graphql, "Anon", "Like me")

        first = self.toggle_like(graphql, comment["id"])
        self.assertNotIn("errors", first, msg=str(first.get("errors")))
        self.assertEqual(first["data"]["toggleCommentLike"]["likes"], 1)
        self.assertTrue(first["data"]["toggleCommentLike"]["viewerLiked"])

        second = self.toggle_like(graphql, comment["id"])
        self.assertNotIn("errors", second, msg=str(second.get("errors")))
        self.assertEqual(second["data"]["toggleCommentLike"]["likes"], 0)
        self.assertFalse(second["data"]["toggleCommentLike"]["viewerLiked"])


class GeneratePollsTests(TestCase):
    def setUp(self):
        self.author = Author.objects.create(
            name="Seed Author",
            email="seed@example.com",
        )

    def test_generate_poll_creates_top_20_choices(self):
        old_key = current_week_window(
            timezone.now() - timedelta(days=7)
        )[2]
        old_poll = Poll.objects.create(
            question=AUTO_POLL_QUESTION,
            pub_date=timezone.now(),
            author=self.author,
            generation_key=old_key,
        )

        call_command("generate_polls", stdout=StringIO())

        poll = Poll.objects.get(
            is_active=True,
            generation_key__isnull=False,
        )
        self.assertEqual(poll.question, AUTO_POLL_QUESTION)
        self.assertEqual(
            list(poll.choice_set.values_list("choice_text", flat=True)),
            SP500_TOP_20,
        )
        self.assertEqual(len(SP500_TOP_20), 20)
        self.assertIsNotNone(poll.closes_at)
        self.assertGreater(poll.closes_at, timezone.now())

        old_poll.refresh_from_db()
        self.assertFalse(old_poll.is_active)

    def test_generate_poll_is_idempotent_per_week(self):
        output = StringIO()
        call_command("generate_polls", stdout=output)
        call_command("generate_polls", stdout=output)

        self.assertEqual(
            Poll.objects.filter(generation_key__isnull=False).count(),
            1,
        )

    def test_previous_week_poll_is_closed_when_new_week_starts(self):
        last_week = timezone.now() - timedelta(days=7)
        old_poll = ensure_weekly_poll(last_week)
        current_poll = ensure_weekly_poll()

        old_poll.refresh_from_db()
        self.assertFalse(old_poll.is_active)
        self.assertTrue(current_poll.is_active)
        self.assertNotEqual(
            old_poll.generation_key,
            current_poll.generation_key,
        )
