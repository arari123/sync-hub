#!/usr/bin/env python3

from __future__ import annotations

import argparse
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
import html
import json
import os
import random
import socket
from typing import Any, Iterable, Optional
from urllib.parse import urlparse

from dotenv import load_dotenv
from sqlalchemy import create_engine, text


@dataclass
class Section:
    title: str
    paragraphs: list[str] = field(default_factory=list)
    bullets: list[str] = field(default_factory=list)


def _escape(value: str) -> str:
    return html.escape(value or "", quote=True)


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def _try_parse_iso(value: str) -> Optional[datetime]:
    raw = (value or "").strip()
    if not raw:
        return None
    try:
        if raw.endswith("Z"):
            raw = raw[:-1] + "+00:00"
        return datetime.fromisoformat(raw)
    except Exception:  # noqa: BLE001
        return None


def _render_plain(sections: list[Section]) -> str:
    lines: list[str] = []
    for section in sections:
        lines.append(section.title)
        lines.append("-" * max(4, min(60, len(section.title))))
        for paragraph in section.paragraphs:
            body = (paragraph or "").strip()
            if body:
                lines.append(body)
                lines.append("")
        for bullet in section.bullets:
            item = (bullet or "").strip()
            if item:
                lines.append(f"- {item}")
        lines.append("")
    return "\n".join(lines).strip()


def _render_html(sections: list[Section]) -> str:
    chunks: list[str] = []
    for section in sections:
        title = (section.title or "").strip()
        if title:
            chunks.append(f"<h2>{_escape(title)}</h2>")
        for paragraph in section.paragraphs:
            body = (paragraph or "").strip()
            if not body:
                continue
            body_html = _escape(body).replace("\n", "<br/>")
            chunks.append(f"<p>{body_html}</p>")
        bullets = [item.strip() for item in section.bullets if str(item or "").strip()]
        if bullets:
            chunks.append("<ul>")
            for bullet in bullets:
                chunks.append(f"<li>{_escape(bullet)}</li>")
            chunks.append("</ul>")
    return "\n".join(chunks).strip()


def _pick_topic(title: str, rng: random.Random) -> str:
    lowered = (title or "").lower()
    keyword_topics = [
        ("간섭", "설치 간섭 및 레이아웃 조정"),
        ("알람", "알람 코드/센서 신호 불안정"),
        ("센서", "센서 신호 불안정 및 인터록 점검"),
        ("누수", "배관/실링 누수"),
        ("진동", "진동/정렬 및 고정 상태 점검"),
        ("불량", "품질 불량 및 재발 방지"),
        ("소음", "소음/베어링/구동부 점검"),
        ("오류", "제어 로직/통신 오류"),
        ("통신", "PLC/네트워크 통신 장애"),
        ("일정", "일정 지연 및 리소스 재배치"),
        ("자재", "자재 수급 및 대체품 검토"),
        ("도면", "도면/사양 불일치"),
        ("승인", "승인 지연 및 의사결정 정리"),
        ("테스트", "시운전/검증 이슈"),
    ]
    for key, topic in keyword_topics:
        if key in lowered:
            return topic
    fallback = [
        "현장 이슈 대응 및 재발 방지",
        "설비 안정화 및 품질 개선",
        "납기 리스크 관리 및 조치 계획",
        "협력사 커뮤니케이션 정리 및 액션 아이템",
        "설계 변경 검토 및 영향도 분석",
    ]
    return rng.choice(fallback)


