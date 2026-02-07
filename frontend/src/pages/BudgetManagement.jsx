import React from 'react';
import { CheckCircle2, Clock3, FileSpreadsheet, GitBranch, Wallet } from 'lucide-react';

const ROADMAP_ITEMS = [
    { label: 'Phase 1', value: '버전 수명주기 + 예산 요약 대시보드' },
    { label: 'Phase 2', value: '재료비/인건비/경비 상세 입력 및 계산 엔진' },
    { label: 'Phase 3', value: '엑셀 내보내기/재업로드 및 검증 리포트' },
    { label: 'Phase 4', value: 'PDF 내보내기 + 운영/감사 로그 고도화' },
];

const BudgetManagement = () => {
    return (
        <div className="space-y-6">
            <section className="rounded-xl border bg-card p-6 shadow-sm">
                <div className="flex items-start justify-between gap-4">
                    <div className="space-y-2">
                        <h1 className="text-2xl font-bold">프로젝트 예산관리</h1>
                        <p className="text-sm text-muted-foreground">
                            설비 제작/설치 프로젝트의 예산 버전 관리와 변경 이력을 추적하기 위한 기능입니다.
                        </p>
                    </div>
                    <span className="inline-flex items-center gap-1 rounded-full border border-border bg-muted px-3 py-1 text-xs font-medium text-muted-foreground">
                        <Clock3 className="h-3.5 w-3.5" />
                        MVP 준비 중
                    </span>
                </div>
            </section>

            <section className="grid grid-cols-1 gap-4 md:grid-cols-3">
                <article className="rounded-xl border bg-card p-5 shadow-sm">
                    <div className="mb-2 flex items-center gap-2 text-primary">
                        <GitBranch className="h-4 w-4" />
                        <h2 className="font-semibold">버전 관리</h2>
                    </div>
                    <p className="text-sm text-muted-foreground">
                        단계별 확정(`검토/진행/종료`)과 리비전 사유를 관리해 변경 이력을 추적합니다.
                    </p>
                </article>

                <article className="rounded-xl border bg-card p-5 shadow-sm">
                    <div className="mb-2 flex items-center gap-2 text-primary">
                        <Wallet className="h-4 w-4" />
                        <h2 className="font-semibold">예산 구조</h2>
                    </div>
                    <p className="text-sm text-muted-foreground">
                        재료비/인건비/경비를 제작/설치 축으로 분리해 설비별 비중과 합계를 제공합니다.
                    </p>
                </article>

                <article className="rounded-xl border bg-card p-5 shadow-sm">
                    <div className="mb-2 flex items-center gap-2 text-primary">
                        <FileSpreadsheet className="h-4 w-4" />
                        <h2 className="font-semibold">엑셀 왕복</h2>
                    </div>
                    <p className="text-sm text-muted-foreground">
                        수식이 포함된 템플릿 다운로드와 수정본 재업로드를 지원해 현업 입력 흐름을 유지합니다.
                    </p>
                </article>
            </section>

            <section className="rounded-xl border bg-card p-6 shadow-sm">
                <h2 className="mb-4 text-base font-semibold">구현 로드맵</h2>
                <div className="space-y-3">
                    {ROADMAP_ITEMS.map((item) => (
                        <div key={item.label} className="flex items-start gap-3 rounded-lg border bg-muted/30 p-3">
                            <CheckCircle2 className="mt-0.5 h-4 w-4 text-primary" />
                            <div>
                                <p className="text-xs font-semibold text-muted-foreground">{item.label}</p>
                                <p className="text-sm">{item.value}</p>
                            </div>
                        </div>
                    ))}
                </div>
            </section>
        </div>
    );
};

export default BudgetManagement;
