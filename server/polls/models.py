from base.models import TimeStampBaseMode
from django.db import models


class Author(TimeStampBaseMode):
    name = models.CharField(max_length=100)
    email = models.EmailField(unique=True)

    def __str__(self):
        return self.name


class Comment(TimeStampBaseMode):
    poll = models.ForeignKey("Poll", on_delete=models.CASCADE, related_name="comments")
    author = models.ForeignKey(Author, on_delete=models.CASCADE, related_name="comments")
    content = models.TextField()

    def __str__(self):
        return f"Comment by {self.author.name} on {self.poll.question}"


class Poll(TimeStampBaseMode):
    question = models.CharField(max_length=200)
    pub_date = models.DateTimeField("date published")
    author = models.ForeignKey(Author, on_delete=models.CASCADE, related_name="polls")

    def __str__(self):
        return self.question


class Choice(TimeStampBaseMode):
    poll = models.ForeignKey(Poll, on_delete=models.CASCADE)
    choice_text = models.CharField(max_length=200)
    votes = models.IntegerField(default=0)

    def __str__(self):
        return self.choice_text
