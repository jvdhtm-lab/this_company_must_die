from django.contrib.auth import authenticate, get_user_model, login, logout
from graphql import GraphQLError

from polls.auto_polls import close_expired_auto_polls, ensure_weekly_poll
from polls.services import (
    AuthorService,
    ChoiceService,
    CommentLikeService,
    CommentService,
    PollService,
    VoteService,
)


def require_authenticated(info):
    request = info.context.get("request")
    user = getattr(request, "user", None)

    if user is None or not user.is_authenticated:
        raise GraphQLError("Authentication required.")

    return user


class AuthResolvers:
    def __init__(self, query, mutation, user_type):
        self.query = query
        self.mutation = mutation
        self.query.set_field("me", self.resolve_me)
        self.mutation.set_field("login", self.resolve_login)
        self.mutation.set_field("logout", self.resolve_logout)
        user_type.set_field("author", self.resolve_author)

    def resolve_me(self, root, info, *_):
        request = info.context.get("request")
        user = getattr(request, "user", None)

        if user is None or not user.is_authenticated:
            return None

        return user

    def resolve_login(self, root, info, username, password):
        request = info.context["request"]
        identifier = username.strip()
        user = authenticate(request, username=identifier, password=password)

        if user is None and identifier:
            User = get_user_model()
            match = (
                User.objects.filter(username__iexact=identifier).first()
                or User.objects.filter(email__iexact=identifier).first()
            )

            if match is not None:
                user = authenticate(
                    request,
                    username=match.username,
                    password=password,
                )

        if user is None:
            raise GraphQLError("Invalid username or password.")

        login(request, user)
        return user

    def resolve_logout(self, root, info, *_):
        request = info.context.get("request")

        if request is not None:
            logout(request)

        return True

    def resolve_author(self, user, *_):
        return getattr(user, "author", None)


class PollResolvers:
    def __init__(self, query, mutation):
        self.query = query
        self.mutation = mutation
        self.query.set_field("polls", self.resolve_polls)
        self.query.set_field("poll", self.resolve_poll)
        self.mutation.set_field("createPoll", self.resolve_create_poll)

    def resolve_polls(self, root, info, **kwargs):
        close_expired_auto_polls()
        ensure_weekly_poll()

        poll_filter = kwargs.get("filter")
        limit = kwargs.get("limit", 20)
        page = kwargs.get("page", 1)

        question = poll_filter.get("question") if poll_filter else None
        is_active = None

        if poll_filter:
            is_active = poll_filter.get(
                "isActive",
                poll_filter.get("is_active"),
            )

        return PollService.get_polls_connection(
            question=question,
            is_active=is_active,
            limit=limit,
            page=page,
        )

    def resolve_poll(self, *_, id):
        return PollService.get_poll_by_id(id)

    def resolve_create_poll(
        self,
        root,
        info,
        question,
        pub_date,
        author_id,
        choices=None,
    ):
        user = require_authenticated(info)
        author = AuthorService.get_author_by_id(author_id)

        if author is None:
            raise GraphQLError(f"Author {author_id} not found")

        if author.user_id != user.id:
            raise GraphQLError("You can only create polls for your own author.")

        cleaned_choices = [
            choice_text.strip()
            for choice_text in (choices or [])
            if choice_text and choice_text.strip()
        ]

        return PollService.create_poll(
            question,
            pub_date,
            author,
            choices=cleaned_choices,
        )


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

    def resolve_create_choice(self, root, info, poll_id, choice_text):
        user = require_authenticated(info)
        poll = PollService.get_poll_by_id(poll_id)

        if poll is None:
            raise GraphQLError(f"Poll {poll_id} not found")

        if poll.author.user_id != user.id:
            raise GraphQLError("You can only add choices to your own polls.")

        return ChoiceService.create_choice(poll, choice_text)


