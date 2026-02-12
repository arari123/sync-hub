import React from 'react';
import { Wallet, BarChart3, Scale, ChevronDown, Package, Users, Receipt } from 'lucide-react';

const KPI_CARDS = [
    { label: 'Total Project Budget', value: '₩ 850,000', sub: 'Material + Labor + Expenses', icon: Wallet, color: 'blue', extra: 'Initial Cap: ₩ 800k (+6.25% Adjust)' },
    { label: 'Total Expenditure', value: '₩ 412,500', sub: 'Actual Spent to Date', icon: BarChart3, color: 'rose', bar: { pct: 48.5 } },
    { label: 'Total Variance (Remaining)', value: '₩ 437,500', sub: 'Available Funds', icon: Scale, color: 'emerald', badge: { text: 'On Budget', extra: '51.5% Remaining' } },
];

const MINI_CARDS = [
    { label: 'Material', allocated: '450,000', actual: '231,000', balance: '219,000', pct: 51, color: 'blue' },
    { label: 'Labor', allocated: '300,000', actual: '145,000', balance: '155,000', pct: 48, color: 'purple' },
    { label: 'Expenses', allocated: '100,000', actual: '36,500', balance: '63,500', pct: 36, color: 'orange' },
];

const TABLE_DATA = [
    {
        category: 'Material Cost (Total)', icon: Package, color: 'blue', budget: '450,000', actual: '231,000', variance: '219,000', pct: 51,
        children: [
            { name: 'Manufacturing (MFG)', budget: '350,000', actual: '174,000', variance: '176,000', pct: 49, status: 'Normal', statusColor: 'green' },
            { name: 'Installation (INST)', budget: '100,000', actual: '57,000', variance: '43,000', pct: 57, status: 'Warning', statusColor: 'yellow' },
        ]
    },
    {
        category: 'Labor Cost (Total)', icon: Users, color: 'purple', budget: '300,000', actual: '145,000', variance: '155,000', pct: 48,
        children: [
            { name: 'Manufacturing (MFG)', budget: '200,000', actual: '95,000', variance: '105,000', pct: 47, status: 'Normal', statusColor: 'green' },
            { name: 'Installation (INST)', budget: '100,000', actual: '50,000', variance: '50,000', pct: 50, status: 'Normal', statusColor: 'green' },
        ]
    },
    {
        category: 'Expenses (Total)', icon: Receipt, color: 'orange', budget: '100,000', actual: '36,500', variance: '63,500', pct: 36,
        children: [
            { name: 'Manufacturing (MFG)', budget: '40,000', actual: '12,000', variance: '28,000', pct: 30, status: 'Under', statusColor: 'blue' },
            { name: 'Installation (INST)', budget: '60,000', actual: '24,500', variance: '35,500', pct: 41, status: 'Normal', statusColor: 'green' },
        ]
    },
];

const StatusBadge = ({ text, color }) => {
    const colors = {
        green: 'bg-green-50 text-green-700 dark:bg-green-900/30 dark:text-green-300 border-green-100 dark:border-green-800/50',
        yellow: 'bg-yellow-50 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300 border-yellow-100 dark:border-yellow-800/50',
        blue: 'bg-blue-50 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300 border-blue-100 dark:border-blue-800/50',
    };
    return <span className={`px-2 py-1 text-xs font-medium rounded border ${colors[color]}`}>{text}</span>;
};

