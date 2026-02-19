#!/usr/bin/env node
/* eslint-disable no-console */

import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';

function resolveEnv(name, fallback) {
  const value = String(process.env[name] || '').trim();
  return value || fallback;
}

async function readJson(filePath) {
  const raw = await fs.readFile(filePath, 'utf8');
  return JSON.parse(raw);
}

function buildCapturePlan(context) {
  const routes = context?.sample_routes || {};
  const eqId = Number(routes.equipment_project_id || 0);
  const eqAgendaId = Number(routes.equipment_agenda_id || 0);
  const partsId = Number(routes.parts_project_id || 0);
  const asId = Number(routes.as_project_id || 0);

  if (!eqId || !eqAgendaId || !partsId || !asId) {
    throw new Error('sample_routes in context.json is incomplete.');
  }

  return [
    {
      key: 'login',
      title: '로그인',
      route: '/login',
      requiresAuth: false,
      waitMs: 1500,
      summary: '이메일/비밀번호 로그인과 세션 시작',
      group: 'auth',
    },
    {
      key: 'signup',
      title: '회원가입',
      route: '/signup',
      requiresAuth: false,
      waitMs: 1500,
      summary: '도메인 정책 기반 가입과 메일 인증 유도',
      group: 'auth',
    },
    {
      key: 'verify_email',
      title: '이메일 인증',
      route: '/verify-email?token=invalid-demo-token',
      requiresAuth: false,
      waitMs: 1500,
      summary: '이메일 인증 토큰 검증 및 결과 안내',
      group: 'auth',
    },
    {
      key: 'home',
      title: '통합 검색/프로젝트 홈',
      route: '/home?q=%EC%95%88%EA%B1%B4',
      requiresAuth: true,
      waitMs: 2400,
      summary: '프로젝트/안건/문서 통합 검색과 프로젝트 카드 대시보드',
      group: 'core',
    },
    {
      key: 'project_create',
      title: '프로젝트 생성',
      route: '/project-management/projects/new',
      requiresAuth: true,
      waitMs: 2000,
      summary: '유형/고객/담당자/설비 입력 및 초기 프로젝트 생성',
      group: 'core',
    },
    {
      key: 'equipment_overview',
      title: '프로젝트 메인(설비형)',
      route: `/project-management/projects/${eqId}`,
      requiresAuth: true,
      waitMs: 2500,
      summary: '안건/일정/예산/데이터 핵심 현황 요약',
      group: 'project',
    },
    {
      key: 'project_info_edit',
      title: '프로젝트 설정',
      route: `/project-management/projects/${eqId}/info/edit`,
      requiresAuth: true,
      waitMs: 2000,
      summary: '프로젝트 기본 정보 및 메타데이터 수정',
      group: 'project',
    },
    {
      key: 'budget_main',
      title: '예산 메인',
      route: `/project-management/projects/${eqId}/budget`,
      requiresAuth: true,
      waitMs: 2600,
      summary: '예산 대비 집행 현황과 재료/인건비/경비 탭 요약',
      group: 'budget',
    },
    {
      key: 'budget_edit_material',
      title: '예산 입력(재료비)',
      route: `/project-management/projects/${eqId}/edit/material`,
      requiresAuth: true,
      waitMs: 2400,
      summary: '재료비 예산/집행 항목 상세 입력',
      group: 'budget',
    },
    {
      key: 'budget_edit_labor',
      title: '예산 입력(인건비)',
      route: `/project-management/projects/${eqId}/edit/labor`,
      requiresAuth: true,
      waitMs: 2400,
      summary: '부서 기준 인건비 예산/집행 입력',
      group: 'budget',
    },
    {
      key: 'budget_edit_expense',
      title: '예산 입력(경비)',
      route: `/project-management/projects/${eqId}/edit/expense`,
      requiresAuth: true,
      waitMs: 2400,
      summary: '기본 경비 항목 기반 경비 예산/집행 입력',
      group: 'budget',
    },
    {
      key: 'agenda_list',
      title: '안건 관리',
      route: `/project-management/projects/${eqId}/agenda`,
      requiresAuth: true,
      waitMs: 2200,
      summary: '안건 목록 조회 및 작성 진입',
      group: 'agenda',
    },
    {
      key: 'agenda_create',
      title: '안건 작성',
      route: `/project-management/projects/${eqId}/agenda/new`,
      requiresAuth: true,
      waitMs: 2200,
      summary: '안건 본문/첨부/임시저장 작성',
      group: 'agenda',
    },
    {
      key: 'agenda_detail',
      title: '안건 상세',
      route: `/project-management/projects/${eqId}/agenda/${eqAgendaId}`,
      requiresAuth: true,
      waitMs: 2500,
      summary: '답변 등록/코멘트 입력/상태 변경',
      group: 'agenda',
    },
    {
      key: 'schedule_management',
      title: '일정 관리',
      route: `/project-management/projects/${eqId}/schedule`,
      requiresAuth: true,
      waitMs: 2600,
      summary: '마일스톤 + 간트 + 필터 검색',
      group: 'schedule',
    },
    {
      key: 'schedule_write',
      title: '일정 작성',
      route: `/project-management/projects/${eqId}/schedule/write`,
      requiresAuth: true,
      waitMs: 2600,
      summary: '그룹/일정/이벤트 편집 및 타 프로젝트 일정 불러오기',
      group: 'schedule',
    },
    {
      key: 'project_data',
      title: '데이터 관리(프로젝트 자료실)',
      route: `/project-management/projects/${eqId}/data`,
      requiresAuth: true,
      waitMs: 2600,
      summary: '폴더 트리 + 업로드/코멘트 + 파일 목록 관리',
      group: 'data',
    },
    {
      key: 'data_hub',
      title: '데이터 허브',
      route: '/data-hub?q=pdf',
      requiresAuth: true,
      waitMs: 2400,
      summary: '문서 검색과 AI 질의응답',
      group: 'data',
    },
    {
      key: 'spec_placeholder',
      title: '사양 관리(플레이스홀더)',
      route: `/project-management/projects/${eqId}/spec`,
      requiresAuth: true,
      waitMs: 1600,
      summary: '사양 관리 화면은 차기 단계 구현 예정',
      group: 'project',
    },
    {
      key: 'parts_overview',
      title: '프로젝트 메인(파츠형)',
      route: `/project-management/projects/${partsId}`,
      requiresAuth: true,
      waitMs: 2400,
      summary: '파츠 납품형 프로젝트의 단계/안건/예산/자료 현황',
      group: 'scenario',
    },
    {
      key: 'as_overview',
      title: '프로젝트 메인(AS형)',
      route: `/project-management/projects/${asId}`,
      requiresAuth: true,
      waitMs: 2400,
      summary: 'AS형 프로젝트의 워런티 중심 운영 현황',
      group: 'scenario',
    },
    {
      key: 'as_schedule_management',
      title: '일정 관리(AS형)',
      route: `/project-management/projects/${asId}/schedule`,
      requiresAuth: true,
      waitMs: 2200,
      summary: 'AS 프로젝트의 일정 입력 제한/안내 처리',
      group: 'scenario',
    },
  ];
}

