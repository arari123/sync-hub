import React from 'react';

function formatAmount(value) {
    const number = Number(value || 0);
    return `${number.toLocaleString('ko-KR')}원`;
}

const BudgetSidebar = ({
    aggregation = {},
    summary = null,
    modeLabel = '예산',
    section = 'material',
    treeItems = [],
    activeTreeKey = '',
    onSelectTreeNode,
}) => {
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
    const treeGuide = section === 'material'
        ? '설비 > 제작/설치 > 유닛'
        : '설비 > 제작/설치';

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

            <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
                <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
                    <div className="px-3 py-2.5 border-b bg-slate-50">
                        <p className="text-[11px] font-black text-slate-700">입력 트리</p>
                        <p className="text-[10px] text-slate-500 mt-0.5">{treeGuide}</p>
                    </div>
                    <div className="p-2 space-y-1">
                        {treeItems.map((item) => (
                            <TreeNode
                                key={item.key}
                                node={item}
                                hasParent={false}
                                activeTreeKey={activeTreeKey}
                                onSelectTreeNode={onSelectTreeNode}
                            />
                        ))}
                        {!treeItems.length && (
                            <div className="py-8 text-center">
                                <p className="text-[11px] font-semibold text-slate-400">표시할 범위가 없습니다.</p>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </aside>
    );
};

const TreeNode = ({
    node,
    hasParent = false,
    activeTreeKey,
    onSelectTreeNode,
}) => {
    const isActive = activeTreeKey === node.key;
    const isActivePath = !isActive
        && typeof activeTreeKey === 'string'
        && activeTreeKey.startsWith(`${node.key}::`);
    const hasChildren = Array.isArray(node.children) && node.children.length > 0;
    return (
        <div>
            <div className="relative">
                <button
                    type="button"
                    onClick={() => onSelectTreeNode?.(node)}
                    className={`relative w-full rounded-md border px-2 py-1.5 text-left transition-all ${
                        isActive
                            ? 'border-sky-400 bg-sky-50 text-sky-900 shadow-sm ring-1 ring-sky-200'
                            : isActivePath
                                ? 'border-slate-300 bg-slate-50 text-slate-900'
                                : 'border-transparent bg-white text-slate-700 hover:border-slate-200 hover:bg-slate-50'
                    }`}
                >
                    {hasParent && (
                        <>
                            <span className="pointer-events-none absolute -left-3 top-1/2 h-px w-3 -translate-y-1/2 bg-slate-300" />
                            <span className="pointer-events-none absolute -left-0.5 top-1/2 h-1.5 w-1.5 -translate-y-1/2 rounded-full bg-slate-300" />
                        </>
                    )}
                    <div className="flex items-center justify-between gap-2">
                        <span className="truncate text-[11px] font-black">{node.label}</span>
                        {Number.isFinite(node.count) && (
                            <span className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-black ${
                                isActive ? 'bg-sky-100 text-sky-700' : 'bg-slate-100 text-slate-500'
                            }`}
                            >
                                {node.count}
                            </span>
                        )}
                    </div>
                </button>
            </div>
            {hasChildren && (
                <div className="mt-1 ml-4 pl-3 border-l border-slate-200 space-y-1">
                    {node.children.map((child) => (
                        <TreeNode
                            key={child.key}
                            node={child}
                            hasParent
                            activeTreeKey={activeTreeKey}
                            onSelectTreeNode={onSelectTreeNode}
                        />
                    ))}
                </div>
            )}
        </div>
    );
};

const SummaryRow = ({ label, value }) => (
    <div className="flex items-center justify-between">
        <span className="text-slate-300">{label}</span>
        <span className="font-bold text-white">{formatAmount(value)}</span>
    </div>
);

export default BudgetSidebar;