export default function SummaryTab() {
    return (
        <>
            {/* KPI Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                {KPI_CARDS.map((card, i) => {
                    const Icon = card.icon;
                    return (
                        <div key={i} className="bg-white dark:bg-slate-800 p-6 rounded-xl shadow-sm border border-slate-100 dark:border-slate-700 relative overflow-hidden">
                            <div className={`absolute right-0 top-0 h-full w-1 bg-${card.color}-500`} />
                            <div className="flex justify-between items-start">
                                <div>
                                    <p className="text-sm font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">{card.label}</p>
                                    <h3 className="text-3xl font-bold text-slate-900 dark:text-white mt-2">{card.value}</h3>
                                    <p className="text-xs text-slate-400 mt-1">{card.sub}</p>
                                </div>
                                <div className={`p-3 bg-${card.color}-50 dark:bg-${card.color}-900/30 rounded-lg text-${card.color}-600 dark:text-${card.color}-400`}>
                                    <Icon className="w-5 h-5" />
                                </div>
                            </div>
                            <div className="mt-4 flex items-center text-sm text-slate-500 dark:text-slate-400">
                                {card.extra && <span className="text-slate-600 dark:text-slate-300 font-medium mr-2">{card.extra}</span>}
                                {card.bar && (
                                    <>
                                        <div className="w-full bg-slate-200 dark:bg-slate-700 rounded-full h-2 mr-2">
                                            <div className={`bg-${card.color}-500 h-2 rounded-full`} style={{ width: `${card.bar.pct}%` }} />
                                        </div>
                                        <span className="whitespace-nowrap font-semibold">{card.bar.pct}%</span>
                                    </>
                                )}
                                {card.badge && (
                                    <>
                                        <span className="bg-emerald-100 dark:bg-emerald-900/50 text-emerald-700 dark:text-emerald-300 px-2 py-0.5 rounded text-xs font-semibold">{card.badge.text}</span>
                                        <span className="ml-2">{card.badge.extra}</span>
                                    </>
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>

            {/* Mini Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                {MINI_CARDS.map((card, i) => (
                    <div key={i} className="bg-white dark:bg-slate-800 p-5 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm">
                        <div className="flex justify-between items-center mb-4">
                            <h4 className="font-bold text-slate-800 dark:text-slate-200 flex items-center gap-2">
                                <span className={`w-2 h-2 rounded-full bg-${card.color}-500`} /> {card.label}
                            </h4>
                            <span className="text-xs text-slate-400">Allocated: {card.allocated}</span>
                        </div>
                        <div className="flex justify-between items-end mb-2">
                            <div>
                                <span className="text-xs text-slate-500 dark:text-slate-400 block">Actual</span>
                                <span className="text-xl font-bold text-slate-900 dark:text-white">{card.actual}</span>
                            </div>
                            <div className="text-right">
                                <span className="text-xs text-slate-500 dark:text-slate-400 block">Balance</span>
                                <span className="text-sm font-semibold text-emerald-600">{card.balance}</span>
                            </div>
                        </div>
                        <div className="w-full bg-slate-100 dark:bg-slate-800 rounded-full h-1.5 mb-1">
                            <div className={`bg-${card.color}-500 h-1.5 rounded-full`} style={{ width: `${card.pct}%` }} />
                        </div>
                        <div className="text-right text-[10px] text-slate-400">{card.pct}% Utilized</div>
                    </div>
                ))}
            </div>

            {/* Cost Breakdown Table */}
            <div className="bg-white dark:bg-slate-800 rounded-xl shadow-lg border border-slate-200 dark:border-slate-700 overflow-hidden mb-8">
                <div className="bg-slate-50 dark:bg-slate-800/50 p-4 border-b border-slate-200 dark:border-slate-700 flex justify-between items-center">
                    <h2 className="text-lg font-bold text-slate-800 dark:text-slate-100">Integrated Cost Breakdown</h2>
                    <span className="text-xs text-slate-500 dark:text-slate-400 px-2 py-1 bg-slate-100 dark:bg-slate-700 rounded">View Mode: Phased Detail</span>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left border-collapse">
                        <thead className="text-xs text-slate-500 dark:text-slate-400 uppercase bg-slate-100 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700">
                            <tr>
                                <th className="px-6 py-4 font-semibold w-1/4">Cost Category / Phase</th>
                                <th className="px-6 py-4 font-semibold text-right">Allocated Budget</th>
                                <th className="px-6 py-4 font-semibold text-right">Actual Cost</th>
                                <th className="px-6 py-4 font-semibold text-right">Variance (Balance)</th>
                                <th className="px-6 py-4 font-semibold text-center w-36">Performance</th>
                                <th className="px-6 py-4 font-semibold text-center w-24">Status</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-200 dark:divide-slate-700 text-slate-700 dark:text-slate-300">
                            {TABLE_DATA.map((row, i) => {
                                const Icon = row.icon;
                                return (
                                    <React.Fragment key={i}>
                                        {/* Category Summary Row */}
                                        <tr className="bg-slate-50 dark:bg-slate-800/50 font-medium">
                                            <td className="px-6 py-3">
                                                <div className="flex items-center">
                                                    <ChevronDown className="w-3 h-3 mr-2 text-slate-400" />
                                                    <div className={`p-1.5 rounded bg-${row.color}-100 dark:bg-${row.color}-900/30 text-${row.color}-600 mr-2`}>
                                                        <Icon className="w-4 h-4" />
                                                    </div>
                                                    <span className="text-slate-900 dark:text-white font-bold">{row.category}</span>
                                                </div>
                                            </td>
                                            <td className="px-6 py-3 text-right text-slate-900 dark:text-white">{row.budget}</td>
                                            <td className="px-6 py-3 text-right text-slate-900 dark:text-white">{row.actual}</td>
                                            <td className="px-6 py-3 text-right text-emerald-600">{row.variance}</td>
                                            <td className="px-6 py-3 align-middle">
                                                <div className="w-full bg-slate-200 dark:bg-slate-700 rounded-full h-1.5">
                                                    <div className={`bg-${row.color}-500 h-1.5 rounded-full`} style={{ width: `${row.pct}%` }} />
                                                </div>
                                            </td>
                                            <td className="px-6 py-3 text-center">
                                                <span className="px-2 py-0.5 text-[10px] font-bold rounded-full bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-300 uppercase tracking-wide">Summary</span>
                                            </td>
                                        </tr>
                                        {/* Child Phase Rows */}
                                        {row.children.map((child, j) => (
                                            <tr key={j} className={`bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/30 transition border-l-4 border-l-${row.color}-500/20 dark:border-l-${row.color}-500/10`}>
                                                <td className="px-6 py-3 pl-16">
                                                    <span className="text-slate-600 dark:text-slate-400 text-sm">{child.name}</span>
                                                </td>
                                                <td className="px-6 py-3 text-right text-slate-600 dark:text-slate-400">{child.budget}</td>
                                                <td className="px-6 py-3 text-right text-slate-800 dark:text-slate-200">{child.actual}</td>
                                                <td className="px-6 py-3 text-right font-medium text-emerald-600">{child.variance}</td>
                                                <td className="px-6 py-3 align-middle">
                                                    <div className="flex items-center gap-2">
                                                        <span className="text-[10px] w-8 text-right text-slate-500">{child.pct}%</span>
                                                        <div className="flex-1 bg-slate-100 dark:bg-slate-800 rounded-full h-1">
                                                            <div className={`bg-${row.color}-400 h-1 rounded-full`} style={{ width: `${child.pct}%` }} />
                                                        </div>
                                                    </div>
                                                </td>
                                                <td className="px-6 py-3 text-center">
                                                    <StatusBadge text={child.status} color={child.statusColor} />
                                                </td>
                                            </tr>
                                        ))}
                                    </React.Fragment>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Grand Total Banner */}
            <div className="bg-blue-900 dark:bg-blue-950 text-white rounded-xl shadow-lg p-6 flex flex-col md:flex-row justify-between items-center border border-blue-800">
                <div className="mb-4 md:mb-0">
                    <h3 className="text-xl font-bold tracking-wide">TOTAL INTEGRATED PROJECT COST REVIEW</h3>
                    <p className="text-blue-200 text-sm mt-1">Consolidated Grand Total (Material + Labor + Expenses)</p>
                </div>
                <div className="flex items-center gap-8">
                    <div className="text-right hidden md:block">
                        <div className="text-xs text-blue-200 uppercase tracking-wider mb-1">Total Variance</div>
                        <div className="text-2xl font-bold text-emerald-400">+ 437,500</div>
                    </div>
                    <div className="h-10 w-px bg-blue-700 hidden md:block" />
                    <div className="text-right">
                        <div className="text-xs text-blue-200 uppercase tracking-wider mb-1">Total Expenditure</div>
                        <div className="text-3xl font-bold text-amber-200">₩ 412,500</div>
                    </div>
                </div>
            </div>
        </>
    );
}
