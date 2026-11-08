from __future__ import annotations

import io
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

LOGO_PATH = Path(__file__).resolve().parent / "assets" / "logoweb.png"
PRIMARY = "#772B2F"
BRAND = "Parc national de forêts"
APP_NAME = "SI PNFor PILOTE"


def create_document(
    buffer: io.BytesIO,
    *,
    title: str,
    subtitle: str = "",
    pagesize: tuple[float, float] | None = None,
) -> SimpleDocTemplate:
    page = pagesize or landscape(A4)
    document = SimpleDocTemplate(
        buffer,
        pagesize=page,
        leftMargin=8 * mm,
        rightMargin=8 * mm,
        topMargin=30 * mm,
        bottomMargin=16 * mm,
        title=f"{title} — {APP_NAME}",
        author=BRAND,
    )

    def decorate(canvas: Any, doc: Any) -> None:
        canvas.saveState()
        width, height = page
        if LOGO_PATH.exists():
            logo_width = 45 * mm
            logo_height = logo_width * 172 / 459
            canvas.drawImage(
                str(LOGO_PATH),
                10 * mm,
                height - 8 * mm - logo_height,
                width=logo_width,
                height=logo_height,
                preserveAspectRatio=True,
                mask="auto",
            )
        text_x = 60 * mm
        max_text_width = width - text_x - 10 * mm

        def fit(value: str, font: str, size: float) -> str:
            text = value
            while text and stringWidth(text, font, size) > max_text_width:
                text = text[:-1]
            return text

        canvas.setFillColor(colors.HexColor(PRIMARY))
        canvas.setFont("Helvetica-Bold", 13)
        canvas.drawString(text_x, height - 13 * mm, fit(APP_NAME, "Helvetica-Bold", 13))
        canvas.setFillColor(colors.HexColor("#555555"))
        canvas.setFont("Helvetica", 8)
        canvas.drawString(text_x, height - 18 * mm, fit(BRAND, "Helvetica", 8))
        canvas.setFillColor(colors.black)
        canvas.setFont("Helvetica-Bold", 10)
        canvas.drawString(text_x, height - 23.5 * mm, fit(title, "Helvetica-Bold", 10))
        if subtitle:
            canvas.setFillColor(colors.HexColor("#666666"))
            canvas.setFont("Helvetica", 7)
            canvas.drawString(text_x, height - 27 * mm, fit(subtitle, "Helvetica", 7))
        canvas.setStrokeColor(colors.HexColor(PRIMARY))
        canvas.setLineWidth(0.8)
        canvas.line(10 * mm, height - 29 * mm, width - 10 * mm, height - 29 * mm)
        canvas.setFillColor(colors.HexColor("#777777"))
        canvas.setFont("Helvetica", 7)
        canvas.drawString(
            10 * mm,
            7 * mm,
            f"{APP_NAME} · {BRAND} · {datetime.now().strftime('%d/%m/%Y %H:%M')}",
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
    table.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor(PRIMARY))
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
        textColor=colors.HexColor(PRIMARY),
        spaceBefore=6,
        spaceAfter=3,
    )
    return Paragraph(escape(text), style)
