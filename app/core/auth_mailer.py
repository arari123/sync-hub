from __future__ import annotations

from email.message import EmailMessage
import os
import smtplib


def build_verify_link(token: str) -> str:
    base_url = os.getenv("AUTH_FRONTEND_BASE_URL", "http://localhost:8000").rstrip("/")
    return f"{base_url}/verify-email?token={token}"


def send_verification_email(to_email: str, verify_link: str) -> bool:
    smtp_host = (os.getenv("AUTH_SMTP_HOST") or "").strip()
    smtp_port = int(os.getenv("AUTH_SMTP_PORT", "587"))
    smtp_user = (os.getenv("AUTH_SMTP_USER") or "").strip()
    smtp_password = (os.getenv("AUTH_SMTP_PASSWORD") or "").strip()
    smtp_from = (os.getenv("AUTH_SMTP_FROM") or "no-reply@sync-hub.local").strip()
    use_ssl = (os.getenv("AUTH_SMTP_USE_SSL", "false").strip().lower() in {"1", "true", "yes", "on"})
    use_starttls = (
        os.getenv("AUTH_SMTP_USE_STARTTLS", "true").strip().lower() in {"1", "true", "yes", "on"}
    )

    if not smtp_host:
        print("[auth] SMTP host is not configured; verification email skipped.")
        return False

    message = EmailMessage()
    message["Subject"] = "Sync-Hub 이메일 인증"
    message["From"] = smtp_from
    message["To"] = to_email
    message.set_content(
        "Sync-Hub 가입을 완료하려면 아래 링크를 열어 이메일 인증을 진행하세요.\n\n"
        f"{verify_link}\n\n"
        "요청하지 않았다면 이 메일을 무시하세요."
    )

    try:
        if use_ssl:
            with smtplib.SMTP_SSL(smtp_host, smtp_port, timeout=15) as smtp:
                if smtp_user:
                    smtp.login(smtp_user, smtp_password)
                smtp.send_message(message)
            return True

        with smtplib.SMTP(smtp_host, smtp_port, timeout=15) as smtp:
            if use_starttls:
                smtp.starttls()
            if smtp_user:
                smtp.login(smtp_user, smtp_password)
            smtp.send_message(message)
        return True
    except Exception as exc:  # noqa: BLE001
        print(f"[auth] Failed to send verification email: {exc}")
        return False
