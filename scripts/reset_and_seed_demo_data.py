#!/usr/bin/env python3
"""Reset project-related data and seed demo projects/agendas/budgets/schedules.

Run inside Docker:
  docker exec -w /app synchub_web python3 scripts/reset_and_seed_demo_data.py
"""

from __future__ import annotations

import argparse
import html
import json
import os
import random
import sys
import uuid
from dataclasses import dataclass
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

from sqlalchemy import text

ROOT_DIR = Path(__file__).resolve().parents[1]
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

from app import models
from app.api import budget as budget_api
from app.core.auth_utils import to_iso, utcnow
from app.core.budget_logic import aggregate_equipment_costs_from_detail, detail_payload_to_json
from app.core.document_summary import classify_document_types, serialize_document_types
from app.database import SessionLocal, ensure_runtime_schema

try:
    from openpyxl import Workbook
except Exception:  # noqa: BLE001
    Workbook = None

try:
    from pypdf import PdfWriter
except Exception:  # noqa: BLE001
    PdfWriter = None


@dataclass(frozen=True)
class ProjectPlan:
    project_type: str
    stage: str
    name: str
    code: str
    description: str
    customer_name: str
    installation_site: str


UPLOAD_DOCUMENTS_DIR = ROOT_DIR / "uploads" / "documents"


def _slugify_text(value: str, fallback: str = "seed") -> str:
    normalized = "".join(ch if (ch.isalnum() or ch in {"-", "_"}) else "-" for ch in str(value or "").strip())
    normalized = "-".join(token for token in normalized.split("-") if token)
    return normalized[:48] if normalized else fallback


def _build_agenda_reply_body(
    *,
    rng: random.Random,
    project_name: str,
    agenda_title: str,
    reply_no: int,
) -> tuple[str, str]:
    response_pool = [
        "현장 재현 조건을 표준화해서 동일 조건 3회 검증 후 결과를 공유드리겠습니다.",
        "알람 로그/센서 신호를 분리 수집해 원인 범위를 축소하겠습니다.",
        "기구/전장/제어 항목을 구분해 단계별 체크리스트로 점검하겠습니다.",
        "임시 조치 적용 후 안정화 추이를 모니터링하고 상수화 여부를 판단하겠습니다.",
    ]
    owner_pool = ["생산기술", "설비팀", "제어팀", "품질팀", "현장지원"]
    due_days = rng.randint(1, 7)

    lines = [
        f"[답변 #{reply_no:02d}] {agenda_title}",
        f"프로젝트: {project_name}",
        f"조치 내용: {rng.choice(response_pool)}",
        f"담당 조직: {rng.choice(owner_pool)}",
        f"완료 예정: {due_days}일 이내",
        f"추가 메모: {uuid.uuid4().hex[:8]}",
    ]
    plain = "\n".join(lines).strip()
    rich = "<p>" + "<br/>".join(html.escape(line) for line in lines) + "</p>"
    return plain, rich


def _build_comment_body(*, rng: random.Random) -> str:
    comments = [
        "재현 로그 확인했습니다. 동일 증상 1건 추가 확인 필요합니다.",
        "현장 작업 시간대(야간) 기준으로도 동일 동작 여부 확인 바랍니다.",
        "임시 조치 적용 후 품질 지표(불량률/처리량) 공유 부탁드립니다.",
        "작업 허가 및 안전 체크리스트 반영 후 진행 부탁드립니다.",
        "협력사 부품 대체안 검토 결과도 함께 업데이트 바랍니다.",
    ]
    return f"{rng.choice(comments)} (ref:{uuid.uuid4().hex[:6]})"


