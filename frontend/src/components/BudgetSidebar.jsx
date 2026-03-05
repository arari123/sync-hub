import React, { useEffect, useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, Minus, Plus } from 'lucide-react';

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
    onTreeContextAction,
    hasCopiedUnit = false,
    showSummary = true,
}) => {
    const [collapsedByKey, setCollapsedByKey] = useState({});
    const [contextMenuState, setContextMenuState] = useState(null);
    const [draggedUnitNode, setDraggedUnitNode] = useState(null);
    const [dropTargetKey, setDropTargetKey] = useState('');
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
    const collapsibleNodeKeys = useMemo(() => {
        const keys = [];
        const walk = (nodes) => {
            (nodes || []).forEach((item) => {
                if (Array.isArray(item?.children) && item.children.length > 0) {
                    keys.push(item.key);
                    walk(item.children);
                }
            });
        };
        walk(treeItems);
        return keys;
    }, [treeItems]);
    const collapseAll = () => {
        const next = {};
        collapsibleNodeKeys.forEach((key) => {
            next[key] = true;
        });
        setCollapsedByKey(next);
    };
    const expandAll = () => {
        setCollapsedByKey({});
    };
    const toggleNodeCollapse = (key) => {
        setCollapsedByKey((prev) => ({
            ...prev,
            [key]: !prev[key],
        }));
    };
    useEffect(() => {
        const closeMenu = () => {
            setContextMenuState(null);
        };
        window.addEventListener('click', closeMenu);
        window.addEventListener('scroll', closeMenu, true);
        return () => {
            window.removeEventListener('click', closeMenu);
            window.removeEventListener('scroll', closeMenu, true);
        };
    }, []);
    const handleNodeContextMenu = (event, node) => {
        if (section !== 'material') return;
        const nodeType = String(node?.nodeType || '');
        if (nodeType !== 'unit' && nodeType !== 'phase') return;
        event.preventDefault();
        event.stopPropagation();
        setContextMenuState({
            x: event.clientX,
            y: event.clientY,
            node,
        });
    };
    const runContextAction = (action) => {
        if (!contextMenuState?.node) return;
        onTreeContextAction?.(action, contextMenuState.node);
        setContextMenuState(null);
    };
    const handleNodeDragStart = (event, node) => {
        if (section !== 'material') return;
        if (String(node?.nodeType || '') !== 'unit') return;
        setDraggedUnitNode(node);
        event.dataTransfer.effectAllowed = 'move';
        try {
            event.dataTransfer.setData('text/plain', node?.key || '');
        } catch (_err) {
            // no-op: 일부 브라우저는 setData 제한이 있습니다.
        }
    };
    const handleNodeDragOver = (event, node) => {
        if (section !== 'material') return;
        if (!draggedUnitNode) return;
        if (String(node?.nodeType || '') !== 'phase') return;
        event.preventDefault();
        event.dataTransfer.dropEffect = 'move';
        setDropTargetKey(String(node?.key || ''));
    };
    const handleNodeDrop = (event, node) => {
        if (section !== 'material') return;
        if (!draggedUnitNode) return;
        if (String(node?.nodeType || '') !== 'phase') return;
        event.preventDefault();
        onTreeContextAction?.('move', {
            sourceNode: draggedUnitNode,
            targetNode: node,
        });
        setDropTargetKey('');
        setDraggedUnitNode(null);
    };
    const handleNodeDragEnd = () => {
        setDropTargetKey('');
        setDraggedUnitNode(null);
    };

    return (
        <aside className="w-72 border-r bg-slate-50/50 flex flex-col shrink-0">
            {showSummary && (
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
            )}

            <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
                <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
                    <div className="px-3 py-2.5 border-b bg-slate-50">
                        <div className="flex items-center justify-between gap-2">
                            <p className="text-[11px] font-black text-slate-700">입력 트리</p>
                            <div className="flex items-center gap-1">
                                <button
                                    type="button"
                                    onClick={collapseAll}
                                    className="h-6 w-6 inline-flex items-center justify-center rounded border border-slate-300 bg-white text-slate-600 hover:bg-slate-100"
                                    title="모두 접기"
                                    aria-label="모두 접기"
                                >
                                    <Minus size={12} />
                                </button>
                                <button
                                    type="button"
                                    onClick={expandAll}
                                    className="h-6 w-6 inline-flex items-center justify-center rounded border border-slate-300 bg-white text-slate-600 hover:bg-slate-100"
                                    title="모두 펼치기"
                                    aria-label="모두 펼치기"
                                >
                                    <Plus size={12} />
                                </button>
                            </div>
                        </div>
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
                                collapsedByKey={collapsedByKey}
                                onToggleNodeCollapse={toggleNodeCollapse}
                                onNodeContextMenu={handleNodeContextMenu}
                                onNodeDragStart={handleNodeDragStart}
                                onNodeDragOver={handleNodeDragOver}
                                onNodeDrop={handleNodeDrop}
                                onNodeDragEnd={handleNodeDragEnd}
                                dropTargetKey={dropTargetKey}
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
            {contextMenuState && (
                <div
                    className="fixed z-50 min-w-[120px] rounded-md border border-slate-200 bg-white p-1 shadow-xl"
                    style={{
                        left: contextMenuState.x,
                        top: contextMenuState.y,
                    }}
                    onClick={(event) => event.stopPropagation()}
                >
                    {String(contextMenuState?.node?.nodeType || '') === 'unit' && (
                        <>
                            <ContextMenuButton label="복사" onClick={() => runContextAction('copy')} />
                            <ContextMenuButton label="잘라내기" onClick={() => runContextAction('cut')} />
                            <ContextMenuButton label="삭제" onClick={() => runContextAction('delete')} danger />
                        </>
                    )}
                    {String(contextMenuState?.node?.nodeType || '') === 'phase' && (
                        <ContextMenuButton
                            label="붙여넣기"
                            onClick={() => runContextAction('paste')}
                            disabled={!hasCopiedUnit}
                        />
                    )}
                </div>
            )}
        </aside>
    );
};

