import React, { useState } from 'react';

function formatAmount(value) {
    const number = Number(value || 0);
    return `${number.toLocaleString('ko-KR')}원`;
}

const BudgetSidebar = ({
    aggregation = {},
    summary = null,
    modeLabel = '예산',
    section = 'material',
    materialUnitLibrary = [],
}) => {
    const [selectedUnitKey, setSelectedUnitKey] = useState('');
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
    const materialTotal = Number(materialSummary.fabrication_total || 0) + Number(materialSummary.installation_total || 0);
    const laborTotal = Number(laborSummary.fabrication_total || 0) + Number(laborSummary.installation_total || 0);
    const expenseTotal = Number(expenseSummary.fabrication_total || 0) + Number(expenseSummary.installation_total || 0);
    const grandTotal = materialTotal + laborTotal + expenseTotal;

    return (
        <aside className="w-72 border-r bg-slate-50/50 flex flex-col shrink-0">
            <div className="p-6 border-b bg-white">
                <h2 className="text-xs font-black text-slate-400 uppercase tracking-widest">Cost Summary</h2>
                <div className="mt-4 p-4 rounded-2xl bg-slate-900 text-white shadow-lg shadow-slate-200">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">{modeLabel} Total</p>
                    <p className="text-xl font-black">{formatAmount(grandTotal)}</p>
                    <div className="mt-3 space-y-1.5 text-[11px]">
                        <SummaryRow label="재료비" value={materialTotal} />
                        <SummaryRow label="인건비" value={laborTotal} />
                        <SummaryRow label="경비" value={expenseTotal} />
                    </div>
                </div>
            </div>

            {section === 'material' && (
                <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
                    <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
                        <div className="px-3 py-2.5 border-b bg-slate-50">
                            <p className="text-[11px] font-black text-slate-700">유닛 템플릿</p>
                            <p className="text-[10px] text-slate-500 mt-0.5">유닛을 선택 후 드래그해 재료비 표에 놓으면 파츠가 자동 입력됩니다.</p>
                        </div>
                        <div className="p-2 space-y-1.5">
                            {materialUnitLibrary.map((unit) => {
                                const isSelected = selectedUnitKey === unit.key;
                                return (
                                    <button
                                        key={unit.key}
                                        type="button"
                                        draggable
                                        onClick={() => setSelectedUnitKey(unit.key)}
                                        onDragStart={(event) => {
                                            event.dataTransfer.effectAllowed = 'copy';
                                            event.dataTransfer.setData('application/json', JSON.stringify({
                                                kind: 'material_unit_template',
                                                unit_key: unit.key,
                                                unit_name: unit.unit_name,
                                                rows: unit.items,
                                            }));
                                        }}
                                        className={`w-full text-left rounded-lg border px-2.5 py-2 transition-all ${
                                            isSelected
                                                ? 'border-sky-300 bg-sky-50'
                                                : 'border-slate-200 bg-white hover:bg-slate-50'
                                        }`}
                                    >
                                        <div className="flex items-center justify-between gap-2">
                                            <span className="text-[11px] font-black text-slate-900 truncate">{unit.unit_name}</span>
                                            <span className="text-[10px] font-black text-slate-700">{formatAmount(unit.total || 0)}</span>
                                        </div>
                                        <p className="mt-0.5 text-[10px] text-slate-500 truncate">
                                            설비: {unit.equipment_name} · 단계: {unit.phase_label} · 파츠 {unit.items?.length || 0}개
                                        </p>
                                    </button>
                                );
                            })}
                            {!materialUnitLibrary.length && (
                                <div className="py-8 text-center">
                                    <p className="text-[11px] font-semibold text-slate-400">유닛 데이터가 없습니다.</p>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </aside>
    );
};

const SummaryRow = ({ label, value }) => (
    <div className="flex items-center justify-between">
        <span className="text-slate-300">{label}</span>
        <span className="font-bold text-white">{formatAmount(value)}</span>
    </div>
);

export default BudgetSidebar;
