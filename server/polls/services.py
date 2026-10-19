from django.core.paginator import Paginator
from django.db.models import Prefetch

from polls.models import Author, Choice, Comment, Poll


class PollService:
    @staticmethod
    def get_polls(question=None, author=None):
        queryset = Poll.objects.prefetch_related(
            "choice_set",
            Prefetch(
                "comments",
                queryset=Comment.objects.select_related("author"),
            ),
        )
        if question is not None:
            queryset = queryset.filter(question__icontains=question)
        if author is not None:
            queryset = queryset.filter(author=author)
        return queryset

    @staticmethod
    def get_polls_connection(question=None, limit=20, page=1):
        queryset = PollService.get_polls(question=question)

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
            Poll.objects.prefetch_related(
                "choice_set",
                Prefetch(
                    "comments",
                    queryset=Comment.objects.select_related("author"),
                ),
            )
            .filter(id=poll_id)
            .first()
        )

    @staticmethod
    def create_poll(question, pub_date, author):
        return Poll.objects.create(
            question=question,
            pub_date=pub_date,
            author=author,
        )


class ChoiceService:
    @staticmethod
    def get_choices_by_poll(poll):
        return poll.choice_set.all()

    @staticmethod
    def get_choices(poll_id=None):
        queryset = Choice.objects.select_related("poll")
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


class CommentService:
    @staticmethod
    def get_comments_by_poll(poll):
        return poll.comments.all()

    @staticmethod
    def get_comments_by_author(author):
        return author.comments.all()

    @staticmethod
    def create_comment(poll, author, content):
        return Comment.objects.create(
            poll=poll,
            author=author,
            content=content,
        )


class AuthorService:
    @staticmethod
    def get_author_by_id(author_id):
        return Author.objects.filter(id=author_id).first()

    @staticmethod
    def create_author(name, email):
        return Author.objects.create(
            name=name,
            email=email,
        )
