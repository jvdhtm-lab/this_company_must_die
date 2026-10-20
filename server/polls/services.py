from django.core.paginator import Paginator
from django.db import transaction
from django.db.models import Count, Prefetch

from polls.models import Author, Choice, Comment, CommentLike, Poll, Vote


class PollService:
    @staticmethod
    def get_polls(question=None, author=None, is_active=None):
        queryset = Poll.objects.select_related("author").order_by(
            "-created_at", "-id"
        ).prefetch_related(
            "choice_set__vote_records",
            Prefetch(
                "comments",
                queryset=Comment.objects.select_related("author").prefetch_related(
                    "likes"
                ),
            ),
        )
        if question is not None:
            queryset = queryset.filter(question__icontains=question)
        if author is not None:
            queryset = queryset.filter(author=author)
        if is_active is not None:
            queryset = queryset.filter(is_active=is_active)
        return queryset

    @staticmethod
    def get_polls_connection(question=None, is_active=None, limit=20, page=1):
        queryset = PollService.get_polls(
            question=question,
            is_active=is_active,
        )

        limit = max(1, min(limit or 20, 100))
        page = max(1, page or 1)

        # Count all matching polls BEFORE pagination.
        total = queryset.count()

        paginator = Paginator(queryset, limit)
        page_obj = paginator.get_page(page)

        return {
            "nodes": list(page_obj.object_list),
            "total": total,
            "limit": limit,
            "page": page_obj.number,
        }

    @staticmethod
    def get_poll_by_id(poll_id):
        return (
            Poll.objects.select_related("author")
            .prefetch_related(
                "choice_set__vote_records",
                Prefetch(
                    "comments",
                    queryset=Comment.objects.select_related("author").prefetch_related(
                        "likes"
                    ),
                ),
            )
            .filter(id=poll_id)
            .first()
        )

    @staticmethod
    @transaction.atomic
    def create_poll(
        question,
        pub_date,
        author,
        choices=None,
        generation_key=None,
        closes_at=None,
    ):
        poll = Poll.objects.create(
            question=question,
            pub_date=pub_date,
            author=author,
            generation_key=generation_key,
            closes_at=closes_at,
        )

        for choice_text in choices or []:
            Choice.objects.create(poll=poll, choice_text=choice_text)

        return poll


class ChoiceService:
    @staticmethod
    def get_choices_by_poll(poll):
        return poll.choice_set.all()

    @staticmethod
    def get_choices(poll_id=None):
        queryset = Choice.objects.select_related("poll").prefetch_related(
            "vote_records"
        )
        if poll_id is not None:
            queryset = queryset.filter(poll_id=poll_id)
        return queryset

    @staticmethod
    def get_choice_by_id(choice_id):
        return Choice.objects.filter(id=choice_id).first()

    @staticmethod
    def create_choice(poll, choice_text):
        return Choice.objects.create(
            poll=poll,
            choice_text=choice_text,
        )


class VoteService:
    @staticmethod
    def get_vote_for_request(poll, request):
        user = getattr(request, "user", None)

        if user is not None and user.is_authenticated:
            return Vote.objects.filter(poll=poll, user=user).first()

        session = getattr(request, "session", None)
        voter_key = session.session_key if session is not None else None

        if not voter_key:
            return None

        return Vote.objects.filter(poll=poll, voter_key=voter_key).first()

    @staticmethod
    def cast_vote(poll, choice, user=None, voter_key=""):
        if user is not None and user.is_authenticated:
            lookup = {"poll": poll, "user": user}
            defaults = {"choice": choice, "voter_key": ""}
        else:
            lookup = {"poll": poll, "voter_key": voter_key}
            defaults = {"choice": choice, "user": None}

        vote, _ = Vote.objects.update_or_create(
            defaults=defaults,
            **lookup,
        )
        return vote


class CommentService:
    @staticmethod
    def get_comments_by_poll(poll):
        return (
            poll.comments.select_related("author")
            .prefetch_related("likes")
            .order_by("-created_at", "-id")
        )

    @staticmethod
    def get_comments_by_author(author):
        return author.comments.select_related("author").order_by(
            "-created_at", "-id"
        )

    @staticmethod
    def get_top_comments(poll, limit=3):
        return (
            Comment.objects.filter(poll=poll)
            .select_related("author")
            .annotate(like_count=Count("likes"))
            .order_by("-like_count", "-created_at", "-id")[:limit]
        )

    @staticmethod
    def get_comment_by_id(comment_id):
        return (
            Comment.objects.select_related("author")
            .prefetch_related("likes")
            .filter(id=comment_id)
            .first()
        )

    @staticmethod
    def create_comment(poll, content, author=None, author_name=""):
        return Comment.objects.create(
            poll=poll,
            author=author,
            author_name=author_name,
            content=content,
        )


class CommentLikeService:
    @staticmethod
    def get_like_for_request(comment, request):
        user = getattr(request, "user", None)

        if user is not None and user.is_authenticated:
            return CommentLike.objects.filter(comment=comment, user=user).first()

        session = getattr(request, "session", None)
        voter_key = session.session_key if session is not None else None

        if not voter_key:
            return None

        return CommentLike.objects.filter(
            comment=comment,
            voter_key=voter_key,
        ).first()

    @staticmethod
    def toggle_like(comment, request):
        user = getattr(request, "user", None)
        existing = CommentLikeService.get_like_for_request(comment, request)

        if existing is not None:
            existing.delete()
            return False

        if user is not None and user.is_authenticated:
            CommentLike.objects.create(comment=comment, user=user)
            return True

        session = getattr(request, "session", None)

        if session is None:
            return False

        if not session.session_key:
            session.save()

        CommentLike.objects.create(
            comment=comment,
            voter_key=session.session_key,
        )
        return True


class AuthorService:
    @staticmethod
    def get_author_by_id(author_id):
        return Author.objects.filter(id=author_id).first()

    @staticmethod
    def get_author_for_user(user):
        return Author.objects.filter(user=user).first()

    @staticmethod
    def create_author(name, email, user=None):
        return Author.objects.create(
            name=name,
            email=email,
            user=user,
        )