def _filler_paragraphs(topic: str, rng: random.Random) -> list[str]:
    pool = [
        "본 안건은 현재 확인된 정보(현장 히어링, 로그, 사진/영상, 작업자 메모)를 기반으로 정리했습니다. "
        "추가 자료가 확보되는 즉시 가설을 업데이트하고, 조치 우선순위를 재조정합니다.",
        "현상은 단일 원인으로 단정하기 어렵고, 설비 상태/환경/작업 조건에 따라 재현성이 달라질 수 있습니다. "
        "따라서 \"재현 조건 확보\"와 \"데이터 기반의 원인 분리\"를 1순위로 두고 접근합니다.",
        "이번 이슈는 단기적으로는 정상화가 우선이지만, 장기적으로는 동일 패턴 재발 시 비용과 일정 영향이 커질 수 있습니다. "
        "임시 조치와 근본 조치를 분리해 기록하고, 검증 완료 전까지는 변경 이력을 남깁니다.",
        "조치 과정에서 발생할 수 있는 부수 효과(작업 간섭, 안전 리스크, 품질 저하)를 함께 고려합니다. "
        "특히 인터록/안전회로/가드 관련 변경은 반드시 작업 전후 점검 체크리스트를 수행합니다.",
        f"핵심은 \"{topic}\"를 단일 이벤트로 끝내지 않고, 표준 점검 항목과 교육 자료로 환류하는 것입니다. "
        "해당 항목은 차기 유사 프로젝트의 리드타임과 안정화 기간을 단축시키는 데 직접 기여합니다.",
    ]
    count = rng.randint(2, 4)
    return rng.sample(pool, k=count)


