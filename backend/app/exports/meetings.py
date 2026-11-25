from __future__ import annotations

import io
from datetime import date, datetime
from xml.sax.saxutils import escape

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import Paragraph, Spacer

from app.exports.pdf_utils import (
    PdfBranding,
    create_document,
    heading,
    make_table,
)
from app.schemas.communication import MeetingPointRead, MeetingRead

MEETING_TYPE_LABELS = {
    "team": "Réunion d'équipe",
    "service": "Réunion de service",
    "project": "Réunion de projet",
    "manager_1on1": "Point avec la responsable",
    "crisis": "Cellule de crise",
    "interpark": "Réunion interparcs",
    "external": "Réunion avec des partenaires externes",
    "other": "Autre",
}

MEETING_STATUS_LABELS = {
    "planned": "Planifiée",
    "done": "Réalisée",
    "cancelled": "Annulée",
}

POINT_STATUS_LABELS = {
    "open": "Ouvert",
    "in_progress": "En cours",
    "blocked": "Bloqué",
    "done": "Traité",
}

PRIORITY_LABELS = {
    "low": "Basse",
    "medium": "Moyenne",
    "high": "Haute",
    "critical": "Critique",
}


def _styles() -> dict[str, ParagraphStyle]:
    base = getSampleStyleSheet()
    primary = colors.HexColor("#772B2F")
    return {
        "title": ParagraphStyle(
            "MeetingTitle",
            parent=base["Title"],
            fontName="Helvetica-Bold",
            fontSize=16,
            leading=20,
            textColor=primary,
            alignment=0,
            spaceAfter=2,
        ),
        "subtitle": ParagraphStyle(
            "MeetingSubtitle",
            parent=base["Normal"],
            fontName="Helvetica",
            fontSize=9,
            leading=12,
            textColor=colors.HexColor("#555555"),
            spaceAfter=8,
        ),
        "body": ParagraphStyle(
            "MeetingBody",
            parent=base["Normal"],
            fontName="Helvetica",
            fontSize=9,
            leading=13,
            textColor=colors.HexColor("#1F2933"),
            spaceAfter=4,
        ),
        "empty": ParagraphStyle(
            "MeetingEmpty",
            parent=base["Normal"],
            fontName="Helvetica-Oblique",
            fontSize=9,
            leading=13,
            textColor=colors.HexColor("#777777"),
            spaceAfter=4,
        ),
        "label": ParagraphStyle(
            "MeetingLabel",
            parent=base["Normal"],
            fontName="Helvetica-Bold",
            fontSize=8,
            leading=11,
            textColor=colors.HexColor("#555555"),
        ),
        "value": ParagraphStyle(
            "MeetingValue",
            parent=base["Normal"],
            fontName="Helvetica",
            fontSize=8,
            leading=11,
            textColor=colors.HexColor("#1F2933"),
        ),
    }


def _multiline(value: str | None) -> str:
    if not value:
        return ""
    return escape(value).replace("\n", "<br/>")


def _date(value: date | datetime | None) -> str:
    if value is None:
        return "—"
    return value.strftime("%d/%m/%Y")


def _datetime(value: datetime | None) -> str:
    if value is None:
        return "—"
    return value.strftime("%d/%m/%Y à %H:%M")


def _person(user) -> str:  # noqa: ANN001
    if user is None:
        return "—"
    return f"{user.first_name} {user.last_name}".strip()


def _section(
    title: str,
    content: str | None,
    styles: dict[str, ParagraphStyle],
    story: list,
) -> None:
    story.append(heading(title))
    if content and content.strip():
        story.append(Paragraph(_multiline(content), styles["body"]))
    else:
        story.append(Paragraph("Non renseigné.", styles["empty"]))
    story.append(Spacer(1, 3 * mm))


