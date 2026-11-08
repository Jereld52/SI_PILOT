from __future__ import annotations

import io
from contextvars import ContextVar
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Any
from xml.sax.saxutils import escape

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4, landscape
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.pdfbase.pdfmetrics import stringWidth
from reportlab.platypus import Paragraph, SimpleDocTemplate, Table, TableStyle

DEFAULT_LOGO_PATH = Path(__file__).resolve().parent / "assets" / "logoweb.png"
PRIMARY = "#772B2F"
BRAND = "Votre structure"
APP_NAME = "SI PILOT"

_PRIMARY_COLOR: ContextVar[str] = ContextVar("pdf_primary_color", default=PRIMARY)


@dataclass(frozen=True)
class PdfBranding:
    app_name: str = APP_NAME
    organization_name: str = BRAND
    logo_path: Path | None = DEFAULT_LOGO_PATH
    primary_color: str = PRIMARY


def _valid_color(value: str) -> str:
    candidate = value.strip()
    if len(candidate) == 7 and candidate.startswith("#"):
        try:
            int(candidate[1:], 16)
        except ValueError:
            return PRIMARY
        return candidate
    return PRIMARY


def _logo_size(path: Path) -> tuple[float, float]:
    try:
        from PIL import Image

        with Image.open(path) as image:
            return float(image.width), float(image.height)
    except (OSError, ValueError):
        return 459.0, 172.0


def create_document(
    buffer: io.BytesIO,
    *,
    title: str,
    subtitle: str = "",
    pagesize: tuple[float, float] | None = None,
    branding: PdfBranding | None = None,
) -> SimpleDocTemplate:
    identity = branding or PdfBranding()
    primary = _valid_color(identity.primary_color)
    _PRIMARY_COLOR.set(primary)
    page = pagesize or landscape(A4)
    document = SimpleDocTemplate(
        buffer,
        pagesize=page,
        leftMargin=8 * mm,
        rightMargin=8 * mm,
        topMargin=30 * mm,
        bottomMargin=16 * mm,
        title=f"{title} — {identity.app_name}",
        author=identity.organization_name,
    )

    def decorate(canvas: Any, doc: Any) -> None:
        canvas.saveState()
        width, height = page
        logo_width = 0.0
        logo_height = 0.0
        logo_path = identity.logo_path
        if logo_path is not None and logo_path.is_file():
            source_width, source_height = _logo_size(logo_path)
            if source_width > 0 and source_height > 0:
                scale = min(45 * mm / source_width, 14 * mm / source_height)
                logo_width = source_width * scale
                logo_height = source_height * scale
                canvas.drawImage(
                    str(logo_path),
                    10 * mm,
                    height - 8 * mm - logo_height,
                    width=logo_width,
                    height=logo_height,
                    preserveAspectRatio=True,
                    mask="auto",
                )
        text_x = 10 * mm + logo_width + (5 * mm if logo_width else 0)
        max_text_width = width - text_x - 10 * mm

        def fit(value: str, font: str, size: float) -> str:
            text = value
            while text and stringWidth(text, font, size) > max_text_width:
                text = text[:-1]
            return text

        canvas.setFillColor(colors.HexColor(primary))
        canvas.setFont("Helvetica-Bold", 13)
        canvas.drawString(
            text_x, height - 13 * mm, fit(identity.app_name, "Helvetica-Bold", 13)
        )
        canvas.setFillColor(colors.HexColor("#555555"))
        canvas.setFont("Helvetica", 8)
        canvas.drawString(
            text_x,
            height - 18 * mm,
            fit(identity.organization_name, "Helvetica", 8),
        )
        canvas.setFillColor(colors.black)
        canvas.setFont("Helvetica-Bold", 10)
        canvas.drawString(text_x, height - 23.5 * mm, fit(title, "Helvetica-Bold", 10))
        if subtitle:
            canvas.setFillColor(colors.HexColor("#666666"))
            canvas.setFont("Helvetica", 7)
            canvas.drawString(text_x, height - 27 * mm, fit(subtitle, "Helvetica", 7))
        canvas.setStrokeColor(colors.HexColor(primary))
        canvas.setLineWidth(0.8)
        canvas.line(10 * mm, height - 29 * mm, width - 10 * mm, height - 29 * mm)
        canvas.setFillColor(colors.HexColor("#777777"))
        canvas.setFont("Helvetica", 7)
        canvas.drawString(
            10 * mm,
            7 * mm,
            f"{identity.app_name} · {identity.organization_name} · "
            f"{datetime.now().strftime('%d/%m/%Y %H:%M')}",
        )
        canvas.drawRightString(width - 10 * mm, 7 * mm, f"Page {doc.page}")
        canvas.restoreState()

    document.onFirstPage = decorate
    document.onLaterPages = decorate
    return document


def _styles(font_size: float) -> tuple[ParagraphStyle, ParagraphStyle]:
    base = getSampleStyleSheet()["Normal"]
    header = ParagraphStyle(
        "PdfHeaderCell",
        parent=base,
        fontName="Helvetica-Bold",
        fontSize=max(6, font_size - 0.3),
        leading=max(7, font_size + 0.8),
        textColor=colors.HexColor("#F3EFE2"),
    )
    cell = ParagraphStyle(
        "PdfBodyCell",
        parent=base,
        fontName="Helvetica",
        fontSize=font_size,
        leading=max(7, font_size + 1.2),
        textColor=colors.HexColor("#1F2933"),
    )
    return header, cell


def make_table(
    rows: list[list[Any]],
    col_widths: list[float],
    *,
    font_size: float = 6.5,
    header: bool = True,
) -> Table:
    header_style, cell_style = _styles(font_size)
    data: list[list[Any]] = []
    for row_index, row in enumerate(rows):
        is_header = header and row_index == 0
        data.append(
            [
                Paragraph(
                    escape(str(value if value is not None else "")),
                    header_style if is_header else cell_style,
                )
                for value in row
            ]
        )
    table = Table(data, repeatRows=1 if header else 0, colWidths=col_widths)
    primary = _PRIMARY_COLOR.get()
    table.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor(primary))
                if header
                else ("BACKGROUND", (0, 0), (-1, -1), colors.white),
                ("GRID", (0, 0), (-1, -1), 0.25, colors.HexColor("#CDCDCD")),
                ("ROWBACKGROUNDS", (0, 1 if header else 0), (-1, -1), [colors.white, colors.HexColor("#F7F4EA")]),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("LEFTPADDING", (0, 0), (-1, -1), 2.5),
                ("RIGHTPADDING", (0, 0), (-1, -1), 2.5),
                ("TOPPADDING", (0, 0), (-1, -1), 2),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 2),
            ]
        )
    )
    return table


def meta_line(*, count: int, label: str = "ligne(s)") -> Paragraph:
    style = ParagraphStyle(
        "PdfMeta",
        parent=getSampleStyleSheet()["Normal"],
        fontSize=8,
        leading=10,
        textColor=colors.HexColor("#555555"),
        spaceAfter=4,
    )
    return Paragraph(
        f"{count} {label} · export généré le {datetime.now().strftime('%d/%m/%Y à %H:%M')}",
        style,
    )


def heading(text: str) -> Paragraph:
    style = ParagraphStyle(
        "PdfHeading",
        parent=getSampleStyleSheet()["Heading2"],
        fontSize=10,
        leading=12,
        textColor=colors.HexColor(_PRIMARY_COLOR.get()),
        spaceBefore=6,
        spaceAfter=3,
    )
    return Paragraph(escape(text), style)