def _general_sections(
    *,
    entry_id: int,
    agenda_code: str,
    project_name: str,
    project_code: str,
    title: str,
    legacy_summary: str,
    created_at_iso: str,
    installation_site: str,
    customer_name: str,
    progress_status: str,
    rng: random.Random,
) -> list[Section]:
    topic = _pick_topic(title, rng)
    created_at = _try_parse_iso(created_at_iso) or datetime.now(timezone.utc)
    due_date = (created_at + timedelta(days=rng.randint(3, 10))).date().isoformat()

    header_lines = []
    header_lines.append(f"프로젝트: {project_name}{f' ({project_code})' if project_code else ''}")
    header_lines.append(f"안건 코드: {agenda_code} · 엔트리 ID: {entry_id}")
    if customer_name:
        header_lines.append(f"고객사: {customer_name}")
    if installation_site:
        header_lines.append(f"설치 현장: {installation_site}")
    header_lines.append(f"진행 상태: {'진행 중' if progress_status == 'in_progress' else '완료'}")
    header_lines.append(f"목표 처리 기한(가정): {due_date}")

    symptoms = [
        "재현 조건이 일정하지 않아 현장/사무실에서 관찰값이 다르게 나타남",
        "현장 장비/부품 편차로 인해 특정 구간에서만 간헐적으로 이상 동작이 발생",
        "작업자 조작 순서/운전 모드에 따라 증상이 달라져 원인 분리가 필요",
        "관련 로그/이벤트 타임스탬프가 충분히 남지 않아 추가 로깅이 필요",
    ]
    impacts = [
        "시운전/검증 일정 지연 위험이 존재하며, 단기적으로는 작업 대기 시간이 증가",
        "재작업 발생 시 자재/인력 비용이 증가하고, 납기 신뢰도에 영향을 줄 수 있음",
        "품질 관점에서 불량 리스크가 확대될 수 있어 출하/인수 기준 재확인이 필요",
    ]
    root_causes = [
        "기계적 간섭 또는 공차 누적(설치 정렬, 브라켓 위치 편차, 케이블 라우팅 포함)",
        "센서 신호 노이즈/접촉 불량/차폐 미흡, 또는 파라미터(필터/디바운스) 설정 문제",
        "제어 로직의 인터록/조건식 누락, 예외 케이스 처리 미흡(리셋/복귀 시나리오 포함)",
        "현장 전원 품질/접지/노이즈 환경 영향, 또는 통신 지연/패킷 손실",
    ]
    action_items = [
        "재현 조건 수립: 운전 모드/속도/부하/작업 순서를 고정하고 3회 이상 반복 테스트",
        "데이터 확보: 주요 신호(센서/상태/알람) 로깅 주기 개선 및 이벤트 스냅샷 저장",
        "원인 분리: 기계/전기/제어 파트를 단계적으로 분리하여 A/B 테스트 수행",
        "조치 실행: 임시 조치 후 즉시 롤백 가능하도록 변경 이력/파라미터 백업",
        "검증 기준 합의: 정상화 판단 조건(알람 미발생, 처리량, 품질 기준) 문서화",
    ]
    risks = [
        "임시 조치가 근본 원인을 가릴 수 있으므로, 조치 전/후 데이터를 반드시 비교",
        "현장 작업 중 안전 리스크(가드 해제/인터록 우회)가 발생하지 않도록 통제",
        "협력사 부품 교체 시 리드타임이 길어질 수 있어 대체품/재고를 병행 검토",
    ]

    if legacy_summary:
        legacy_summary = legacy_summary.strip()

    sections: list[Section] = [
        Section(
            title="안건 개요",
            paragraphs=[
                f"'{title}' 안건은 {topic} 범주로 분류하여 정리합니다.",
                "\n".join(header_lines),
            ],
            bullets=[
                f"핵심 목표: 원인 가설을 2개 이하로 좁히고, 재현 가능 조건에서 조치 효과를 검증",
                "참고: 아래 내용은 현재까지 확보된 정보 기준이며, 신규 로그/사진/작업자 피드백에 따라 업데이트됩니다.",
            ],
        ),
    ]

    if legacy_summary:
        sections.append(
            Section(
                title="기존 입력 요약(원문)",
                paragraphs=[
                    legacy_summary,
                ],
            )
        )

    sections.extend(
        [
            Section(
                title="관측된 현상",
                paragraphs=[
                    "현장에서 보고된 주요 현상은 아래와 같습니다. 단, 재현성/발생 빈도/조건은 추가 확인이 필요합니다.",
                ],
                bullets=rng.sample(symptoms, k=3),
            ),
            Section(
                title="영향도(일정/비용/품질)",
                paragraphs=rng.sample(impacts, k=2),
                bullets=[
                    "일정: 시운전/인수 테스트 일정에 직접적인 영향을 주는지 여부를 1차로 판단",
                    "비용: 재작업/출장/부품 교체 비용을 분리 계상하여 추후 정산 근거 확보",
                    "품질: 불량 재현 시, 동일 조건에서 품질 검사 항목과 샘플 수를 명시",
                ],
            ),
            Section(
                title="원인 가설(우선순위)",
                paragraphs=[
                    "단정 대신 가설로 두고, 빠르게 배제/확정 가능한 항목부터 검증합니다.",
                ],
                bullets=rng.sample(root_causes, k=3),
            ),
            Section(
                title="조치 계획(단기/근본)",
                paragraphs=[
                    "아래 순서로 진행하면 \"데이터 확보 → 원인 분리 → 조치 적용 → 검증\" 흐름이 끊기지 않습니다.",
                ],
                bullets=action_items,
            ),
            Section(
                title="리스크 및 대응",
                paragraphs=_filler_paragraphs(topic, rng),
                bullets=rng.sample(risks, k=3),
            ),
            Section(
                title="완료 기준(Definition of Done)",
                bullets=[
                    "재현 조건에서 동일 증상이 0회(또는 허용 임계치 이하)로 확인됨",
                    "조치 전/후 비교 데이터(로그/사진/체크리스트)가 저장되어 추적 가능함",
                    "관련 문서(도면/파라미터/작업 절차)에 변경 이력이 기록됨",
                    "재발 방지 항목이 체크리스트/교육자료/표준 템플릿에 반영됨",
                ],
            ),
        ]
    )

    return sections


