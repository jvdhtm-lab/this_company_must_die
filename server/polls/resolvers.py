from graphql import GraphQLError

from polls.services import AuthorService, ChoiceService, CommentService, PollService


class PollResolvers:
    def __init__(self, query, mutation):
        self.query = query
        self.mutation = mutation
        self.query.set_field("polls", self.resolve_polls)
        self.query.set_field("poll", self.resolve_poll)
        self.mutation.set_field("createPoll", self.resolve_create_poll)

    def resolve_polls(self, root, info, **kwargs):
        poll_filter = kwargs.get("filter")
        limit = kwargs.get("limit", 20)
        page = kwargs.get("page", 1)

        question = poll_filter.get("question") if poll_filter else None

        return PollService.get_polls_connection(
            question=question, limit=limit, page=page
        )

    def resolve_poll(self, *_, id):
        return PollService.get_poll_by_id(id)

    def resolve_create_poll(self, *_, question, pub_date, author_id):
        author = AuthorService.get_author_by_id(author_id)
        if author is None:
            raise GraphQLError(f"Author {author_id} not found")

        return PollService.create_poll(question, pub_date, author)


class ChoiceResolvers:
    def __init__(self, query, mutation, poll_type):
        self.query = query
        self.mutation = mutation
        self.poll_type = poll_type
        self.poll_type.set_field("choices", self.resolve_choices)
        self.query.set_field("choices", self.resolve_choices_query)
        self.query.set_field("choice", self.resolve_choice)
        self.mutation.set_field("createChoice", self.resolve_create_choice)

    def resolve_choices(self, poll, *_):
        return ChoiceService.get_choices_by_poll(poll)

    def resolve_choices_query(self, *_, filter=None, **kwargs):
        poll_id = None
        if filter:
            poll_id = filter.get("poll_id", filter.get("pollId"))
        return ChoiceService.get_choices(poll_id=poll_id)

    def resolve_choice(self, *_, id):
        return ChoiceService.get_choice_by_id(id)

    def resolve_create_choice(self, *_, poll_id, choice_text):
        poll = PollService.get_poll_by_id(poll_id)

        if poll is None:
            raise GraphQLError(f"Poll {poll_id} not found")

        return ChoiceService.create_choice(poll, choice_text)


class AuthorResolvers:
    def __init__(self, query, mutation):
        self.query = query
        self.mutation = mutation
        self.query.set_field("author", self.resolve_author)
        self.mutation.set_field("createAuthor", self.resolve_create_author)

    def resolve_author(self, *_, id):
        return AuthorService.get_author_by_id(id)

    def resolve_create_author(self, *_, name, email):
        return AuthorService.create_author(name, email)


class CommentResolvers:
    def __init__(self, query, mutation, poll_type, author_type):
        self.query = query
        self.mutation = mutation

        poll_type.set_field("comments", self.resolve_poll_comments)
        author_type.set_field("comments", self.resolve_author_comments)

        mutation.set_field("createComment", self.resolve_create_comment)

    def resolve_poll_comments(self, poll, *_):
        return CommentService.get_comments_by_poll(poll)

    def resolve_author_comments(self, author, *_):
        return CommentService.get_comments_by_author(author)

    def resolve_create_comment(self, *_, poll_id, author_id, content):
        poll = PollService.get_poll_by_id(poll_id)
        author = AuthorService.get_author_by_id(author_id)

        if poll is None:
            raise GraphQLError(f"Poll {poll_id} not found")
        if author is None:
            raise GraphQLError(f"Author {author_id} not found")

        return CommentService.create_comment(poll, author, content)
