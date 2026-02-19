#!/usr/bin/env python3
"""Export executive-report context from current DB state.

Run in Docker:
  docker exec -w /app synchub_web python3 scripts/export_exec_report_context.py
"""

from __future__ import annotations

import argparse
import json
from collections import Counter, defaultdict
from pathlib import Path
import sys

ROOT_DIR = Path(__file__).resolve().parents[1]
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

from app import models
from app.core.auth_utils import to_iso, utcnow
from app.database import SessionLocal, ensure_runtime_schema


TYPE_LABELS = {
    "equipment": "설비 프로젝트",
    "parts": "파츠 프로젝트",
    "as": "AS 프로젝트",
}

STAGE_LABELS = {
    "review": "검토",
    "design": "설계",
    "fabrication": "제작",
    "installation": "설치",
    "warranty": "워런티",
    "closure": "종료",
}


def _money(value: float) -> int:
    return int(round(float(value or 0.0)))


def _budget_total(session: SessionLocal, version_id: int) -> int:
    items = (
        session.query(models.BudgetEquipment)
        .filter(models.BudgetEquipment.version_id == int(version_id))
        .all()
    )
    total = 0
    for item in items:
        total += _money(item.material_fab_cost)
        total += _money(item.material_install_cost)
        total += _money(item.labor_fab_cost)
        total += _money(item.labor_install_cost)
        total += _money(item.expense_fab_cost)
        total += _money(item.expense_install_cost)
    return int(total)


def _project_snapshot(session: SessionLocal, project: models.BudgetProject | None) -> dict | None:
    if project is None:
        return None

    threads = (
        session.query(models.AgendaThread)
        .filter(models.AgendaThread.project_id == int(project.id))
        .all()
    )
    thread_count = len(threads)
    reply_count = int(sum(int(item.reply_count or 0) for item in threads))
    comment_count = int(sum(int(item.comment_count or 0) for item in threads))
    latest_thread = None
    if threads:
        latest_thread = sorted(
            threads,
            key=lambda item: str(item.last_updated_at or item.updated_at or item.created_at or ""),
            reverse=True,
        )[0]

    agenda_sample_titles = [str(item.title or "").strip() for item in threads[:3] if str(item.title or "").strip()]

    folder_count = int(
        session.query(models.DocumentFolder)
        .filter(models.DocumentFolder.project_id == int(project.id))
        .count()
    )
    document_count = int(
        session.query(models.Document)
        .filter(models.Document.project_id == int(project.id))
        .count()
    )

    version = (
        session.query(models.BudgetVersion)
        .filter(
            models.BudgetVersion.project_id == int(project.id),
            models.BudgetVersion.is_current.is_(True),
        )
        .order_by(models.BudgetVersion.id.desc())
        .first()
    )
    budget_total = _budget_total(session, int(version.id)) if version else 0

    return {
        "id": int(project.id),
        "code": str(project.code or ""),
        "name": str(project.name or ""),
        "project_type": str(project.project_type or ""),
        "project_type_label": TYPE_LABELS.get(str(project.project_type or ""), str(project.project_type or "")),
        "current_stage": str(project.current_stage or ""),
        "current_stage_label": STAGE_LABELS.get(str(project.current_stage or ""), str(project.current_stage or "")),
        "parent_project_id": int(project.parent_project_id) if project.parent_project_id else None,
        "customer_name": str(project.customer_name or ""),
        "installation_site": str(project.installation_site or ""),
        "description": str(project.description or ""),
        "has_schedule": bool(str(project.schedule_wbs_json or "").strip()),
        "metrics": {
            "thread_count": thread_count,
            "reply_count": reply_count,
            "comment_count": comment_count,
            "folder_count": folder_count,
            "document_count": document_count,
            "budget_total_krw": int(budget_total),
        },
        "agenda_sample_titles": agenda_sample_titles,
        "latest_agenda_code": str((latest_thread.agenda_code if latest_thread else "") or ""),
        "latest_agenda_title": str((latest_thread.title if latest_thread else "") or ""),
    }


