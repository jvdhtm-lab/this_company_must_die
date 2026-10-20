from django.core.management.base import BaseCommand

from polls.auto_polls import current_week_window, ensure_weekly_poll
from polls.company_data import SP500_TOP_20


class Command(BaseCommand):
    help = "Generate the weekly S&P 500 top-20 poll."

    def handle(self, *args, **options):
        _, _, generation_key = current_week_window()
        poll = ensure_weekly_poll()

        self.stdout.write(
            self.style.SUCCESS(
                f"Poll {poll.id} is active for {generation_key} "
                f"with {len(SP500_TOP_20)} choices."
            )
        )
