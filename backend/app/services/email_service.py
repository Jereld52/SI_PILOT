from __future__ import annotations

import json
import smtplib
from dataclasses import dataclass
from email.message import EmailMessage
from email.utils import formataddr

from app.core.crypto import decrypt_secret, encrypt_secret
from app.core.errors import ValidationAppError
from app.db.base import utcnow
from app.models.auth import User
from app.models.automation import EmailOutbox
from app.models.setting import Setting
from app.schemas.mail import SmtpSettingsRead, SmtpSettingsUpdate
from app.services.audit_service import write_audit
from fastapi import Request
from sqlalchemy.orm import Session


def _value(db: Session, key: str, default: object = "") -> object:
    setting = db.get(Setting, key)
    if setting is None or setting.value_json is None:
        return default
    try:
        return json.loads(setting.value_json)
    except json.JSONDecodeError:
        return setting.value_json


def _set_value(
    db: Session,
    key: str,
    value: object,
    *,
    category: str = "notifications",
    is_secret: bool = False,
    description: str | None = None,
) -> None:
    setting = db.get(Setting, key)
    if setting is None:
        setting = Setting(
            key=key,
            category=category,
            is_secret=is_secret,
            description=description,
        )
        db.add(setting)
    setting.value_json = json.dumps(value, ensure_ascii=False)
    setting.is_secret = is_secret


@dataclass(frozen=True)
class SmtpConfig:
    host: str
    port: int
    username: str
    password: str
    from_email: str
    from_name: str
    use_tls: bool
    use_ssl: bool
    enabled: bool

    @property
    def configured(self) -> bool:
        return bool(self.host and self.from_email)


def get_config(db: Session) -> SmtpConfig:
    encrypted = str(_value(db, "smtp.password_encrypted", "") or "")
    password = decrypt_secret(encrypted) if encrypted else ""
    return SmtpConfig(
        host=str(_value(db, "smtp.host", "") or ""),
        port=int(str(_value(db, "smtp.port", 587) or 587)),
        username=str(_value(db, "smtp.username", "") or ""),
        password=password or "",
        from_email=str(_value(db, "smtp.from_email", "") or ""),
        from_name=str(_value(db, "smtp.from_name", "SI PNFor PILOTE") or "SI PNFor PILOTE"),
        use_tls=bool(_value(db, "smtp.use_tls", True)),
        use_ssl=bool(_value(db, "smtp.use_ssl", False)),
        enabled=bool(_value(db, "notifications.email_enabled", False)),
    )


def get_settings(db: Session) -> SmtpSettingsRead:
    config = get_config(db)
    return SmtpSettingsRead(
        host=config.host,
        port=config.port,
        username=config.username,
        from_email=config.from_email,
        from_name=config.from_name,
        use_tls=config.use_tls,
        use_ssl=config.use_ssl,
        email_enabled=config.enabled,
        password_set=bool(config.password),
        configured=config.configured,
    )


def update_settings(
    db: Session,
    payload: SmtpSettingsUpdate,
    *,
    actor: User,
    request: Request | None = None,
) -> SmtpSettingsRead:
    if payload.use_ssl and payload.use_tls:
        raise ValidationAppError(
            "Choisissez soit SSL direct, soit STARTTLS, pas les deux."
        )
    if payload.email_enabled and (not payload.host.strip() or not payload.from_email.strip()):
        raise ValidationAppError(
            "Renseignez le serveur SMTP et l'adresse d'expédition pour activer les e-mails."
        )
    before = get_settings(db).model_dump()
    _set_value(db, "smtp.host", payload.host.strip())
    _set_value(db, "smtp.port", payload.port)
    _set_value(db, "smtp.username", payload.username.strip())
    _set_value(db, "smtp.from_email", payload.from_email.strip())
    _set_value(db, "smtp.from_name", payload.from_name.strip())
    _set_value(db, "smtp.use_tls", payload.use_tls)
    _set_value(db, "smtp.use_ssl", payload.use_ssl)
    _set_value(db, "notifications.email_enabled", payload.email_enabled)
    if payload.password:
        _set_value(
            db,
            "smtp.password_encrypted",
            encrypt_secret(payload.password) or "",
            is_secret=True,
            description="Mot de passe SMTP, chiffré",
        )
    write_audit(
        db,
        module="admin",
        action="smtp_settings_updated",
        actor=actor,
        entity_type="setting",
        entity_id="smtp",
        entity_label="Configuration SMTP",
        before=before,
        after={
            "host": payload.host.strip(),
            "port": payload.port,
            "from_email": payload.from_email.strip(),
            "email_enabled": payload.email_enabled,
            "password_changed": bool(payload.password),
        },
        request=request,
    )
    db.commit()
    return get_settings(db)


