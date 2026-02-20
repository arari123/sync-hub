from __future__ import annotations

import os
from typing import Optional

from fastapi import APIRouter, Cookie, Depends, Header, HTTPException, Response, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from .. import models
from ..core.auth_mailer import build_verify_link, send_verification_email
from ..core.auth_utils import (
    auth_allowed_domains,
    generate_token,
    hash_password,
    hash_token,
    is_email_domain_allowed,
    is_valid_email,
    normalize_email,
    parse_iso,
    session_expiry,
    to_iso,
    token_expiry,
    utcnow,
    verify_password,
)
from ..core.admin_access import is_admin_user
from ..database import get_db

router = APIRouter(prefix="/auth", tags=["auth"])

VERIFY_TOKEN_TTL_MINUTES = max(5, int(os.getenv("AUTH_VERIFY_TOKEN_TTL_MINUTES", "60")))
SESSION_TTL_HOURS = max(1, int(os.getenv("AUTH_SESSION_TTL_HOURS", "24")))
AUTH_DEBUG_VERIFY_LINK = os.getenv("AUTH_EMAIL_DEBUG_LINK", "true").strip().lower() in {"1", "true", "yes", "on"}
SESSION_COOKIE_NAME = (os.getenv("AUTH_SESSION_COOKIE_NAME") or "sync_hub_session").strip() or "sync_hub_session"
SESSION_COOKIE_SECURE = os.getenv("AUTH_SESSION_COOKIE_SECURE", "false").strip().lower() in {"1", "true", "yes", "on"}
SESSION_COOKIE_SAMESITE = (os.getenv("AUTH_SESSION_COOKIE_SAMESITE", "lax") or "lax").strip().lower()
if SESSION_COOKIE_SAMESITE not in {"lax", "strict", "none"}:
    SESSION_COOKIE_SAMESITE = "lax"
SESSION_COOKIE_PATH = (os.getenv("AUTH_SESSION_COOKIE_PATH") or "/").strip() or "/"
SESSION_COOKIE_DOMAIN = (os.getenv("AUTH_SESSION_COOKIE_DOMAIN") or "").strip() or None


class SignupRequest(BaseModel):
    email: str = Field(..., max_length=255)
    password: str = Field(..., min_length=8, max_length=128)
    full_name: Optional[str] = Field(default=None, max_length=120)


class VerifyEmailRequest(BaseModel):
    token: str = Field(..., min_length=16, max_length=256)


class LoginRequest(BaseModel):
    email: str = Field(..., max_length=255)
    password: str = Field(..., min_length=8, max_length=128)


def _serialize_user(user: models.User) -> dict:
    return {
        "id": int(user.id),
        "email": user.email,
        "full_name": user.full_name or "",
        "email_verified": bool(user.email_verified),
        "is_active": bool(user.is_active),
    }


def _extract_bearer_token(authorization: str) -> str:
    value = (authorization or "").strip()
    if not value:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Authentication required.")
    parts = value.split(" ", 1)
    if len(parts) != 2 or parts[0].lower() != "bearer" or not parts[1].strip():
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid authorization header.")
    return parts[1].strip()


def _resolve_access_token(authorization: str, session_cookie_token: Optional[str]) -> str:
    header_value = (authorization or "").strip()
    if header_value:
        return _extract_bearer_token(header_value)

    cookie_token = (session_cookie_token or "").strip()
    if cookie_token:
        return cookie_token

    raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Authentication required.")


def _set_auth_cookie(response: Response, token: str) -> None:
    response.set_cookie(
        key=SESSION_COOKIE_NAME,
        value=token,
        max_age=max(1, int(SESSION_TTL_HOURS)) * 3600,
        httponly=True,
        secure=SESSION_COOKIE_SECURE,
        samesite=SESSION_COOKIE_SAMESITE,
        path=SESSION_COOKIE_PATH,
        domain=SESSION_COOKIE_DOMAIN,
    )


def _clear_auth_cookie(response: Response) -> None:
    response.delete_cookie(
        key=SESSION_COOKIE_NAME,
        path=SESSION_COOKIE_PATH,
        domain=SESSION_COOKIE_DOMAIN,
    )


def _resolve_session(token: str, db: Session) -> models.AuthSession:
    token_digest = hash_token(token)
    session = (
        db.query(models.AuthSession)
        .filter(models.AuthSession.token_hash == token_digest)
        .first()
    )
    if not session:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Session not found.")

    if session.revoked_at:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Session is revoked.")

    if parse_iso(session.expires_at) <= utcnow():
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Session expired.")

    return session


def get_current_user(
    authorization: str = Header(default=""),
    session_cookie_token: Optional[str] = Cookie(default=None, alias=SESSION_COOKIE_NAME),
    db: Session = Depends(get_db),
) -> models.User:
    token = _resolve_access_token(authorization, session_cookie_token)
    session = _resolve_session(token, db)
    user = db.query(models.User).filter(models.User.id == session.user_id).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found.")
    if not user.is_active or not user.email_verified:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="User is inactive.")
    return user