async function waitStable(page, waitMs) {
  try {
    await page.waitForLoadState('networkidle', { timeout: 15000 });
  } catch (error) {
    // continue
  }
  await page.waitForTimeout(waitMs);
}

async function login(page, baseUrl, email, password) {
  await page.goto(`${baseUrl}/login`, { waitUntil: 'domcontentloaded' });
  await page.fill('#email', email);
  await page.fill('#password', password);
  await Promise.all([
    page.waitForURL('**/home**', { timeout: 20000 }),
    page.getByRole('button', { name: '로그인' }).click(),
  ]);
  await waitStable(page, 1200);
}

async function main() {
  const baseUrl = resolveEnv('BASE_URL', 'http://synchub_frontend:3000');
  const outputDir = resolveEnv('OUTPUT_DIR', '/workspace/reports/executive/2026-02-19/screenshots');
  const contextPath = resolveEnv('CONTEXT_JSON', '/workspace/reports/executive/2026-02-19/context.json');
  const manifestPath = resolveEnv('MANIFEST_JSON', '/workspace/reports/executive/2026-02-19/screenshots/manifest.json');
  const loginEmail = resolveEnv('LOGIN_EMAIL', 'admin@example.com');
  const loginPassword = resolveEnv('LOGIN_PASSWORD', 'Admin1234!');

  const context = await readJson(contextPath);
  const plan = buildCapturePlan(context);

  await fs.mkdir(outputDir, { recursive: true });
  await fs.mkdir(path.dirname(manifestPath), { recursive: true });

  const browser = await chromium.launch({
    headless: true,
    args: ['--disable-dev-shm-usage'],
  });
  const page = await browser.newPage({
    viewport: { width: 1660, height: 930 },
    locale: 'ko-KR',
  });

  const captures = [];
  try {
    for (const item of plan.filter((entry) => !entry.requiresAuth)) {
      const url = `${baseUrl}${item.route}`;
      await page.goto(url, { waitUntil: 'domcontentloaded' });
      await waitStable(page, item.waitMs);
      const filePath = path.join(outputDir, `${item.key}.png`);
      await page.screenshot({ path: filePath, fullPage: false });
      captures.push({
        ...item,
        url,
        file: filePath,
      });
      console.log(`[capture] ${item.key} -> ${filePath}`);
    }

    await login(page, baseUrl, loginEmail, loginPassword);

    for (const item of plan.filter((entry) => entry.requiresAuth)) {
      const url = `${baseUrl}${item.route}`;
      await page.goto(url, { waitUntil: 'domcontentloaded' });
      await waitStable(page, item.waitMs);
      const filePath = path.join(outputDir, `${item.key}.png`);
      await page.screenshot({ path: filePath, fullPage: false });
      captures.push({
        ...item,
        url,
        file: filePath,
      });
      console.log(`[capture] ${item.key} -> ${filePath}`);
    }
  } finally {
    await browser.close();
  }

  const manifest = {
    generated_at: new Date().toISOString(),
    base_url: baseUrl,
    captures,
  };
  await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2), 'utf8');
  console.log(`[ok] manifest: ${manifestPath}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