def _page_inventory() -> list[dict]:
    return [
        {
            "route": "/login",
            "name": "로그인",
            "status": "implemented",
            "features": ["이메일/비밀번호 인증 로그인", "세션 토큰 발급 후 홈으로 이동"],
        },
        {
            "route": "/signup",
            "name": "회원가입",
            "status": "implemented",
            "features": ["도메인 정책 기반 가입 요청", "메일 인증 링크 발송"],
        },
        {
            "route": "/verify-email",
            "name": "이메일 인증",
            "status": "implemented",
            "features": ["인증 토큰 검증", "계정 활성화 처리"],
        },
        {
            "route": "/home",
            "name": "통합 검색/프로젝트 홈",
            "status": "implemented",
            "features": ["프로젝트/안건/문서 통합 검색", "프로젝트 카드, 최신 안건, 일정/예산 요약 노출"],
        },
        {
            "route": "/project-management/projects/new",
            "name": "프로젝트 생성",
            "status": "implemented",
            "features": ["프로젝트 유형/관리자/고객/설비 입력", "커버 이미지 업로드, 초기 버전 생성"],
        },
        {
            "route": "/project-management/projects/:projectId",
            "name": "프로젝트 메인",
            "status": "implemented",
            "features": ["단계/안건/예산/일정 요약", "최신 안건 및 마일스톤 패널"],
        },
        {
            "route": "/project-management/projects/:projectId/info/edit",
            "name": "프로젝트 설정",
            "status": "implemented",
            "features": ["프로젝트 기본 정보 수정", "관리자/고객/설치 정보 관리"],
        },
        {
            "route": "/project-management/projects/:projectId/budget",
            "name": "예산 메인",
            "status": "implemented",
            "features": ["재료비/인건비/경비 탭", "예산 대비 집행 현황 및 엑셀 업로드"],
        },
        {
            "route": "/project-management/projects/:projectId/edit/material",
            "name": "예산 입력 - 재료비",
            "status": "implemented",
            "features": ["설비/페이즈/유닛 기준 트리 입력", "예산/집행 항목 편집"],
        },
        {
            "route": "/project-management/projects/:projectId/edit/labor",
            "name": "예산 입력 - 인건비",
            "status": "implemented",
            "features": ["부서 항목 추가 기반 입력", "예산/집행 인건비 상세 입력"],
        },
        {
            "route": "/project-management/projects/:projectId/edit/expense",
            "name": "예산 입력 - 경비",
            "status": "implemented",
            "features": ["기본 경비 항목 자동 표시", "예산/집행 경비 상세 입력"],
        },
        {
            "route": "/project-management/projects/:projectId/agenda",
            "name": "안건 관리",
            "status": "implemented",
            "features": ["안건 목록/상태 조회", "안건 작성 및 상세 진입"],
        },
        {
            "route": "/project-management/projects/:projectId/agenda/new",
            "name": "안건 작성",
            "status": "implemented",
            "features": ["일반 안건/작업보고 입력", "임시저장/재등록/첨부 업로드"],
        },
        {
            "route": "/project-management/projects/:projectId/agenda/:agendaId",
            "name": "안건 상세",
            "status": "implemented",
            "features": ["답변 작성(파일 첨부)", "코멘트 등록 및 상태 변경"],
        },
        {
            "route": "/project-management/projects/:projectId/schedule",
            "name": "일정 관리",
            "status": "implemented",
            "features": ["마일스톤/간트 조회", "검색 및 단계별 일정 집계"],
        },
        {
            "route": "/project-management/projects/:projectId/schedule/write",
            "name": "일정 작성",
            "status": "implemented",
            "features": ["그룹/작업/이벤트 편집", "다른 프로젝트 일정 불러오기"],
        },
        {
            "route": "/project-management/projects/:projectId/data",
            "name": "데이터 관리(프로젝트 자료실)",
            "status": "implemented",
            "features": ["좌측 폴더 트리(생성/삭제/이름변경)", "우측 업로드+코멘트/파일 리스트/파일 우클릭"],
        },
        {
            "route": "/data-hub",
            "name": "데이터 허브",
            "status": "implemented",
            "features": ["문서 검색 + AI 질의응답", "업로드 권한 기반 문서 등록"],
        },
        {
            "route": "/project-management/projects/:projectId/spec",
            "name": "사양 관리",
            "status": "placeholder",
            "features": ["현재 안내용 플레이스홀더 페이지 제공", "차기 단계 구현 예정"],
        },
    ]


