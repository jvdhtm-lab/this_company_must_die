from base.models import TimeStampBaseMode
from django.conf import settings
from django.db import models


class Author(TimeStampBaseMode):
    name = models.CharField(max_length=100)
    email = models.EmailField(unique=True)
    user = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="author",
        null=True,
        blank=True,
    )

    def __str__(self):
        return self.name


class Comment(TimeStampBaseMode):
    poll = models.ForeignKey("Poll", on_delete=models.CASCADE, related_name="comments")
    author = models.ForeignKey(
        Author,
        on_delete=models.SET_NULL,
        related_name="comments",
        null=True,
        blank=True,
    )
    author_name = models.CharField(max_length=100, blank=True, default="")
    content = models.TextField()

    @property
    def display_name(self):
        if self.author_id:
            return self.author.name
        return self.author_name or "Anonymous"

    def __str__(self):
        return f"Comment by {self.display_name} on {self.poll.question}"


class Poll(TimeStampBaseMode):
    question = models.CharField(max_length=200)
    pub_date = models.DateTimeField("date published")
    is_active = models.BooleanField(default=True)
    generation_key = models.CharField(
        max_length=120,
        blank=True,
        null=True,
        unique=True,
    )
    closes_at = models.DateTimeField(null=True, blank=True)
    author = models.ForeignKey(Author, on_delete=models.CASCADE, related_name="polls")

    @property
    def is_auto_generated(self):
        return bool(self.generation_key)

    def __str__(self):
        return self.question


class Choice(TimeStampBaseMode):
    poll = models.ForeignKey(Poll, on_delete=models.CASCADE)
    choice_text = models.CharField(max_length=200)

    @property
    def votes(self):
        prefetched = getattr(self, "_prefetched_objects_cache", {}).get(
            "vote_records"
        )

        if prefetched is not None:
            return len(prefetched)

        return self.vote_records.count()

    def __str__(self):
        return self.choice_text


class Vote(TimeStampBaseMode):
    poll = models.ForeignKey(Poll, on_delete=models.CASCADE, related_name="votes")
    choice = models.ForeignKey(
        Choice,
        on_delete=models.CASCADE,
        related_name="vote_records",
    )
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="poll_votes",
        null=True,
        blank=True,
    )
    voter_key = models.CharField(max_length=64, blank=True, default="")

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["poll", "user"],
                condition=models.Q(user__isnull=False),
                name="unique_user_vote_per_poll",
            ),
            models.UniqueConstraint(
                fields=["poll", "voter_key"],
                condition=models.Q(user__isnull=True),
                name="unique_session_vote_per_poll",
            ),
        ]

    def __str__(self):
        return f"Vote for {self.choice.choice_text} on {self.poll.question}"


class CommentLike(TimeStampBaseMode):
    comment = models.ForeignKey(
        Comment,
        on_delete=models.CASCADE,
        related_name="likes",
    )
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="comment_likes",
        null=True,
        blank=True,
    )
    voter_key = models.CharField(max_length=64, blank=True, default="")

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["comment", "user"],
                condition=models.Q(user__isnull=False),
                name="unique_user_like_per_comment",
            ),
            models.UniqueConstraint(
                fields=["comment", "voter_key"],
                condition=models.Q(user__isnull=True),
                name="unique_session_like_per_comment",
            ),
        ]

    def __str__(self):
        return f"Like on comment {self.comment_id}"
