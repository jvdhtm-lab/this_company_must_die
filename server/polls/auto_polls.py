from datetime import datetime, time, timedelta
from datetime import timezone as dt_timezone

from django.db import transaction
from django.utils import timezone

from polls.company_data import (
    AUTO_POLL_AUTHOR_EMAIL,
    AUTO_POLL_AUTHOR_NAME,
    AUTO_POLL_QUESTION,
    AUTO_POLL_SOURCE,
    SP500_TOP_20,
)
from polls.models import Author, Choice, Poll


def current_week_window(now=None):
    now = now or timezone.now()

    if timezone.is_naive(now):
        now = timezone.make_aware(now, dt_timezone.utc)

    utc_now = now.astimezone(dt_timezone.utc)
    week_start_date = utc_now.date() - timedelta(days=utc_now.weekday())
    week_start = datetime.combine(
        week_start_date,
        time.min,
        tzinfo=dt_timezone.utc,
    )
    week_end = week_start + timedelta(days=7)
    iso_year, iso_week, _ = week_start_date.isocalendar()
    generation_key = f"{AUTO_POLL_SOURCE}-{iso_year}-W{iso_week:02d}"

    return week_start, week_end, generation_key


def close_expired_auto_polls(now=None):
    now = now or timezone.now()

    return Poll.objects.filter(
        generation_key__startswith=f"{AUTO_POLL_SOURCE}-",
        is_active=True,
        closes_at__lte=now,
    ).update(is_active=False)


@transaction.atomic
def ensure_weekly_poll(now=None):
    now = now or timezone.now()
    _, week_end, generation_key = current_week_window(now)
    existing = Poll.objects.filter(generation_key=generation_key).first()

    if existing is not None:
        Poll.objects.filter(
            generation_key__startswith=f"{AUTO_POLL_SOURCE}-",
            is_active=True,
        ).exclude(id=existing.id).update(is_active=False)
        return existing

    author, _ = Author.objects.get_or_create(
        email=AUTO_POLL_AUTHOR_EMAIL,
        defaults={"name": AUTO_POLL_AUTHOR_NAME},
    )

    Poll.objects.filter(
        generation_key__startswith=f"{AUTO_POLL_SOURCE}-",
        is_active=True,
    ).update(is_active=False)

    poll = Poll.objects.create(
        question=AUTO_POLL_QUESTION,
        pub_date=now,
        author=author,
        generation_key=generation_key,
        closes_at=week_end,
    )
    Choice.objects.bulk_create(
        [Choice(poll=poll, choice_text=name) for name in SP500_TOP_20]
    )

    return poll