def meeting_report_markdown(
    meeting: MeetingRead,
    points: list[MeetingPointRead],
) -> str:
    lines: list[str] = [
        f"# {meeting.title}",
        "",
        f"**Rapport généré le {datetime.now().strftime('%d/%m/%Y à %H:%M')}**",
        "",
        f"- **Date :** {_datetime(meeting.scheduled_at)}",
        f"- **Durée :** {meeting.duration_minutes} minutes",
        f"- **Type :** {MEETING_TYPE_LABELS.get(meeting.meeting_type, meeting.meeting_type)}",
        f"- **Statut :** {MEETING_STATUS_LABELS.get(meeting.status, meeting.status)}",
        f"- **Lieu :** {meeting.location or '—'}",
        f"- **Visio :** {meeting.visio_url or '—'}",
        f"- **Organisateur :** {_person(meeting.organizer)}",
        "",
        "## Participants",
        "",
    ]
    internal = [_person(user) for user in meeting.participants]
    lines.append(
        f"- **Internes :** {', '.join(internal) if internal else 'Aucun'}"
    )
    lines.append(
        "- **Structures invitées :** "
        f"{', '.join(meeting.external_organizations) if meeting.external_organizations else 'Aucune'}"
    )
    lines.append(
        "- **Externes :** "
        f"{', '.join(meeting.external_participants) if meeting.external_participants else 'Aucun'}"
    )
    lines.append("")

    def section(title: str, content: str | None) -> None:
        lines.extend([f"## {title}", "", content.strip() if content else "Non renseigné.", ""])

    section("Ordre du jour", meeting.agenda)
    section("Compte rendu et échanges", meeting.notes)
    section("Décisions et actions", meeting.decisions)

    lines.extend(
        [
            "## Points de suivi",
            "",
            "| Point | Statut | Priorité | Échéance | Responsable |",
            "|---|---|---|---|---|",
        ]
    )
    if points:
        for point in points:
            label = point.title
            if point.description:
                label = f"{label} — {point.description}"
            lines.append(
                "| "
                + " | ".join(
                    [
                        label.replace("|", "\\|"),
                        POINT_STATUS_LABELS.get(point.status, point.status),
                        PRIORITY_LABELS.get(point.priority, point.priority),
                        _date(point.due_date),
                        _person(point.owner),
                    ]
                )
                + " |"
            )
    else:
        lines.append("| Aucun point de suivi | — | — | — | — |")
    lines.append("")
    lines.append(
        "_Document généré automatiquement à partir des informations saisies dans SI PILOT. "
        "Les données personnelles doivent être vérifiées avant diffusion._"
    )
    return "\n".join(lines)


def meeting_report_pdf(
    meeting: MeetingRead,
    points: list[MeetingPointRead],
    *,
    branding: PdfBranding | None = None,
) -> bytes:
    buffer = io.BytesIO()
    styles = _styles()
    document = create_document(
        buffer,
        title="Rapport de réunion",
        subtitle=meeting.title,
        pagesize=A4,
        branding=branding,
    )

    story: list = []
    story.append(Paragraph(escape(meeting.title), styles["title"]))
    story.append(
        Paragraph(
            f"Rapport généré le {datetime.now().strftime('%d/%m/%Y à %H:%M')}",
            styles["subtitle"],
        )
    )

    meta_rows = [
        ["Date", _datetime(meeting.scheduled_at)],
        ["Durée", f"{meeting.duration_minutes} minutes"],
        [
            "Type",
            MEETING_TYPE_LABELS.get(meeting.meeting_type, meeting.meeting_type),
        ],
        ["Statut", MEETING_STATUS_LABELS.get(meeting.status, meeting.status)],
        ["Lieu", meeting.location or "—"],
        ["Visio", meeting.visio_url or "—"],
        ["Organisateur", _person(meeting.organizer)],
    ]
    story.append(
        make_table(
            meta_rows,
            [32 * mm, 158 * mm],
            font_size=8,
            header=False,
        )
    )
    story.append(Spacer(1, 5 * mm))

    story.append(heading("Participants"))
    internal = [_person(user) for user in meeting.participants]
    if internal:
        story.append(Paragraph("Participants internes :", styles["label"]))
        story.append(Paragraph(escape(", ".join(internal)), styles["body"]))
    else:
        story.append(Paragraph("Aucun participant interne renseigné.", styles["empty"]))
    if meeting.external_organizations:
        story.append(Paragraph("Structures et partenaires invités :", styles["label"]))
        story.append(
            Paragraph(escape(", ".join(meeting.external_organizations)), styles["body"])
        )
    if meeting.external_participants:
        story.append(Paragraph("Participants externes :", styles["label"]))
        story.append(
            Paragraph(escape(", ".join(meeting.external_participants)), styles["body"])
        )
    story.append(Spacer(1, 4 * mm))

    _section("Ordre du jour", meeting.agenda, styles, story)
    _section("Compte rendu et échanges", meeting.notes, styles, story)
    _section("Décisions et actions", meeting.decisions, styles, story)

    story.append(heading("Points de suivi"))
    if points:
        rows = [
            [
                "Point",
                "Statut",
                "Priorité",
                "Échéance",
                "Responsable",
            ]
        ]
        for point in points:
            label = point.title
            if point.description:
                label = f"{label} — {point.description}"
            rows.append(
                [
                    label,
                    POINT_STATUS_LABELS.get(point.status, point.status),
                    PRIORITY_LABELS.get(point.priority, point.priority),
                    _date(point.due_date),
                    _person(point.owner),
                ]
            )
        story.append(
            make_table(
                rows,
                [86 * mm, 24 * mm, 22 * mm, 24 * mm, 34 * mm],
                font_size=7.5,
            )
        )
    else:
        story.append(Paragraph("Aucun point de suivi rattaché à cette réunion.", styles["empty"]))

    story.append(Spacer(1, 6 * mm))
    story.append(
        Paragraph(
            "Document généré automatiquement à partir des informations saisies dans "
            "SI PILOT. Les données personnelles doivent être vérifiées avant diffusion.",
            styles["subtitle"],
        )
    )

    document.build(story)
    return buffer.getvalue()
