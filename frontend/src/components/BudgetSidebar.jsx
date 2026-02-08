import React from 'react';

function formatAmount(value) {
    const number = Number(value || 0);
    return `${number.toLocaleString('ko-KR')}원`;
}

const BudgetSidebar = ({ aggregation = {}, summary = null, modeLabel = '예산' }) => {
    const { total = 0, equipments = [] } = aggregation;
    const sectionSummary = summary && typeof summary === 'object'
        ? summary
        : {
            material: { fabrication_total: total, installation_total: 0, equipments },
            labor: { fabrication_total: 0, installation_total: 0 },
            expense: { fabrication_total: 0, installation_total: 0 },
        };
    const materialSummary = sectionSummary.material || {};
    const laborSummary = sectionSummary.labor || {};
    const expenseSummary = sectionSummary.expense || {};
    const grandTotal = (
        Number(materialSummary.fabrication_total || 0)
        + Number(materialSummary.installation_total || 0)
        + Number(laborSummary.fabrication_total || 0)
        + Number(laborSummary.installation_total || 0)
        + Number(expenseSummary.fabrication_total || 0)
        + Number(expenseSummary.installation_total || 0)
    );

    return (
        <aside className="w-72 border-r bg-slate-50/50 flex flex-col shrink-0">
            <div className="p-6 border-b bg-white">
                <h2 className="text-xs font-black text-slate-400 uppercase tracking-widest">Cost Summary</h2>
                <div className="mt-4 p-4 rounded-2xl bg-slate-900 text-white shadow-lg shadow-slate-200">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">{modeLabel} Total</p>
                    <p className="text-xl font-black">{formatAmount(grandTotal)}</p>
                </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
                <div className="space-y-4">
                    <SectionSummaryCard
                        title="재료비"
                        fabricationTotal={materialSummary.fabrication_total}
                        installationTotal={materialSummary.installation_total}
                    />
                    <SectionSummaryCard
                        title="인건비"
                        fabricationTotal={laborSummary.fabrication_total}
                        installationTotal={laborSummary.installation_total}
                    />
                    <SectionSummaryCard
                        title="경비"
                        fabricationTotal={expenseSummary.fabrication_total}
                        installationTotal={expenseSummary.installation_total}
                    />

                    {(materialSummary.equipments || []).map((eq, eqIdx) => (
                        <div key={eqIdx} className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
                            <div className="flex items-center justify-between px-3 py-2.5 bg-slate-50 border-b border-slate-100">
                                <span className="text-[11px] font-black text-slate-900 truncate max-w-[1600px] uppercase tracking-tight">{eq.name || '미지정 설비'}</span>
                                <span className="text-[11px] font-black text-primary">{formatAmount(eq.total || 0)}</span>
                            </div>
                            <div className="p-2 space-y-1 bg-white">
                                {(eq.units || []).map((unit, uIdx) => (
                                    <div key={uIdx} className="flex items-center justify-between px-2 py-1.5 text-[11px] font-bold text-slate-500 hover:bg-slate-50 rounded-lg transition-all group">
                                        <div className="min-w-0 truncate pr-2">
                                            <span className="truncate">{unit.name || '미지정 유닛'}</span>
                                            <p className="text-[10px] text-slate-400">
                                                제작 {formatAmount(unit.fabrication_total || 0)} / 설치 {formatAmount(unit.installation_total || 0)}
                                            </p>
                                        </div>
                                        <span className="text-slate-400 group-hover:text-slate-900 transition-colors">{formatAmount(unit.total || 0)}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    ))}
                    {!(materialSummary.equipments || []).length && (
                        <div className="py-12 text-center">
                            <p className="text-xs font-bold text-slate-400 italic">No data aggregated.</p>
                        </div>
                    )}
                </div>
            </div>

            <div className="p-4 border-t bg-white/50">
                <div className="rounded-xl bg-amber-50 border border-amber-100 p-3">
                    <p className="text-[10px] font-black text-amber-600 uppercase mb-1">Notice</p>
                    <p className="text-[11px] font-medium text-amber-700 leading-tight">
                        {modeLabel} 입력 후 저장해야 모니터링에 반영됩니다.
                    </p>
                </div>
            </div>
        </aside>
    );
};

const SectionSummaryCard = ({ title, fabricationTotal = 0, installationTotal = 0 }) => (
    <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
        <p className="text-[11px] font-black text-slate-700 mb-2">{title}</p>
        <div className="space-y-1 text-[11px] font-semibold">
            <div className="flex items-center justify-between">
                <span className="text-slate-500">제작</span>
                <span>{formatAmount(fabricationTotal)}</span>
            </div>
            <div className="flex items-center justify-between">
                <span className="text-slate-500">설치</span>
                <span>{formatAmount(installationTotal)}</span>
            </div>
        </div>
    </div>
);

export default BudgetSidebar;
