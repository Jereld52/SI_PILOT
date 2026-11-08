from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime, timedelta
from typing import Literal

from app.core.errors import ValidationAppError

Granularity = Literal["day", "week", "month", "year"]

MONTHS_FR = (
    "janv.",
    "févr.",
    "mars",
    "avr.",
    "mai",
    "juin",
    "juil.",
    "août",
    "sept.",
    "oct.",
    "nov.",
    "déc.",
)


@dataclass(frozen=True)
class StatPeriod:
    key: str
    label: str
    start: date
    end: date


def _start_of_week(value: date) -> date:
    return value - timedelta(days=value.weekday())


def _start_of_month(value: date) -> date:
    return value.replace(day=1)


def _next_month(value: date) -> date:
    if value.month == 12:
        return date(value.year + 1, 1, 1)
    return date(value.year, value.month + 1, 1)


def period_key(value: date | datetime, granularity: Granularity) -> str:
    current = value.date() if isinstance(value, datetime) else value
    if granularity == "day":
        return current.isoformat()
    if granularity == "week":
        iso = current.isocalendar()
        return f"{iso.year}-W{iso.week:02d}"
    if granularity == "month":
        return f"{current.year}-{current.month:02d}"
    return str(current.year)


def default_range(granularity: Granularity, today: date | None = None) -> tuple[date, date]:
    current = today or date.today()
    if granularity == "day":
        return current - timedelta(days=29), current
    if granularity == "week":
        return _start_of_week(current) - timedelta(weeks=11), current
    if granularity == "month":
        return date(current.year, 1, 1), current
    return date(current.year - 4, 1, 1), current


def build_periods(start: date, end: date, granularity: Granularity) -> list[StatPeriod]:
    if start > end:
        raise ValidationAppError("La date de début doit précéder la date de fin.")
    if granularity == "day":
        cursor = start
    elif granularity == "week":
        cursor = _start_of_week(start)
    elif granularity == "month":
        cursor = _start_of_month(start)
    else:
        cursor = date(start.year, 1, 1)

    periods: list[StatPeriod] = []
    while cursor <= end:
        if granularity == "day":
            period_end = cursor
            key = cursor.isoformat()
            label = cursor.strftime("%d/%m")
            next_cursor = cursor + timedelta(days=1)
        elif granularity == "week":
            period_end = cursor + timedelta(days=6)
            iso = cursor.isocalendar()
            key = f"{iso.year}-W{iso.week:02d}"
            label = f"S{iso.week:02d} {iso.year}"
            next_cursor = cursor + timedelta(days=7)
        elif granularity == "month":
            next_cursor = _next_month(cursor)
            period_end = next_cursor - timedelta(days=1)
            key = f"{cursor.year}-{cursor.month:02d}"
            label = f"{MONTHS_FR[cursor.month - 1]} {cursor.year}"
        else:
            period_end = date(cursor.year, 12, 31)
            key = str(cursor.year)
            label = str(cursor.year)
            next_cursor = date(cursor.year + 1, 1, 1)
        periods.append(StatPeriod(key=key, label=label, start=cursor, end=period_end))
        cursor = next_cursor
        if len(periods) > 400:
            raise ValidationAppError(
                "La période demandée est trop longue pour cette granularité."
            )
    return periods