def _scenario_templates() -> dict:
    return {
        "equipment": {
            "title": "설비 구축형 시나리오",
            "summary": "검토-설계-제작-설치-워런티 전체 수명주기를 따라 예산/일정/안건/자료를 통합 관리합니다.",
            "flow": ["검토/수주 검토", "설계/사양 확정", "제작/원가 집행", "설치/시운전", "워런티/종료"],
        },
        "parts": {
            "title": "파츠 납품형 시나리오",
            "summary": "파츠 중심의 빠른 납품 주기를 기준으로 예산/안건/자료 이력을 관리합니다.",
            "flow": ["검토", "제작/조달", "설치 또는 납품 완료", "종료"],
        },
        "as": {
            "title": "AS 유지보수형 시나리오",
            "summary": "기존 설비 프로젝트와 연결되어 워런티/현장 대응 이력을 중심으로 관리합니다.",
            "flow": ["접수/검토", "현장 대응", "워런티 추적", "종료"],
        },
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--output",
        default="reports/executive/2026-02-19/context.json",
        help="Output JSON path",
    )
    args = parser.parse_args()

    ensure_runtime_schema()
    session = SessionLocal()
    try:
        projects = session.query(models.BudgetProject).order_by(models.BudgetProject.id.asc()).all()
        by_type = Counter(str(item.project_type or "") for item in projects)
        by_stage = Counter(str(item.current_stage or "") for item in projects)

        by_type_stage: dict[str, dict[str, int]] = defaultdict(dict)
        for item in projects:
            type_key = str(item.project_type or "")
            stage_key = str(item.current_stage or "")
            by_type_stage[type_key][stage_key] = int(by_type_stage[type_key].get(stage_key, 0) + 1)

        representatives: dict[str, dict | None] = {}
        for project_type in ("equipment", "parts", "as"):
            sample = (
                session.query(models.BudgetProject)
                .filter(models.BudgetProject.project_type == project_type)
                .order_by(models.BudgetProject.id.asc())
                .first()
            )
            representatives[project_type] = _project_snapshot(session, sample)

        stats = {
            "projects_total": int(len(projects)),
            "projects_by_type": {key: int(value) for key, value in sorted(by_type.items())},
            "projects_by_stage": {key: int(value) for key, value in sorted(by_stage.items())},
            "projects_by_type_stage": {
                type_key: {stage_key: int(count) for stage_key, count in sorted(stage_map.items())}
                for type_key, stage_map in sorted(by_type_stage.items())
            },
            "agenda_threads_total": int(session.query(models.AgendaThread).count()),
            "agenda_entries_total": int(session.query(models.AgendaEntry).count()),
            "agenda_comments_total": int(session.query(models.AgendaComment).count()),
            "documents_total": int(session.query(models.Document).count()),
            "document_folders_total": int(session.query(models.DocumentFolder).count()),
            "budget_versions_total": int(session.query(models.BudgetVersion).count()),
            "budget_equipments_total": int(session.query(models.BudgetEquipment).count()),
        }

        scenarios = _scenario_templates()
        for project_type, snapshot in representatives.items():
            scenarios[project_type]["representative"] = snapshot

        eq_id = int((representatives.get("equipment") or {}).get("id") or 0)
        pt_id = int((representatives.get("parts") or {}).get("id") or 0)
        as_id = int((representatives.get("as") or {}).get("id") or 0)

        def _first_thread_id(project_id: int) -> int:
            if not project_id:
                return 0
            row = (
                session.query(models.AgendaThread)
                .filter(models.AgendaThread.project_id == int(project_id))
                .order_by(models.AgendaThread.id.asc())
                .first()
            )
            return int(row.id) if row else 0

        sample_routes = {
            "equipment_project_id": eq_id,
            "equipment_agenda_id": _first_thread_id(eq_id),
            "parts_project_id": pt_id,
            "parts_agenda_id": _first_thread_id(pt_id),
            "as_project_id": as_id,
            "as_agenda_id": _first_thread_id(as_id),
        }

        payload = {
            "generated_at": to_iso(utcnow()),
            "stats": stats,
            "labels": {
                "project_type": TYPE_LABELS,
                "stage": STAGE_LABELS,
            },
            "representative_projects": representatives,
            "scenarios": scenarios,
            "sample_routes": sample_routes,
            "page_inventory": _page_inventory(),
        }

        output_path = Path(args.output).resolve()
        output_path.parent.mkdir(parents=True, exist_ok=True)
        output_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
        print(f"[ok] wrote context: {output_path}")
        print(
            "[ok] sample routes:"
            f" eq={sample_routes['equipment_project_id']},"
            f" parts={sample_routes['parts_project_id']},"
            f" as={sample_routes['as_project_id']}"
        )
    finally:
        session.close()


if __name__ == "__main__":
    main()