def _create_seed_pdf(path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    if PdfWriter is not None:
        writer = PdfWriter()
        writer.add_blank_page(width=595, height=842)
        with path.open("wb") as file_obj:
            writer.write(file_obj)
        return

    path.write_bytes(
        b"%PDF-1.1\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n"
    )


def _create_seed_xlsx(path: Path, *, title: str, project_code: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    if Workbook is not None:
        workbook = Workbook()
        sheet = workbook.active
        sheet.title = "Summary"
        sheet["A1"] = "Project Code"
        sheet["B1"] = project_code
        sheet["A2"] = "Title"
        sheet["B2"] = title
        sheet["A3"] = "Generated At"
        sheet["B3"] = to_iso(utcnow())
        workbook.save(path)
        return

    # openpyxl가 없으면 최소 포맷 검증용 샘플을 복사한다.
    fallback = ROOT_DIR / "uploads" / "excel_report_01_hanbit_ljx8200.xlsx"
    path.write_bytes(fallback.read_bytes())


def _iso_from_date(day: date, *, hour: int = 9, minute: int = 0) -> str:
    return to_iso(datetime(day.year, day.month, day.day, hour, minute, tzinfo=timezone.utc))


def _ymd(day: date) -> str:
    return day.isoformat()


def _random_choice(rng: random.Random, items: list[str], fallback: str) -> str:
    if not items:
        return fallback
    return rng.choice(items)


def _build_schedule_json(
    *,
    rng: random.Random,
    anchor: date,
    design_start: date,
    design_end: date,
    fabrication_start: date,
    fabrication_end: date,
    installation_start: date,
    installation_end: date,
    now_iso: str,
) -> str:
    payload = budget_api._build_default_schedule_wbs_payload(anchor_date=_ymd(anchor))
    payload["weekend_mode"] = rng.choice(["exclude", "include"])

    root_ids = budget_api._SCHEDULE_ROOT_GROUP_IDS

    def _midpoint(start: date, end: date) -> date:
        if end <= start:
            return start
        delta = (end - start).days
        return start + timedelta(days=max(0, delta // 2))

    design_mid = _midpoint(design_start, design_end)
    fab_mid = _midpoint(fabrication_start, fabrication_end)
    install_mid = _midpoint(installation_start, installation_end)

    rows = [
        {
            "id": "design-1",
            "kind": "task",
            "name": _random_choice(rng, ["요구사항 정리", "기본 설계", "도면 검토"], "설계 작업"),
            "stage": "design",
            "parent_group_id": root_ids["design"],
            "sort_order": 0,
            "duration_days": 1,
            "start_date": _ymd(design_start),
            "end_date": _ymd(design_mid),
            "note": "설계 문서/도면 업데이트",
        },
        {
            "id": "design-2",
            "kind": "task",
            "name": _random_choice(rng, ["상세 설계", "BOM 확정", "리스크 점검"], "설계 마무리"),
            "stage": "design",
            "parent_group_id": root_ids["design"],
            "sort_order": 1,
            "duration_days": 1,
            "start_date": _ymd(design_mid),
            "end_date": _ymd(design_end),
            "note": "사양 확정 및 변경관리",
        },
        {
            "id": "design-evt",
            "kind": "event",
            "name": "설계 승인",
            "stage": "design",
            "parent_group_id": root_ids["design"],
            "sort_order": 2,
            "duration_days": 0,
            "start_date": _ymd(design_end),
            "end_date": _ymd(design_end),
            "note": "고객 승인/내부 승인",
        },
        {
            "id": "fab-1",
            "kind": "task",
            "name": _random_choice(rng, ["부품 발주", "가공/외주", "프레임 제작"], "제작 준비"),
            "stage": "fabrication",
            "parent_group_id": root_ids["fabrication"],
            "sort_order": 0,
            "duration_days": 1,
            "start_date": _ymd(fabrication_start),
            "end_date": _ymd(fab_mid),
            "note": "리드타임 관리",
        },
        {
            "id": "fab-2",
            "kind": "task",
            "name": _random_choice(rng, ["조립", "전장 작업", "사내 FAT"], "제작/조립"),
            "stage": "fabrication",
            "parent_group_id": root_ids["fabrication"],
            "sort_order": 1,
            "duration_days": 1,
            "start_date": _ymd(fab_mid),
            "end_date": _ymd(fabrication_end),
            "note": "FAT 체크리스트 반영",
        },
        {
            "id": "ins-1",
            "kind": "task",
            "name": _random_choice(rng, ["현장 반입", "설치 준비", "현장 레이아웃"], "설치 준비"),
            "stage": "installation",
            "parent_group_id": root_ids["installation"],
            "sort_order": 0,
            "duration_days": 1,
            "start_date": _ymd(installation_start),
            "end_date": _ymd(install_mid),
            "note": "안전/작업 허가 포함",
        },
        {
            "id": "ins-2",
            "kind": "task",
            "name": _random_choice(rng, ["시운전", "튜닝", "인수 테스트"], "현장 시운전"),
            "stage": "installation",
            "parent_group_id": root_ids["installation"],
            "sort_order": 1,
            "duration_days": 1,
            "start_date": _ymd(install_mid),
            "end_date": _ymd(installation_end),
            "note": "인수 기준 합의",
        },
    ]

    payload["rows"] = rows
    payload["updated_at"] = now_iso
    normalized = budget_api._normalize_schedule_wbs_payload(payload, strict_anchor=True)
    return json.dumps(normalized, ensure_ascii=False)


def _build_budget_detail_payload(
    *,
    rng: random.Random,
    project_name: str,
    execution_ratio: float,
    equipment_count: int,
    installation_locale: str,
) -> dict:
    equipment_names = [f"{project_name}-설비{chr(65 + index)}" for index in range(max(1, equipment_count))]

    material_catalog = [
        ("리니어 모듈", "LM-220"),
        ("산업용 카메라", "VC-12MP"),
        ("서보 드라이브", "SD-3KW"),
        ("I/O 모듈", "IO-128"),
        ("컨베이어 벨트", "CV-900"),
        ("안전 라이다", "SL-2D"),
        ("바코드 스캐너", "BC-800"),
        ("로봇 그리퍼", "GR-80"),
    ]
    labor_catalog = [
        ("기계조립", "프레임 조립", "H", 34, 42000),
        ("전장기사", "배선/패널 작업", "H", 28, 46000),
        ("제어엔지니어", "시운전/튜닝", "H", 22, 65000),
        ("안전검증", "인터락 점검", "H", 12, 59000),
    ]
    expense_catalog = [
        ("가공/외주비", "프레임 CNC"),
        ("현장 운송비", "5톤 트럭 1회"),
        ("장비 렌탈", "리프트/크레인"),
        ("소모품", "체결류/보호구"),
    ]

    material_items: list[dict] = []
    labor_items: list[dict] = []
    expense_items: list[dict] = []

    for equipment_name in equipment_names:
        picked_material = rng.sample(material_catalog, k=rng.randint(2, min(4, len(material_catalog))))
        for part_name, spec in picked_material:
            phase = rng.choice(["fabrication", "installation"])
            quantity = rng.randint(1, 6)
            unit_price = rng.randint(180_000, 2_400_000)
            material_items.append(
                {
                    "equipment_name": equipment_name,
                    "unit_name": rng.choice(["FEED", "VISION", "ROBOT", "PANEL", "SAFETY"]),
                    "part_name": part_name,
                    "spec": spec,
                    "quantity": quantity,
                    "unit_price": unit_price,
                    "phase": phase,
                    "memo": rng.choice(["핵심 부품", "대체품 검토", "현장 반영", "표준 사양"]),
                }
            )

        picked_labor = rng.sample(labor_catalog, k=rng.randint(1, min(3, len(labor_catalog))))
        for worker_type, task_name, unit, qty, rate in picked_labor:
            phase = rng.choice(["fabrication", "installation"])
            quantity = max(4, int(qty + rng.randint(-6, 10)))
            hourly_rate = max(28000, int(rate + rng.randint(-5000, 8000)))
            labor_items.append(
                {
                    "equipment_name": equipment_name,
                    "task_name": task_name,
                    "worker_type": worker_type,
                    "unit": unit,
                    "quantity": quantity,
                    "hourly_rate": hourly_rate,
                    "phase": phase,
                    "memo": rng.choice(["2인 1조", "현장 포함", "야간 작업 가능", "안전 교육 포함"]),
                }
            )

        picked_expense = rng.sample(expense_catalog, k=rng.randint(1, min(3, len(expense_catalog))))
        for expense_name, basis in picked_expense:
            phase = rng.choice(["fabrication", "installation"])
            amount = rng.randint(250_000, 3_800_000)
            expense_items.append(
                {
                    "equipment_name": equipment_name,
                    "expense_name": expense_name,
                    "basis": basis,
                    "amount": amount,
                    "phase": phase,
                    "memo": rng.choice(["견적 반영", "현장 실비", "계약 단가", "긴급 구매"]),
                }
            )

    def _execution_amount(amount: float) -> int:
        jitter = rng.uniform(0.88, 1.18)
        return int(round(max(0.0, float(amount) * execution_ratio * jitter)))

    execution_material_items = []
    for item in rng.sample(material_items, k=min(len(material_items), rng.randint(2, 6))):
        execution_material_items.append(
            {
                "equipment_name": item["equipment_name"],
                "unit_name": f"{item['unit_name']}-실집행",
                "part_name": item["part_name"],
                "spec": item["spec"],
                "executed_amount": _execution_amount(item["quantity"] * item["unit_price"]),
                "phase": item["phase"],
                "memo": "대체 구매/추가 구매 반영",
            }
        )

    execution_labor_items = []
    for item in rng.sample(labor_items, k=min(len(labor_items), rng.randint(1, 4))):
        execution_labor_items.append(
            {
                "equipment_name": item["equipment_name"],
                "task_name": f"{item['task_name']}-실집행",
                "worker_type": item["worker_type"],
                "executed_amount": _execution_amount(item["quantity"] * item["hourly_rate"]),
                "phase": item["phase"],
                "memo": "현장 투입/추가 작업 반영",
            }
        )

    execution_expense_items = []
    for item in rng.sample(expense_items, k=min(len(expense_items), rng.randint(1, 4))):
        execution_expense_items.append(
            {
                "equipment_name": item["equipment_name"],
                "expense_name": f"{item['expense_name']}-실집행",
                "basis": item["basis"],
                "executed_amount": _execution_amount(item["amount"]),
                "phase": item["phase"],
                "memo": "실비 정산 기준",
            }
        )

    budget_settings = {
        "installation_locale": installation_locale,
        "labor_days_per_week_domestic": rng.choice([5.0, 5.5, 6.0]),
        "labor_days_per_week_overseas": rng.choice([6.0, 7.0]),
        "labor_days_per_month_domestic": rng.choice([20.0, 22.0, 24.0]),
        "labor_days_per_month_overseas": rng.choice([26.0, 30.0]),
    }

    return {
        "material_items": material_items,
        "labor_items": labor_items,
        "expense_items": expense_items,
        "execution_material_items": execution_material_items,
        "execution_labor_items": execution_labor_items,
        "execution_expense_items": execution_expense_items,
        "budget_settings": budget_settings,
    }


def _build_agenda_body(
    *,
    rng: random.Random,
    project_name: str,
    project_code: str,
    project_type: str,
    project_stage: str,
    agenda_no: int,
) -> tuple[str, str]:
    topics = [
        "현장 간섭 및 레이아웃 조정",
        "알람 코드/센서 신호 불안정",
        "자재 수급 지연 및 대체품 검토",
        "도면/사양 불일치 정리",
        "시운전/검증 중 품질 이슈",
        "납기 리스크 및 리소스 재배치",
        "통신/네트워크 지연 이슈",
        "작업자 교육 및 표준 작업서 정리",
    ]
    symptom_pool = [
        "특정 조건에서만 간헐적으로 재현되어 원인 분리가 필요합니다.",
        "알람 발생 시점의 로그가 부족하여 추가 로깅이 필요합니다.",
        "현장 케이블 라우팅 변경 가능성이 있어 간섭 검토가 필요합니다.",
        "부품 편차/조립 공차 누적으로 정렬 편차가 발생할 수 있습니다.",
    ]
    cause_pool = [
        "센서 디바운스/필터 설정이 현장 환경과 맞지 않을 수 있습니다.",
        "기구 간섭 또는 고정 상태 불량(볼트 토크, 브라켓 위치)이 의심됩니다.",
        "PLC 통신 지연 또는 인터록 조건 누락 가능성이 있습니다.",
        "대체 부품 적용으로 스펙 편차가 발생했을 수 있습니다.",
    ]
    action_pool = [
        "재현 조건 고정 후 3회 반복 테스트를 진행합니다.",
        "핵심 신호(센서/상태/알람) 로깅 주기를 200ms로 강화합니다.",
        "A/B 테스트로 기계/전기/제어 파트를 단계적으로 분리 점검합니다.",
        "임시 조치 후 즉시 롤백 가능하도록 파라미터 백업을 수행합니다.",
        "인수 기준(알람 미발생, 처리량, 품질)을 문서로 합의합니다.",
    ]
    priority = rng.choice(["P0(긴급)", "P1(높음)", "P2(보통)"])
    topic = rng.choice(topics)
    requester = rng.choice(["이용호", "김지수", "박민준", "최서연", "정하늘", "오지훈"])
    responder = rng.choice(["이용호", "김지수", "박민준", "최서연", "정하늘", "오지훈"])

    lines = [
        f"[데모 안건 #{agenda_no:02d}] {topic}",
        f"프로젝트: {project_name} ({project_code})",
        f"구분: {project_type} · 단계: {project_stage} · 담당자: {responder}",
        f"요청자: {requester} / 응답자: {responder}",
        f"현상: {rng.choice(symptom_pool)}",
        f"- 추가 관찰: {rng.choice(symptom_pool)}",
        f"원인 가설: {rng.choice(cause_pool)}",
        f"- 보완 가설: {rng.choice(cause_pool)}",
        "조치 계획:",
        f"- {rng.choice(action_pool)}",
        f"- {rng.choice(action_pool)}",
        f"- {rng.choice(action_pool)}",
        f"확인 요청: {rng.choice(['사진/영상 공유', '로그 파일 전달', '현장 재현 조건 확인', '승인 여부 회신'])}",
        f"우선순위: {priority}",
        f"메모: {uuid.uuid4().hex[:8]}",
    ]

    content_plain = "\n".join(lines).strip()
    content_html = "<p>" + "<br/>".join(html.escape(line) for line in lines) + "</p>"
    return content_plain, content_html


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--project-count", type=int, default=30)
    parser.add_argument("--agendas-per-project", type=int, default=20)
    parser.add_argument("--replies-per-thread", type=int, default=2)
    parser.add_argument("--comments-per-thread", type=int, default=2)
    parser.add_argument("--files-per-project", type=int, default=4)
    parser.add_argument("--seed", type=int, default=20260215)
    args = parser.parse_args()

    ensure_runtime_schema()
    session = SessionLocal()
    rng = random.Random(int(args.seed))
    try:
        active_users = (
            session.query(models.User)
            .filter(models.User.is_active.is_(True), models.User.email_verified.is_(True))
            .order_by(models.User.id.asc())
            .all()
        )
        if not active_users:
            raise RuntimeError("활성/인증된 사용자 계정을 찾을 수 없습니다.")
        creator = active_users[0]

        now_iso = to_iso(utcnow())
        today = utcnow().date()

        session.execute(
            text(
                """
                TRUNCATE TABLE
                    agenda_comments,
                    agenda_attachments,
                    agenda_entries,
                    agenda_threads,
                    document_folders,
                    budget_equipments,
                    budget_versions,
                    documents,
                    dedup_audit_log,
                    dedup_cluster_members,
                    dedup_clusters,
                    budget_projects
                RESTART IDENTITY CASCADE;
                """
            )
        )
        session.commit()

        customers = [
            "가상반도체",
            "가상배터리",
            "가상물류",
            "가상전자",
            "가상식품",
            "가상자동차",
            "가상정밀",
        ]
        sites = [
            "화성 1공장",
            "오창 파일럿동",
            "평택 허브센터",
            "구미 생산기술팀",
            "천안 조립동",
            "울산 라인A",
            "광주 스마트팩토리",
        ]
        equipment_names = [
            "반도체 검사라인",
            "2차전지 조립 셀",
            "물류센터 AGV",
            "식음료 포장 라인",
            "자동차 부품 조립",
            "디스플레이 검사",
            "로봇 핸들링",
            "정밀 계측 라인",
        ]
        parts_names = [
            "센서 모듈",
            "컨베이어 부품",
            "비전 카메라 키트",
            "서보 드라이브 세트",
            "안전 장치 패키지",
            "전장 패널",
            "배선 하네스",
        ]
        as_names = [
            "긴급 현장 지원",
            "정기 점검",
            "부품 교체",
            "알람 대응",
            "튜닝/재설정",
        ]

        def _pick_design_start(stage: str) -> date:
            if stage == "review":
                return today + timedelta(days=rng.randint(14, 70))
            if stage == "design":
                return today - timedelta(days=rng.randint(2, 14))
            if stage == "fabrication":
                return today - timedelta(days=rng.randint(28, 90))
            if stage == "installation":
                return today - timedelta(days=rng.randint(60, 140))
            if stage == "warranty":
                return today - timedelta(days=rng.randint(160, 320))
            if stage == "closure":
                return today - timedelta(days=rng.randint(540, 760))
            return today

        def _build_dates(stage: str, kind: str) -> dict[str, date]:
            design_start = _pick_design_start(stage)
            if kind == "parts":
                design_days = rng.randint(3, 10)
                fab_days = rng.randint(5, 16)
                ins_days = rng.randint(2, 8)
            else:
                design_days = rng.randint(7, 20)
                fab_days = rng.randint(12, 42)
                ins_days = rng.randint(6, 18)

            gap1 = rng.randint(1, 5)
            gap2 = rng.randint(1, 6)

            design_end = design_start + timedelta(days=design_days - 1)
            fabrication_start = design_end + timedelta(days=gap1)
            fabrication_end = fabrication_start + timedelta(days=fab_days - 1)
            installation_start = fabrication_end + timedelta(days=gap2)
            installation_end = installation_start + timedelta(days=ins_days - 1)

            # Ensure closure-stage projects actually have warranty end in the past.
            if stage == "closure":
                min_install_end = today - timedelta(days=370)
                if installation_end >= min_install_end:
                    shift = (installation_end - min_install_end).days + rng.randint(7, 35)
                    design_start -= timedelta(days=shift)
                    design_end -= timedelta(days=shift)
                    fabrication_start -= timedelta(days=shift)
                    fabrication_end -= timedelta(days=shift)
                    installation_start -= timedelta(days=shift)
                    installation_end -= timedelta(days=shift)

            return {
                "anchor": design_start,
                "design_start": design_start,
                "design_end": design_end,
                "fabrication_start": fabrication_start,
                "fabrication_end": fabrication_end,
                "installation_start": installation_start,
                "installation_end": installation_end,
            }

        stage_templates_equipment = (
            ["review"] * 3
            + ["design"] * 4
            + ["fabrication"] * 3
            + ["installation"] * 3
            + ["warranty"] * 2
            + ["closure"] * 1
        )
        stage_templates_parts = ["review"] * 2 + ["fabrication"] * 4 + ["installation"] * 1 + ["closure"] * 1
        stage_templates_as = ["review"] * 2 + ["warranty"] * 3 + ["closure"] * 1

        plans: list[ProjectPlan] = []
        year = today.year
        equipment_count = min(16, max(0, int(args.project_count) - 14))
        parts_count = min(8, max(0, int(args.project_count) - equipment_count - 6))
        as_count = max(0, int(args.project_count) - equipment_count - parts_count)
        as_count = min(6, as_count)
        # If user asked for more than 30, keep a stable mix but scale equipment projects.
        if int(args.project_count) > 30:
            equipment_count = int(args.project_count) - parts_count - as_count

        rng.shuffle(stage_templates_equipment)
        rng.shuffle(stage_templates_parts)
        rng.shuffle(stage_templates_as)

        for index in range(equipment_count):
            base = _random_choice(rng, equipment_names, "설비 프로젝트")
            name = f"{base} {index + 1:02d} 구축"
            code = f"EQ-{year}-{index + 1:03d}"
            stage = stage_templates_equipment[index % len(stage_templates_equipment)]
            plans.append(
                ProjectPlan(
                    project_type="equipment",
                    stage=stage,
                    name=name,
                    code=code,
                    description=_random_choice(rng, ["표준 설비 구축 데모", "라인 개선 및 안정화", "신규 라인 증설", ""], ""),
                    customer_name=_random_choice(rng, customers, ""),
                    installation_site=_random_choice(rng, sites, ""),
                )
            )

        for index in range(parts_count):
            base = _random_choice(rng, parts_names, "파츠 프로젝트")
            name = f"{base} {index + 1:02d} 납품"
            code = f"PT-{year}-{index + 1:03d}"
            stage = stage_templates_parts[index % len(stage_templates_parts)]
            plans.append(
                ProjectPlan(
                    project_type="parts",
                    stage=stage,
                    name=name,
                    code=code,
                    description=_random_choice(rng, ["예비품/소모품 납품", "파츠 교체/개선", ""], ""),
                    customer_name=_random_choice(rng, customers, ""),
                    installation_site=_random_choice(rng, sites, ""),
                )
            )

        for index in range(as_count):
            base = _random_choice(rng, as_names, "AS 프로젝트")
            name = f"AS {base} {index + 1:02d}"
            code = f"AS-{year}-{index + 1:03d}"
            stage = stage_templates_as[index % len(stage_templates_as)]
            plans.append(
                ProjectPlan(
                    project_type="as",
                    stage=stage,
                    name=name,
                    code=code,
                    description=_random_choice(rng, ["현장 대응 데모", "정기 점검/보고", ""], ""),
                    customer_name=_random_choice(rng, customers, ""),
                    installation_site=_random_choice(rng, sites, ""),
                )
            )

        plans = plans[: int(args.project_count)]

        created_equipment_project_ids: list[int] = []
        created_project_ids: list[int] = []
        created_reply_entries = 0
        created_comments = 0
        created_folders = 0
        created_documents = 0
        UPLOAD_DOCUMENTS_DIR.mkdir(parents=True, exist_ok=True)

        for plan in plans:
            kind = plan.project_type
            stage = plan.stage
            is_as_project = kind == "as"
            execution_ratio_by_stage = {
                "review": 0.0,
                "design": 0.06,
                "fabrication": 0.42,
                "installation": 0.66,
                "warranty": 0.24,
                "closure": 0.92,
            }
            execution_ratio = float(execution_ratio_by_stage.get(stage, 0.0))

            dates = _build_dates(stage, kind if kind in {"parts"} else "equipment")
            created_day = today - timedelta(days=rng.randint(1, 55)) if stage == "review" else dates["design_start"] - timedelta(days=rng.randint(3, 28))
            created_at_iso = _iso_from_date(created_day, hour=rng.randint(7, 11), minute=rng.choice([0, 10, 20, 30, 40, 50]))

            schedule_json = None
            if not is_as_project:
                schedule_json = _build_schedule_json(
                    rng=rng,
                    anchor=dates["anchor"],
                    design_start=dates["design_start"],
                    design_end=dates["design_end"],
                    fabrication_start=dates["fabrication_start"],
                    fabrication_end=dates["fabrication_end"],
                    installation_start=dates["installation_start"],
                    installation_end=dates["installation_end"],
                    now_iso=now_iso,
                )

            project = models.BudgetProject(
                name=plan.name,
                code=plan.code,
                description=plan.description,
                project_type=kind,
                parent_project_id=None,
                customer_name=plan.customer_name,
                installation_site=plan.installation_site,
                business_trip_distance_km=float(rng.choice([0.0, 12.5, 45.0, 120.0, 320.0])),
                cover_image_url=None,
                summary_milestones_json=None,
                schedule_wbs_json=schedule_json,
                created_by_user_id=int(creator.id),
                manager_user_id=int(creator.id),
                current_stage=stage,
                created_at=created_at_iso,
                updated_at=now_iso,
            )
            session.add(project)
            session.flush()

            if kind == "equipment":
                created_equipment_project_ids.append(int(project.id))

            created_project_ids.append(int(project.id))

            detail_payload = _build_budget_detail_payload(
                rng=rng,
                project_name=plan.name,
                execution_ratio=execution_ratio,
                equipment_count=rng.randint(1, 3),
                installation_locale=rng.choice(["domestic", "overseas"]),
            )
            version = models.BudgetVersion(
                project_id=int(project.id),
                stage=stage,
                status="confirmed",
                version_no=1,
                revision_no=0,
                parent_version_id=None,
                change_reason="",
                budget_detail_json=detail_payload_to_json(detail_payload),
                is_current=True,
                confirmed_at=now_iso,
                created_at=now_iso,
                updated_at=now_iso,
            )
            session.add(version)
            session.flush()

            aggregates = aggregate_equipment_costs_from_detail(detail_payload)
            for sort_order, aggregate in enumerate(aggregates):
                session.add(
                    models.BudgetEquipment(
                        version_id=int(version.id),
                        equipment_name=aggregate["equipment_name"],
                        material_fab_cost=aggregate["material_fab_cost"],
                        material_install_cost=aggregate["material_install_cost"],
                        labor_fab_cost=aggregate["labor_fab_cost"],
                        labor_install_cost=aggregate["labor_install_cost"],
                        expense_fab_cost=aggregate["expense_fab_cost"],
                        expense_install_cost=aggregate["expense_install_cost"],
                        currency="KRW",
                        sort_order=sort_order,
                        created_at=now_iso,
                        updated_at=now_iso,
                        )
                )

            # Project data folders + demo files (pdf/xlsx)
            folder_now_iso = to_iso(utcnow() - timedelta(days=rng.randint(0, 120)))
            root_folder = models.DocumentFolder(
                project_id=int(project.id),
                parent_folder_id=None,
                name="기본 폴더",
                sort_order=0,
                is_system_root=True,
                created_by_user_id=int(creator.id),
                created_at=folder_now_iso,
                updated_at=folder_now_iso,
            )
            session.add(root_folder)
            session.flush()
            created_folders += 1

            folder_names = ["설계자료", "회의록", "검수자료"]
            child_folders: list[models.DocumentFolder] = []
            for folder_index, folder_name in enumerate(folder_names, start=1):
                child = models.DocumentFolder(
                    project_id=int(project.id),
                    parent_folder_id=int(root_folder.id),
                    name=folder_name,
                    sort_order=folder_index,
                    is_system_root=False,
                    created_by_user_id=int(creator.id),
                    created_at=folder_now_iso,
                    updated_at=folder_now_iso,
                )
                session.add(child)
                child_folders.append(child)
                created_folders += 1
            session.flush()

            files_per_project = max(2, int(args.files_per_project))
            for file_index in range(files_per_project):
                extension = ".pdf" if file_index % 2 == 0 else ".xlsx"
                folder_target = child_folders[file_index % len(child_folders)] if child_folders else root_folder
                folder_label = folder_target.name or "자료"
                public_filename = f"{_slugify_text(plan.code)}_{_slugify_text(folder_label)}_{file_index + 1:02d}{extension}"
                stored_filename = f"seed-{_slugify_text(plan.code)}-{uuid.uuid4().hex[:12]}{extension}"
                relative_path = Path("uploads") / "documents" / stored_filename
                absolute_path = ROOT_DIR / relative_path

                if extension == ".pdf":
                    _create_seed_pdf(absolute_path)
                else:
                    _create_seed_xlsx(
                        absolute_path,
                        title=f"{plan.name} {folder_label} 리포트",
                        project_code=plan.code,
                    )

                doc_created_at = to_iso(utcnow() - timedelta(days=rng.randint(0, 120), hours=rng.randint(0, 12)))
                content_text = "\n".join(
                    [
                        f"프로젝트 코드: {plan.code}",
                        f"프로젝트 명: {plan.name}",
                        f"자료 구분: {folder_label}",
                        f"단계: {stage}",
                        "데모 데이터 문서 본문입니다.",
                    ]
                )
                doc_comment = rng.choice(
                    [
                        "초안 검토본입니다.",
                        "고객 공유 전 내부 검토 필요.",
                        "최종 승인본 업데이트 예정.",
                        "현장 피드백 반영본입니다.",
                    ]
                )
                doc_types = classify_document_types(public_filename, content_text)

                session.add(
                    models.Document(
                        filename=public_filename,
                        file_path=str(relative_path).replace(os.sep, "/"),
                        status="completed",
                        content_text=content_text,
                        document_types=serialize_document_types(doc_types),
                        ai_title=f"{plan.name} {folder_label} 자료",
                        ai_summary_short=f"{plan.code} · {folder_label} 관련 데모 문서",
                        created_at=doc_created_at,
                        updated_at=doc_created_at,
                        project_id=int(project.id),
                        folder_id=int(folder_target.id),
                        uploaded_by_user_id=int(creator.id),
                        upload_comment=doc_comment,
                    )
                )
                created_documents += 1

            # Agenda threads + root entries.
            for agenda_index in range(int(args.agendas_per_project)):
                content_plain, content_html = _build_agenda_body(
                    rng=rng,
                    project_name=plan.name,
                    project_code=plan.code,
                    project_type=kind,
                    project_stage=stage,
                    agenda_no=agenda_index + 1,
                )
                thread_now = to_iso(utcnow() - timedelta(days=rng.randint(0, 120)))
                progress_status = rng.choice(["in_progress", "completed"])
                requester_name = rng.choice(["이용호", "김지수", "박민준", "최서연", "정하늘", "오지훈"])
                responder_name = rng.choice(["이용호", "김지수", "박민준", "최서연", "정하늘", "오지훈"])

                thread = models.AgendaThread(
                    project_id=int(project.id),
                    thread_kind="general",
                    record_status="published",
                    progress_status=progress_status,
                    agenda_code=f"TMP-{uuid.uuid4().hex[:12]}",
                    created_by_user_id=int(creator.id),
                    source_thread_id=None,
                    title=f"{plan.name} 안건 {agenda_index + 1:02d} - {rng.choice(['이슈', '요청', '검토', '정리'])}",
                    summary_plain=content_plain[:1200],
                    requester_name=requester_name,
                    requester_org=rng.choice(["고객사", "생산기술", "품질", "설비팀", "구매"]),
                    responder_name=responder_name,
                    responder_org=rng.choice(["자사", "협력사"]),
                    report_payload_json=None,
                    created_at=thread_now,
                    published_at=thread_now,
                    last_updated_at=thread_now,
                    updated_at=thread_now,
                )
                session.add(thread)
                session.flush()

                try:
                    year_value = datetime.fromisoformat(thread_now).year
                except Exception:  # noqa: BLE001
                    year_value = today.year
                thread.agenda_code = f"AG-{year_value}-{int(thread.id):06d}"

                root_entry = models.AgendaEntry(
                    thread_id=int(thread.id),
                    project_id=int(project.id),
                    parent_entry_id=None,
                    entry_kind="root",
                    record_status="published",
                    created_by_user_id=int(creator.id),
                    title=thread.title,
                    content_html=content_html,
                    content_plain=content_plain,
                    requester_name=requester_name,
                    requester_org=thread.requester_org,
                    responder_name=responder_name,
                    responder_org=thread.responder_org,
                    entry_payload_json=json.dumps({}, ensure_ascii=False),
                    attachment_count=0,
                    created_at=thread_now,
                    published_at=thread_now,
                    updated_at=thread_now,
                )
                session.add(root_entry)
                session.flush()

                try:
                    base_dt = datetime.fromisoformat(str(thread_now))
                except Exception:  # noqa: BLE001
                    base_dt = utcnow()
                if base_dt.tzinfo is None:
                    base_dt = base_dt.replace(tzinfo=timezone.utc)

                latest_entry_id = int(root_entry.id)
                latest_dt = base_dt

                replies_per_thread = max(0, int(args.replies_per_thread))
                for reply_index in range(replies_per_thread):
                    reply_dt = base_dt + timedelta(hours=reply_index + 1)
                    reply_iso = to_iso(reply_dt)
                    reply_plain, reply_html = _build_agenda_reply_body(
                        rng=rng,
                        project_name=plan.name,
                        agenda_title=thread.title,
                        reply_no=reply_index + 1,
                    )
                    reply_entry = models.AgendaEntry(
                        thread_id=int(thread.id),
                        project_id=int(project.id),
                        parent_entry_id=int(root_entry.id),
                        entry_kind="reply",
                        record_status="published",
                        created_by_user_id=int(creator.id),
                        title=f"{thread.title} 답변 {reply_index + 1:02d}",
                        content_html=reply_html,
                        content_plain=reply_plain,
                        requester_name=requester_name,
                        requester_org=thread.requester_org,
                        responder_name=responder_name,
                        responder_org=thread.responder_org,
                        entry_payload_json=json.dumps({}, ensure_ascii=False),
                        attachment_count=0,
                        created_at=reply_iso,
                        published_at=reply_iso,
                        updated_at=reply_iso,
                    )
                    session.add(reply_entry)
                    session.flush()
                    latest_entry_id = int(reply_entry.id)
                    latest_dt = max(latest_dt, reply_dt)
                    created_reply_entries += 1

                comments_per_thread = max(0, int(args.comments_per_thread))
                for comment_index in range(comments_per_thread):
                    comment_dt = base_dt + timedelta(hours=replies_per_thread + comment_index + 1)
                    comment_iso = to_iso(comment_dt)
                    comment = models.AgendaComment(
                        project_id=int(project.id),
                        thread_id=int(thread.id),
                        created_by_user_id=int(creator.id),
                        body=_build_comment_body(rng=rng),
                        created_at=comment_iso,
                    )
                    session.add(comment)
                    latest_dt = max(latest_dt, comment_dt)
                    created_comments += 1

                thread.root_entry_id = int(root_entry.id)
                thread.latest_entry_id = latest_entry_id
                thread.reply_count = replies_per_thread
                thread.comment_count = comments_per_thread
                thread.attachment_count = 0
                thread.last_updated_at = to_iso(latest_dt)
                thread.updated_at = to_iso(latest_dt)

        # Link AS projects to equipment parents (required business rule).
        if created_equipment_project_ids:
            equipment_cycle = created_equipment_project_ids[:]
            for project in session.query(models.BudgetProject).filter(models.BudgetProject.project_type == "as").all():
                if project.parent_project_id:
                    continue
                parent_id = equipment_cycle[int(project.id) % len(equipment_cycle)]
                project.parent_project_id = int(parent_id)
                project.updated_at = now_iso

        session.commit()

        def _count(table) -> int:
            return int(session.query(table).count())

        project_total = _count(models.BudgetProject)
        agenda_total = _count(models.AgendaThread)
        entry_total = _count(models.AgendaEntry)
        version_total = _count(models.BudgetVersion)
        equipment_total = _count(models.BudgetEquipment)
        folder_total = _count(models.DocumentFolder)
        document_total = _count(models.Document)
        comment_total = _count(models.AgendaComment)

        print(f"[seed] projects={project_total}")
        print(f"[seed] agendas={agenda_total} (threads), entries={entry_total}")
        print(f"[seed] replies={created_reply_entries}, comments={created_comments} (db:{comment_total})")
        print(f"[seed] versions={version_total}, equipments={equipment_total}")
        print(f"[seed] data folders={folder_total}, documents={document_total} (created:{created_documents})")
        print(f"[seed] creator_user_id={int(creator.id)}")
    finally:
        session.close()


if __name__ == "__main__":
    main()
