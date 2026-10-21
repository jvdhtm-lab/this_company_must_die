import os

from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand

from polls.models import Author


class Command(BaseCommand):
    help = "Create or update the demo account used by the frontend."

    def handle(self, *args, **options):
        username = os.environ.get("DEMO_USERNAME", "demo")
        password = os.environ.get("DEMO_PASSWORD", "demo12345")
        email = os.environ.get("DEMO_EMAIL", "demo@example.com")
        author_name = os.environ.get("DEMO_AUTHOR_NAME", "Demo")

        User = get_user_model()
        user, created = User.objects.get_or_create(
            username=username,
            defaults={"email": email},
        )

        user.email = email
        user.set_password(password)
        user.save()

        author, author_created = Author.objects.get_or_create(
            user=user,
            defaults={"name": author_name, "email": email},
        )

        state = "created" if created or author_created else "updated"
        self.stdout.write(
            self.style.SUCCESS(
                f"Demo account {username!r} {state} with author {author.name!r}."
            )
        )