def _work_report_sections(
    *,
    entry_id: int,
    agenda_code: str,
    project_name: str,
    project_code: str,
    title: str,
    legacy_summary: str,
    created_at_iso: str,
    installation_site: str,
    customer_name: str,
    payload: dict[str, Any],
    rng: random.Random,
) -> list[Section]:
    created_at = _try_parse_iso(created_at_iso) or datetime.now(timezone.utc)
    topic = _pick_topic(title, rng)

    report = (payload or {}).get("report_sections") or {}
    symptom = str(report.get("symptom") or "").strip()
    cause = str(report.get("cause") or "").strip()
    interim = str(report.get("interim_action") or "").strip()
    final_action = str(report.get("final_action") or "").strip()

    work_location = str(payload.get("work_location") or "").strip() or installation_site
    request_date = str(payload.get("request_date") or "").strip()
    work_start = str(payload.get("work_date_start") or "").strip()
    work_end = str(payload.get("work_date_end") or "").strip()

    equipments = payload.get("target_equipments") or []
    if not isinstance(equipments, list):
        equipments = []
    equipments = [str(item).strip() for item in equipments if str(item or "").strip()]

    workers = payload.get("workers") or []
    if not isinstance(workers, list):
        workers = []
    worker_lines = []
    total_hours = 0.0
    for item in workers:
        if not isinstance(item, dict):
            continue
        name = str(item.get("worker_name") or "").strip()
        aff = str(item.get("worker_affiliation") or "").strip() or "자사"
        try:
            hours = float(item.get("work_hours") or 0.0)
        except Exception:  # noqa: BLE001
            hours = 0.0
        if not name:
            continue
        total_hours += hours
        worker_lines.append(f"{name}({aff}) {hours:.1f}h")

    parts = payload.get("parts") or []
    if not isinstance(parts, list):
        parts = []
    part_lines = []
    for item in parts:
        if not isinstance(item, dict):
            continue
        part_name = str(item.get("part_name") or "").strip()
        if not part_name:
            continue
        manufacturer = str(item.get("manufacturer") or "").strip()
        model_name = str(item.get("model_name") or "").strip()
        try:
            qty = float(item.get("quantity") or 0.0)
        except Exception:  # noqa: BLE001
            qty = 0.0
        label = part_name
        if manufacturer or model_name:
            label += f" ({manufacturer} {model_name})".strip()
        if qty:
            label += f" x{qty:g}"
        part_lines.append(label)

    header_lines = []
    header_lines.append(f"프로젝트: {project_name}{f' ({project_code})' if project_code else ''}")
    header_lines.append(f"작업보고서 코드: {agenda_code} · 엔트리 ID: {entry_id}")
    if customer_name:
        header_lines.append(f"고객사: {customer_name}")
    if work_location:
        header_lines.append(f"작업 위치: {work_location}")
    if request_date:
        header_lines.append(f"요청일: {request_date}")
    if work_start or work_end:
        label = work_start or work_end
        if work_start and work_end and work_start != work_end:
            label = f"{work_start} ~ {work_end}"
        header_lines.append(f"작업일: {label}")

    sections: list[Section] = [
        Section(
            title="작업 개요",
            paragraphs=[
                f"'{title}' 작업은 {topic} 관점에서 점검/조치 내용을 정리합니다.",
                "\n".join(header_lines),
            ],
            bullets=[
                "작업 전 안전 확인(전원 차단/락아웃-태그아웃/가드 상태) 후 진행",
                "조치 전후 비교를 위해 로그/파라미터/사진을 동일 포맷으로 기록",
            ],
        ),
    ]

    if legacy_summary:
        legacy_summary = legacy_summary.strip()
    if legacy_summary:
        sections.append(
            Section(
                title="기존 입력 요약(원문)",
                paragraphs=[legacy_summary],
            )
        )

    sections.append(
        Section(
            title="대상 설비/범위",
            paragraphs=[
                "점검 범위를 명확히 하면, 원인 분리와 재현 테스트가 빠르게 진행됩니다.",
            ],
            bullets=equipments or ["메인 설비", "제어반/PLC", "센서/구동부"],
        )
    )

    sections.append(
        Section(
            title="현상(Observed)",
            paragraphs=[
                symptom or "현장 운전 중 간헐적인 이상 동작이 관찰되어 확인이 필요했습니다.",
                "발생 시점/빈도/조건을 기록하고, 동일 조건에서 재현을 시도했습니다.",
            ],
            bullets=[
                "발생 조건: 운전 모드/속도/부하/작업 순서를 기준으로 정리",
                "관련 알람/로그: 발생 직전 5~10분 구간을 우선 확보",
            ],
        )
    )

    sections.append(
        Section(
            title="원인 분석(Hypothesis)",
            paragraphs=[
                cause or "로그/센서값/상태 신호를 기반으로 원인을 가설로 세우고 배제 테스트를 진행했습니다.",
                "기계/전기/제어 항목을 동시에 건드리지 않고, 단계적으로 분리하여 확인했습니다.",
            ],
            bullets=rng.sample(
                [
                    "센서 입력 노이즈 또는 배선 접촉 불량 가능성",
                    "인터록 조건/예외 처리 미흡으로 인한 시퀀스 중단 가능성",
                    "부품 열화/정렬 불량으로 인한 간헐적 기구 간섭 가능성",
                ],
                k=3,
            ),
        )
    )

    sections.append(
        Section(
            title="조치 내용(Action Taken)",
            paragraphs=[
                interim or "임시 조치로 증상 완화 후, 재발 여부를 관찰했습니다.",
                final_action or "최종 조치로 원인 가능 항목을 제거하고 정상 동작을 확인했습니다.",
                "조치 후에는 반드시 롤백 포인트(변경 전 설정/부품 상태)를 남겼습니다.",
            ],
            bullets=[
                "조치 전 파라미터 백업/로그 저장",
                "조치 후 동일 조건 3회 이상 반복 운전으로 재현 여부 확인",
                "현장 작업자 공유: 변경 사항/주의 사항 전달",
            ],
        )
    )

    if worker_lines:
        sections.append(
            Section(
                title="투입 인원/시간",
                paragraphs=[
                    f"총 투입 시간(합계): {total_hours:.1f}h",
                ],
                bullets=worker_lines,
            )
        )

    if part_lines:
        sections.append(
            Section(
                title="사용/교체 부품",
                paragraphs=[
                    "교체/사용된 부품은 추후 동일 증상 대응을 위해 모델/수량까지 기록합니다.",
                ],
                bullets=part_lines,
            )
        )

    sections.append(
        Section(
            title="결과 확인 및 권고",
            paragraphs=_filler_paragraphs(topic, rng),
            bullets=[
                "알람/이상 동작 미발생 상태로 정상 운전 확인",
                "동일 증상 재발 시: 재현 조건과 로그 구간을 먼저 확보 후 연락",
                "권고: 1주 내 동일 조건 재점검(작업 후 초기 안정화 기간 고려)",
            ],
        )
    )

    return sections