const TreeNode = ({
    node,
    hasParent = false,
    activeTreeKey,
    onSelectTreeNode,
    collapsedByKey,
    onToggleNodeCollapse,
    onNodeContextMenu,
    onNodeDragStart,
    onNodeDragOver,
    onNodeDrop,
    onNodeDragEnd,
    dropTargetKey,
}) => {
    const isActive = activeTreeKey === node.key;
    const isActivePath = !isActive
        && typeof activeTreeKey === 'string'
        && activeTreeKey.startsWith(`${node.key}::`);
    const hasChildren = Array.isArray(node.children) && node.children.length > 0;
    const isCollapsed = hasChildren && Boolean(collapsedByKey?.[node.key]);
    const handleNodeClick = () => {
        onSelectTreeNode?.(node);
        if (hasChildren) {
            onToggleNodeCollapse?.(node.key);
        }
    };
    const nodeType = String(node?.nodeType || '');
    const isDraggableUnit = nodeType === 'unit';
    const isPhaseDropTarget = nodeType === 'phase' && dropTargetKey === node.key;
    return (
        <div>
            <div className="relative">
                <div
                    role="button"
                    tabIndex={0}
                    draggable={isDraggableUnit}
                    onDragStart={(event) => onNodeDragStart?.(event, node)}
                    onDragOver={(event) => onNodeDragOver?.(event, node)}
                    onDrop={(event) => onNodeDrop?.(event, node)}
                    onDragEnd={onNodeDragEnd}
                    onClick={handleNodeClick}
                    onContextMenu={(event) => onNodeContextMenu?.(event, node)}
                    onKeyDown={(event) => {
                        if (event.key !== 'Enter' && event.key !== ' ') return;
                        event.preventDefault();
                        handleNodeClick();
                    }}
                    className={`relative w-full rounded-md border px-2 py-1.5 text-left transition-all cursor-pointer ${
                        isPhaseDropTarget
                            ? 'border-emerald-400 bg-emerald-50 text-emerald-900 ring-1 ring-emerald-200'
                            : isActive
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
                        <div className="flex min-w-0 items-center gap-1.5">
                            {hasChildren ? (
                                <button
                                    type="button"
                                    onClick={(event) => {
                                        event.stopPropagation();
                                        onToggleNodeCollapse?.(node.key);
                                    }}
                                    className="h-4 w-4 shrink-0 inline-flex items-center justify-center rounded border border-slate-300 bg-white text-slate-500 hover:bg-slate-100"
                                    aria-label={isCollapsed ? '펼치기' : '접기'}
                                >
                                    {isCollapsed ? <ChevronRight size={10} /> : <ChevronDown size={10} />}
                                </button>
                            ) : (
                                <span className="h-4 w-4 shrink-0" />
                            )}
                            <span className="truncate text-[11px] font-black">{node.label}</span>
                        </div>
                        {Number.isFinite(node.count) && (
                            <span className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-black ${
                                isActive ? 'bg-sky-100 text-sky-700' : 'bg-slate-100 text-slate-500'
                            }`}
                            >
                                {node.count}
                            </span>
                        )}
                    </div>
                </div>
            </div>
            {hasChildren && !isCollapsed && (
                <div className="mt-1 ml-4 pl-3 border-l border-slate-200 space-y-1">
                    {node.children.map((child) => (
                        <TreeNode
                            key={child.key}
                            node={child}
                            hasParent
                            activeTreeKey={activeTreeKey}
                            onSelectTreeNode={onSelectTreeNode}
                            collapsedByKey={collapsedByKey}
                            onToggleNodeCollapse={onToggleNodeCollapse}
                            onNodeContextMenu={onNodeContextMenu}
                            onNodeDragStart={onNodeDragStart}
                            onNodeDragOver={onNodeDragOver}
                            onNodeDrop={onNodeDrop}
                            onNodeDragEnd={onNodeDragEnd}
                            dropTargetKey={dropTargetKey}
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

const ContextMenuButton = ({ label, onClick, disabled = false, danger = false }) => (
    <button
        type="button"
        disabled={disabled}
        onClick={onClick}
        className={`flex h-7 w-full items-center rounded px-2 text-[11px] font-semibold transition-colors ${
            disabled
                ? 'cursor-not-allowed text-slate-300'
                : danger
                    ? 'text-rose-600 hover:bg-rose-50'
                    : 'text-slate-700 hover:bg-slate-100'
        }`}
    >
        {label}
    </button>
);

export default BudgetSidebar;