class VoteResolvers:
    def __init__(self, mutation, poll_type):
        self.mutation = mutation
        self.poll_type = poll_type
        self.mutation.set_field("vote", self.resolve_vote)
        self.poll_type.set_field("totalVotes", self.resolve_total_votes)
        self.poll_type.set_field(
            "viewerChoiceId",
            self.resolve_viewer_choice_id,
        )

    def resolve_vote(self, root, info, poll_id, choice_id):
        poll = PollService.get_poll_by_id(poll_id)

        if poll is None:
            raise GraphQLError(f"Poll {poll_id} not found")

        if not poll.is_active:
            raise GraphQLError("This poll is closed.")

        choice = ChoiceService.get_choice_by_id(choice_id)

        if choice is None or choice.poll_id != poll.id:
            raise GraphQLError("That choice does not belong to this poll.")

        request = info.context.get("request")
        user = getattr(request, "user", None)

        if user is not None and user.is_authenticated:
            VoteService.cast_vote(poll, choice, user=user)
        else:
            session = getattr(request, "session", None)

            if session is None:
                raise GraphQLError("Voting sessions are not available.")

            if not session.session_key:
                session.save()

            VoteService.cast_vote(
                poll,
                choice,
                voter_key=session.session_key,
            )

        return PollService.get_poll_by_id(poll.id)

    def resolve_total_votes(self, poll, *_):
        return poll.votes.count()

    def resolve_viewer_choice_id(self, poll, info):
        request = info.context.get("request")
        vote = VoteService.get_vote_for_request(poll, request)
        return vote.choice_id if vote is not None else None


class AuthorResolvers:
    def __init__(self, query, mutation):
        self.query = query
        self.mutation = mutation
        self.query.set_field("author", self.resolve_author)
        self.mutation.set_field("createAuthor", self.resolve_create_author)

    def resolve_author(self, *_, id):
        return AuthorService.get_author_by_id(id)

    def resolve_create_author(self, root, info, name, email):
        user = require_authenticated(info)

        if AuthorService.get_author_for_user(user) is not None:
            raise GraphQLError("An author already exists for this user.")

        return AuthorService.create_author(name, email, user=user)


class CommentResolvers:
    def __init__(self, query, mutation, poll_type, author_type, comment_type):
        self.query = query
        self.mutation = mutation

        poll_type.set_field("comments", self.resolve_poll_comments)
        poll_type.set_field("topComments", self.resolve_top_comments)
        author_type.set_field("comments", self.resolve_author_comments)
        comment_type.set_field("authorName", self.resolve_author_name)
        comment_type.set_field("likes", self.resolve_likes)
        comment_type.set_field("viewerLiked", self.resolve_viewer_liked)

        mutation.set_field("createComment", self.resolve_create_comment)
        mutation.set_field("toggleCommentLike", self.resolve_toggle_comment_like)

    def resolve_poll_comments(self, poll, *_):
        return CommentService.get_comments_by_poll(poll)

    def resolve_top_comments(self, poll, *_):
        return CommentService.get_top_comments(poll, limit=3)

    def resolve_author_comments(self, author, *_):
        return CommentService.get_comments_by_author(author)

    def resolve_author_name(self, comment, *_):
        return comment.display_name

    def resolve_likes(self, comment, *_):
        like_count = getattr(comment, "like_count", None)

        if like_count is not None:
            return like_count

        return comment.likes.count()

    def resolve_viewer_liked(self, comment, info):
        request = info.context.get("request")

        if request is None:
            return False

        return (
            CommentLikeService.get_like_for_request(comment, request) is not None
        )

    def resolve_create_comment(
        self,
        root,
        info,
        poll_id,
        content,
        author_name=None,
    ):
        poll = PollService.get_poll_by_id(poll_id)

        if poll is None:
            raise GraphQLError(f"Poll {poll_id} not found")

        cleaned_content = (content or "").strip()

        if not cleaned_content:
            raise GraphQLError("Comment cannot be empty.")

        request = info.context.get("request")
        user = getattr(request, "user", None)
        author = None

        if user is not None and user.is_authenticated:
            author = AuthorService.get_author_for_user(user)

        cleaned_name = (author_name or "").strip()

        if author is None and not cleaned_name:
            cleaned_name = "Anonymous"

        return CommentService.create_comment(
            poll,
            cleaned_content,
            author=author,
            author_name=cleaned_name,
        )

    def resolve_toggle_comment_like(self, root, info, comment_id):
        comment = CommentService.get_comment_by_id(comment_id)

        if comment is None:
            raise GraphQLError(f"Comment {comment_id} not found")

        request = info.context.get("request")

        if request is None:
            raise GraphQLError("Comment likes are not available.")

        CommentLikeService.toggle_like(comment, request)
        return CommentService.get_comment_by_id(comment.id)