def _generate_content(
    *,
    entry_id: int,
    entry_kind: str,
    thread_kind: str,
    agenda_code: str,
    progress_status: str,
    project_name: str,
    project_code: str,
    title: str,
    legacy_summary: str,
    created_at_iso: str,
    installation_site: str,
    customer_name: str,
    payload: dict[str, Any],
    rng: random.Random,
    target_min_len: int,
) -> tuple[str, str]:
    if thread_kind == "work_report":
        sections = _work_report_sections(
            entry_id=entry_id,
            agenda_code=agenda_code,
            project_name=project_name,
            project_code=project_code,
            title=title,
            legacy_summary=legacy_summary,
            created_at_iso=created_at_iso,
            installation_site=installation_site,
            customer_name=customer_name,
            payload=payload,
            rng=rng,
        )
    else:
        sections = _general_sections(
            entry_id=entry_id,
            agenda_code=agenda_code,
            project_name=project_name,
            project_code=project_code,
            title=title,
            legacy_summary=legacy_summary,
            created_at_iso=created_at_iso,
            installation_site=installation_site,
            customer_name=customer_name,
            progress_status=progress_status,
            rng=rng,
        )

    # Replies/additional work: keep the structure but clarify role.
    kind_label = {
        "root": "원문",
        "reply": "답변",
        "additional_work": "추가 작업",
    }.get(entry_kind, entry_kind)
    sections.insert(
        0,
        Section(
            title="엔트리 구분",
            paragraphs=[
                f"이 문서는 안건 스레드 내 '{kind_label}' 엔트리 본문입니다.",
            ],
        ),
    )

    plain = _render_plain(sections)
    html_body = _render_html(sections)

    if len(plain) < target_min_len:
        # Add a final padding section, but keep it meaningful.
        topic = _pick_topic(title, rng)
        extra = Section(
            title="추가 메모(상세)",
            paragraphs=[
                "아래는 후속 커뮤니케이션/검증을 위한 상세 메모입니다.",
                *_filler_paragraphs(topic, rng),
            ],
            bullets=[
                "다음 미팅에서 확인할 질문 3개를 미리 정리하고, 담당자를 지정합니다.",
                "원인 후보가 2개 이하로 줄어들면, 근본 조치 설계를 확정하고 배포/적용 일정을 고정합니다.",
                "조치가 외부 공급/협력사에 의존하는 경우, 대체 경로(재고/대체 모델/임시 우회)를 동시에 준비합니다.",
            ],
        )
        sections.append(extra)
        plain = _render_plain(sections)
        html_body = _render_html(sections)

    return plain, html_body


