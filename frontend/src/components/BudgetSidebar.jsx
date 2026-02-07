import React from 'react';

const BudgetSidebar = ({ aggregation = {}, modeLabel = '예산' }) => {
    const { total = 0, equipments = [] } = aggregation;

    return (
        <aside className="w-80 border-r bg-slate-50/50 flex flex-col shrink-0">
            <div className="p-6 border-b bg-white">
                <h2 className="text-xs font-black text-slate-400 uppercase tracking-widest">Cost Summary</h2>
                <div className="mt-4 p-4 rounded-2xl bg-slate-900 text-white shadow-lg shadow-slate-200">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">{modeLabel} Total</p>
                    <p className="text-xl font-black">{total.toLocaleString()}원</p>
                </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
                <div className="space-y-4">
                    {equipments.map((eq, eqIdx) => (
                        <div key={eqIdx} className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
                            <div className="flex items-center justify-between px-3 py-2.5 bg-slate-50 border-b border-slate-100">
                                <span className="text-[11px] font-black text-slate-900 truncate max-w-[1600px] uppercase tracking-tight">{eq.name || '미지정 설비'}</span>
                                <span className="text-[11px] font-black text-primary">{(eq.total || 0).toLocaleString()}</span>
                            </div>
                            <div className="p-2 space-y-1 bg-white">
                                {eq.units.map((unit, uIdx) => (
                                    <div key={uIdx} className="flex items-center justify-between px-2 py-1.5 text-[11px] font-bold text-slate-500 hover:bg-slate-50 rounded-lg transition-all group">
                                        <span className="truncate pr-2">{unit.name || '미지정 유닛'}</span>
                                        <span className="text-slate-400 group-hover:text-slate-900 transition-colors">{(unit.total || 0).toLocaleString()}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    ))}
                    {!equipments.length && (
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

export default BudgetSidebar;