def _send(config: SmtpConfig, to_email: str, subject: str, body: str) -> None:
    message = EmailMessage()
    message["From"] = formataddr((config.from_name, config.from_email))
    message["To"] = to_email
    message["Subject"] = subject
    message.set_content(body)
    if config.use_ssl:
        server: smtplib.SMTP = smtplib.SMTP_SSL(
            config.host, config.port, timeout=20
        )
    else:
        server = smtplib.SMTP(config.host, config.port, timeout=20)
        if config.use_tls:
            server.starttls()
    try:
        if config.username:
            server.login(config.username, config.password)
        server.send_message(message)
    finally:
        server.quit()


def send_email(
    db: Session,
    to_email: str,
    subject: str,
    body: str,
    *,
    force: bool = False,
) -> bool:
    config = get_config(db)
    if not force and not config.enabled:
        return False
    outbox = EmailOutbox(
        to_email=to_email,
        subject=subject,
        body=body,
        status="pending",
        scheduled_at=utcnow(),
    )
    db.add(outbox)
    db.flush()
    if not config.configured:
        outbox.status = "error"
        outbox.error = "Configuration SMTP incomplète."
        return False
    try:
        _send(config, to_email, subject, body)
    except Exception as exc:  # noqa: BLE001 - le détail est conservé dans l'outbox
        outbox.status = "error"
        outbox.error = str(exc)[:2000]
        return False
    outbox.status = "sent"
    outbox.sent_at = utcnow()
    outbox.attempts = 1
    return True


def send_test_email(
    db: Session,
    to_email: str,
    *,
    actor: User,
    request: Request | None = None,
) -> str:
    config = get_config(db)
    if not config.configured:
        raise ValidationAppError(
            "Renseignez le serveur SMTP et l'adresse d'expédition avant de tester."
        )
    outbox = EmailOutbox(
        to_email=to_email,
        subject="Test de configuration SMTP — SI PNFor PILOTE",
        body=(
            "Cet e-mail confirme que la configuration SMTP de SI PNFor PILOTE "
            "est opérationnelle."
        ),
        status="pending",
        scheduled_at=utcnow(),
    )
    db.add(outbox)
    db.flush()
    try:
        _send(config, to_email, outbox.subject, outbox.body)
    except Exception as exc:  # noqa: BLE001
        outbox.status = "error"
        outbox.error = str(exc)[:2000]
        write_audit(
            db,
            module="admin",
            action="smtp_test_failed",
            actor=actor,
            entity_type="setting",
            entity_id="smtp",
            entity_label="Test SMTP",
            after={"to": to_email, "error": outbox.error},
            request=request,
        )
        db.commit()
        raise ValidationAppError(f"Échec de l'envoi du test SMTP : {exc}") from exc
    outbox.status = "sent"
    outbox.sent_at = utcnow()
    outbox.attempts = 1
    write_audit(
        db,
        module="admin",
        action="smtp_test_sent",
        actor=actor,
        entity_type="setting",
        entity_id="smtp",
        entity_label="Test SMTP",
        after={"to": to_email},
        request=request,
    )
    db.commit()
    return "E-mail de test envoyé."