def _host_resolves(hostname: str) -> bool:
    try:
        socket.getaddrinfo(hostname, None)
        return True
    except Exception:  # noqa: BLE001
        return False


def _resolve_database_url() -> str:
    load_dotenv(".env")

    user = os.getenv("POSTGRES_USER", "postgres")
    password = os.getenv("POSTGRES_PASSWORD", "")
    db_name = os.getenv("POSTGRES_DB", "synchub")
    host = os.getenv("POSTGRES_HOST", "localhost")
    port = os.getenv("POSTGRES_PORT", "5432")

    # Host environment typically cannot resolve docker-compose service name "db".
    if host in {"db", "postgres"} and not _host_resolves(host):
        host = "localhost"

    return f"postgresql+psycopg2://{user}:{password}@{host}:{port}/{db_name}"


def _parse_json(value: str) -> dict[str, Any]:
    raw = (value or "").strip()
    if not raw:
        return {}
    try:
        parsed = json.loads(raw)
    except Exception:  # noqa: BLE001
        return {}
    if isinstance(parsed, dict):
        return parsed
    return {}


def _iter_chunks(items: list[dict[str, Any]], chunk_size: int) -> Iterable[list[dict[str, Any]]]:
    for i in range(0, len(items), chunk_size):
        yield items[i : i + chunk_size]


