"""One transactional email, sent over plain SMTP.

Training a voice takes twenty minutes and the person who started it has usually left by the
time it finishes. Nothing on the page can reach them after that; an email can. SMTP rather than
a provider SDK so the sender can be a Gmail app password today and a Resend/Postmark SMTP
endpoint later without touching code -- only the secret changes.

Every setting comes from the environment. With SMTP_HOST unset the function is a no-op, so a
deployment without mail configured keeps training exactly as before.
"""
from __future__ import annotations

import logging
import os
import smtplib
from email.message import EmailMessage

log = logging.getLogger(__name__)

SITE_URL = os.environ.get("SITE_URL", "https://coverly-omega.vercel.app").rstrip("/")


def send_mail(to: str, subject: str, text: str, html: str | None = None) -> bool:
    host = os.environ.get("SMTP_HOST", "").strip()
    user = os.environ.get("SMTP_USER", "").strip()
    password = os.environ.get("SMTP_PASS", "")
    sender = os.environ.get("MAIL_FROM", "").strip() or user
    port = int(os.environ.get("SMTP_PORT", "587") or 587)
    if not host or not sender or not to:
        log.info("mail skipped: SMTP not configured")
        return False

    message = EmailMessage()
    message["From"] = sender
    message["To"] = to
    message["Subject"] = subject
    message.set_content(text)
    if html:
        message.add_alternative(html, subtype="html")

    try:
        if port == 465:
            with smtplib.SMTP_SSL(host, port, timeout=20) as smtp:
                if user:
                    smtp.login(user, password)
                smtp.send_message(message)
        else:
            with smtplib.SMTP(host, port, timeout=20) as smtp:
                smtp.starttls()
                if user:
                    smtp.login(user, password)
                smtp.send_message(message)
        return True
    except Exception as exc:  # noqa: BLE001 - a failed notification must never fail the job
        log.warning("mail to %s failed: %s", to, exc)
        return False


def voice_ready_mail(to: str) -> bool:
    link = f"{SITE_URL}/"
    text = (
        "내 목소리가 준비됐어요.\n\n"
        f"{link} 에서 노래를 올리고 Voice 고르기에서 '내 목소리'를 선택하면 바로 만들 수 있어요.\n\n"
        "— Coverly"
    )
    html = (
        "<p>내 목소리가 준비됐어요.</p>"
        f'<p><a href="{link}">Coverly 열기</a> → 노래를 올리고 <b>내 목소리</b>를 골라 만들어 보세요.</p>'
        "<p style='color:#888;font-size:12px'>— Coverly</p>"
    )
    return send_mail(to, "Coverly · 내 목소리가 준비됐어요", text, html)


def voice_failed_mail(to: str, reason: str) -> bool:
    link = f"{SITE_URL}/"
    text = (
        "목소리를 만들지 못했어요.\n\n"
        f"이유: {reason}\n\n"
        f"{link} 에서 '지우고 다시 녹음하기'로 다시 시도할 수 있어요.\n\n"
        "— Coverly"
    )
    html = (
        "<p>목소리를 만들지 못했어요.</p>"
        f"<p>이유: {reason}</p>"
        f'<p><a href="{link}">Coverly 열기</a> → <b>지우고 다시 녹음하기</b>로 다시 시도할 수 있어요.</p>'
        "<p style='color:#888;font-size:12px'>— Coverly</p>"
    )
    return send_mail(to, "Coverly · 목소리를 만들지 못했어요", text, html)