def get_current_admin_user(user: models.User = Depends(get_current_user)) -> models.User:
    if not is_admin_user(user):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin privileges required.")
    return user


@router.post("/signup")
def signup(payload: SignupRequest, db: Session = Depends(get_db)):
    email = normalize_email(payload.email)
    if not is_valid_email(email):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid email format.")

    allowed_domains = auth_allowed_domains()
    if not is_email_domain_allowed(email, allowed_domains):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Only allowed email domains can sign up: {', '.join(allowed_domains)}",
        )

    now_iso = to_iso(utcnow())
    user = db.query(models.User).filter(models.User.email == email).first()

    if user and user.email_verified:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Email is already registered.")

    if user is None:
        user = models.User(
            email=email,
            full_name=(payload.full_name or "").strip() or None,
            password_hash=hash_password(payload.password),
            is_active=False,
            email_verified=False,
            created_at=now_iso,
            updated_at=now_iso,
        )
        db.add(user)
        db.flush()
    else:
        user.full_name = (payload.full_name or "").strip() or user.full_name
        user.password_hash = hash_password(payload.password)
        user.updated_at = now_iso
        user.is_active = False
        user.email_verified = False
        db.flush()

    raw_token = generate_token()
    verify_token = models.EmailVerificationToken(
        user_id=user.id,
        token_hash=hash_token(raw_token),
        expires_at=to_iso(token_expiry(VERIFY_TOKEN_TTL_MINUTES)),
        consumed_at=None,
        created_at=now_iso,
    )
    db.add(verify_token)
    db.commit()

    verify_link = build_verify_link(raw_token)
    email_sent = send_verification_email(user.email, verify_link)

    response = {
        "message": "가입 요청이 접수되었습니다. 메일 인증을 완료해 주세요.",
        "email_sent": bool(email_sent),
    }
    if AUTH_DEBUG_VERIFY_LINK:
        response["debug_verify_link"] = verify_link
    return response


@router.post("/verify-email")
def verify_email(payload: VerifyEmailRequest, db: Session = Depends(get_db)):
    token_digest = hash_token(payload.token)
    verification = (
        db.query(models.EmailVerificationToken)
        .filter(models.EmailVerificationToken.token_hash == token_digest)
        .first()
    )
    if not verification:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid verification token.")

    if verification.consumed_at:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Verification token already used.")

    expires_at = parse_iso(verification.expires_at)
    if expires_at <= utcnow():
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Verification token expired.")

    user = db.query(models.User).filter(models.User.id == verification.user_id).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="User not found for token.")

    now_iso = to_iso(utcnow())
    verification.consumed_at = now_iso
    user.email_verified = True
    user.is_active = True
    user.updated_at = now_iso
    db.commit()

    return {"message": "이메일 인증이 완료되었습니다."}


@router.post("/login")
def login(payload: LoginRequest, response: Response, db: Session = Depends(get_db)):
    email = normalize_email(payload.email)
    user = db.query(models.User).filter(models.User.email == email).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid email or password.")

    if not verify_password(payload.password, user.password_hash):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid email or password.")

    if not user.email_verified:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Email verification is required.")

    if not user.is_active:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="User is inactive.")

    raw_token = generate_token()
    session = models.AuthSession(
        user_id=user.id,
        token_hash=hash_token(raw_token),
        expires_at=to_iso(session_expiry(SESSION_TTL_HOURS)),
        revoked_at=None,
        created_at=to_iso(utcnow()),
    )
    db.add(session)
    db.commit()
    _set_auth_cookie(response, raw_token)

    return {
        "access_token": raw_token,
        "token_type": "bearer",
        "expires_at": session.expires_at,
        "user": _serialize_user(user),
    }


@router.get("/me")
def me(user: models.User = Depends(get_current_user)):
    return _serialize_user(user)


@router.get("/users")
def list_users(
    db: Session = Depends(get_db),
    _: models.User = Depends(get_current_user),
):
    users = (
        db.query(models.User)
        .filter(
            models.User.is_active.is_(True),
            models.User.email_verified.is_(True),
        )
        .order_by(models.User.full_name.asc(), models.User.email.asc())
        .all()
    )
    return [_serialize_user(user) for user in users]


@router.post("/logout")
def logout(
    response: Response,
    authorization: str = Header(default=""),
    session_cookie_token: Optional[str] = Cookie(default=None, alias=SESSION_COOKIE_NAME),
    db: Session = Depends(get_db),
    _: models.User = Depends(get_current_user),
):
    token = ""
    auth_text = (authorization or "").strip()
    if auth_text:
        parts = auth_text.split(" ", 1)
        if len(parts) == 2 and parts[0].lower() == "bearer" and parts[1].strip():
            token = parts[1].strip()
    if not token:
        token = (session_cookie_token or "").strip()

    if token:
        session = (
            db.query(models.AuthSession)
            .filter(models.AuthSession.token_hash == hash_token(token))
            .first()
        )
        if session and not session.revoked_at:
            session.revoked_at = to_iso(utcnow())
            db.commit()

    _clear_auth_cookie(response)
    return {"message": "로그아웃되었습니다."}