def main() -> int:
    parser = argparse.ArgumentParser(description="Expand agenda entry bodies into long-form demo content.")
    parser.add_argument("--only-root", action="store_true", help="Update only root entries (entry_kind='root').")
    parser.add_argument("--limit", type=int, default=0, help="Limit number of entries to update (0 = no limit).")
    parser.add_argument("--dry-run", action="store_true", help="Print sample output stats without writing.")
    parser.add_argument("--target-min-len", type=int, default=1600, help="Minimum target length for content_plain.")
    parser.add_argument("--chunk-size", type=int, default=200, help="Batch size for updates.")
    args = parser.parse_args()

    database_url = _resolve_database_url()
    engine = create_engine(database_url)

    where_clause = ""
    if args.only_root:
        where_clause = "where e.entry_kind = 'root'"

    limit_clause = ""
    if args.limit and args.limit > 0:
        limit_clause = f"limit {int(args.limit)}"

    query = text(
        f"""
        select
            e.id as entry_id,
            e.thread_id,
            e.project_id,
            e.entry_kind,
            e.title as entry_title,
            coalesce(e.content_plain, '') as legacy_plain,
            coalesce(e.entry_payload_json, '') as entry_payload_json,
            t.thread_kind,
            t.progress_status,
            t.agenda_code,
            t.created_at as thread_created_at,
            p.name as project_name,
            coalesce(p.code, '') as project_code,
            coalesce(p.customer_name, '') as customer_name,
            coalesce(p.installation_site, '') as installation_site
        from agenda_entries e
        join agenda_threads t on t.id = e.thread_id
        join budget_projects p on p.id = e.project_id
        {where_clause}
        order by e.id asc
        {limit_clause}
        """
    )

    with engine.begin() as conn:
        rows = conn.execute(query).mappings().all()

    if not rows:
        print("No agenda entries found.")
        return 1

    updates: list[dict[str, Any]] = []
    for row in rows:
        entry_id = int(row["entry_id"])
        rng = random.Random(entry_id)

        legacy = str(row.get("legacy_plain") or "").strip()
        payload = _parse_json(str(row.get("entry_payload_json") or ""))

        plain, body_html = _generate_content(
            entry_id=entry_id,
            entry_kind=str(row.get("entry_kind") or "").strip(),
            thread_kind=str(row.get("thread_kind") or "").strip(),
            agenda_code=str(row.get("agenda_code") or "").strip(),
            progress_status=str(row.get("progress_status") or "").strip(),
            project_name=str(row.get("project_name") or "").strip(),
            project_code=str(row.get("project_code") or "").strip(),
            title=str(row.get("entry_title") or "").strip(),
            legacy_summary=legacy,
            created_at_iso=str(row.get("thread_created_at") or "").strip(),
            installation_site=str(row.get("installation_site") or "").strip(),
            customer_name=str(row.get("customer_name") or "").strip(),
            payload=payload,
            rng=rng,
            target_min_len=max(300, int(args.target_min_len)),
        )

        updates.append(
            {
                "entry_id": entry_id,
                "content_plain": plain,
                "content_html": body_html,
            }
        )

    sample = updates[:3]
    sample_stats = [
        {
            "entry_id": item["entry_id"],
            "plain_len": len(item["content_plain"] or ""),
            "html_len": len(item["content_html"] or ""),
        }
        for item in sample
    ]
    print(
        json.dumps(
            {
                "entries_selected": len(rows),
                "updates_prepared": len(updates),
                "target_min_len": int(args.target_min_len),
                "sample": sample_stats,
                "mode": "dry-run" if args.dry_run else "apply",
                "timestamp": _now_iso(),
            },
            ensure_ascii=False,
            indent=2,
        )
    )

    if args.dry_run:
        return 0

    # 1) Update entry bodies first, commit even if summary refresh fails later.
    with engine.begin() as conn:
        for batch in _iter_chunks(updates, max(1, int(args.chunk_size))):
            conn.execute(
                text(
                    """
                    update agenda_entries
                    set content_plain = :content_plain,
                        content_html = :content_html
                    where id = :entry_id
                    """
                ),
                batch,
            )

    # 2) Refresh thread summaries only when we updated the full set of entries.
    # If the dataset contains previously-corrupted text, a global SQL update may fail.
    # Running after the full overwrite minimizes that risk.
    if not args.only_root and not (args.limit and args.limit > 0):
        summary_query = text(
            """
            select
                t.id as thread_id,
                coalesce(e.content_plain, '') as latest_plain
            from agenda_threads t
            join agenda_entries e on e.id = t.latest_entry_id
            order by t.id asc
            """
        )
        with engine.begin() as conn:
            thread_rows = conn.execute(summary_query).mappings().all()
            thread_updates = [
                {
                    "thread_id": int(row["thread_id"]),
                    "summary_plain": str(row.get("latest_plain") or "")[:1200],
                }
                for row in thread_rows
            ]

            for batch in _iter_chunks(thread_updates, max(1, int(args.chunk_size))):
                conn.execute(
                    text(
                        """
                        update agenda_threads
                        set summary_plain = :summary_plain
                        where id = :thread_id
                        """
                    ),
                    batch,
                )

    print("DONE")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
