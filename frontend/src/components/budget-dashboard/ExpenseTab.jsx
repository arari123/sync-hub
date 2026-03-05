import React from 'react';
import { Wallet, CreditCard, PiggyBank, CheckCircle, AlertTriangle } from 'lucide-react';

const StatusBadge = ({ text, color }) => {
    const c = {
        green: 'bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-300 border-green-200 dark:border-green-800',
        red: 'bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-300 border-red-200 dark:border-red-800',
        yellow: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/50 dark:text-yellow-300 border-yellow-200 dark:border-yellow-800',
    };
    return <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-bold border ${c[color]}`}>{text}</span>;
};

const MFG_ITEMS = [
    { name: 'Operating Expenses (프로젝트 운영비)', qty: 1, budget: '500,000', actual: '300,000', variance: '+200,000', vColor: 'text-emerald-600', status: 'Safe', sColor: 'green' },
    { name: 'Printing (도서 인쇄비)', qty: 5, budget: '100,000', actual: '50,000', variance: '+50,000', vColor: 'text-emerald-600', status: 'Safe', sColor: 'green' },
    { name: 'Consumables (소모품비)', qty: 10, budget: '300,000', actual: '250,000', variance: '+50,000', vColor: 'text-emerald-600', status: 'Caution', sColor: 'yellow' },
    { name: 'Tool Costs (소모공구비)', qty: 2, budget: '200,000', actual: '150,000', variance: '+50,000', vColor: 'text-emerald-600', status: 'Safe', sColor: 'green' },
    { name: 'Travel (출장비)', qty: 4, budget: '800,000', actual: '850,000', variance: '-50,000', vColor: 'text-red-600 font-bold', status: 'Over', sColor: 'red' },
    { name: 'Accommodation (숙소비)', qty: 2, budget: '600,000', actual: '550,000', variance: '+50,000', vColor: 'text-emerald-600', status: 'Safe', sColor: 'green' },
    { name: 'Communication (통신비)', qty: 1, budget: '100,000', actual: '90,000', variance: '+10,000', vColor: 'text-emerald-600', status: 'Safe', sColor: 'green' },
    { name: 'Fees (지급수수료)', qty: 1, budget: '50,000', actual: '40,000', variance: '+10,000', vColor: 'text-emerald-600', status: 'Safe', sColor: 'green' },
    { name: 'Freight (운송비)', qty: 1, budget: '300,000', actual: '350,000', variance: '-50,000', vColor: 'text-red-600 font-bold', status: 'Over', sColor: 'red' },
    { name: 'Moving Fees (도비)', qty: 1, budget: '200,000', actual: '150,000', variance: '+50,000', vColor: 'text-emerald-600', status: 'Safe', sColor: 'green' },
    { name: 'Other Expenses 1/2 (기타 경비)', qty: 1, budget: '150,000', actual: '50,000', variance: '+100,000', vColor: 'text-emerald-600', status: 'Safe', sColor: 'green' },
];
const INST_ITEMS = [
    { name: 'Operating Expenses (프로젝트 운영비)', qty: 1, budget: '300,000', actual: '150,000', variance: '+150,000', vColor: 'text-emerald-600', status: 'Safe', sColor: 'green' },
    { name: 'Travel (출장비)', qty: 3, budget: '600,000', actual: '580,000', variance: '+20,000', vColor: 'text-emerald-600', status: 'Caution', sColor: 'yellow' },
    { name: 'Accommodation (숙소비)', qty: 3, budget: '900,000', actual: '920,000', variance: '-20,000', vColor: 'text-red-600 font-bold', status: 'Over', sColor: 'red' },
    { name: 'Other Expenses (기타)', qty: 1, budget: '200,000', actual: '100,000', variance: '+100,000', vColor: 'text-emerald-600', status: 'Safe', sColor: 'green' },
];
const OUT_ITEMS = [
    { name: 'Travel & Stay (출장/숙소)', qty: 1, budget: '2,000,000', actual: '1,200,000', variance: '+800,000', vColor: 'text-emerald-600', status: 'Safe', sColor: 'green' },
    { name: 'Misc Expenses (기타)', qty: 1, budget: '500,000', actual: '300,000', variance: '+200,000', vColor: 'text-emerald-600', status: 'Safe', sColor: 'green' },
];

const ExpenseRow = ({ d, showPhase, phaseLabel, phaseRows }) => (
    <tr>
        {showPhase && (
            <td className="px-2 py-3 text-center font-bold border-r border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 align-middle" rowSpan={phaseRows}>
                <div className="transform -rotate-90 whitespace-nowrap text-xs text-slate-400">{phaseLabel}</div>
            </td>
        )}
        <td className="px-4 py-2 border-r border-slate-200 dark:border-slate-700 font-medium">{d.name}</td>
        <td className="px-4 py-2 text-right border-r border-slate-200 dark:border-slate-700">{d.qty}</td>
        <td className="px-4 py-2 text-right border-r border-slate-200 dark:border-slate-700 font-mono text-slate-600 dark:text-slate-400">{d.budget}</td>
        <td className="px-4 py-2 text-right border-r border-slate-200 dark:border-slate-700 text-sky-500 font-medium font-mono">{d.actual}</td>
        <td className={`px-4 py-2 text-right border-r border-slate-200 dark:border-slate-700 font-mono ${d.vColor}`}>{d.variance}</td>
        <td className="px-4 py-2 text-center"><StatusBadge text={d.status} color={d.sColor} /></td>
    </tr>
);

const PhaseTotal = ({ label, bg, data }) => (
    <tr className={`${bg} text-white font-bold border-y-2`}>
        <td className="px-4 py-3 text-right border-r border-slate-600/30" colSpan={2}>{label}</td>
        <td className="px-4 py-3 text-right border-r border-slate-600/30">-</td>
        <td className="px-4 py-3 text-right border-r border-slate-600/30 font-mono">{data.budget}</td>
        <td className="px-4 py-3 text-right border-r border-slate-600/30 font-mono">{data.actual}</td>
        <td className={`px-4 py-3 text-right border-r border-slate-600/30 font-mono ${data.vNeg ? 'text-red-200' : 'text-emerald-300'}`}>{data.variance}</td>
        <td className="px-4 py-3 text-center text-xs uppercase text-white/90 font-bold tracking-wider bg-white/10">{data.status}</td>
    </tr>
);

export default function ExpenseTab() {
    return (
        <>
            {/* KPI Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                <div className="bg-white dark:bg-slate-800 p-6 rounded-xl shadow-sm border border-slate-100 dark:border-slate-700 relative overflow-hidden">
                    <div className="absolute top-0 right-0 w-24 h-24 bg-sky-50 dark:bg-sky-900/10 rounded-bl-full -mr-4 -mt-4" />
                    <div className="flex justify-between items-start z-10 relative">
                        <div><p className="text-xs font-semibold text-sky-600 dark:text-sky-400 uppercase tracking-wider mb-1">Total Expense Budget</p><h3 className="text-3xl font-bold text-slate-900 dark:text-white">₩ 12,500,000</h3></div>
                        <div className="p-2.5 bg-sky-100 dark:bg-sky-900/30 rounded-lg text-sky-600 dark:text-sky-400 shadow-sm"><Wallet className="w-5 h-5" /></div>
                    </div>
                    <div className="w-full bg-slate-100 dark:bg-slate-800 rounded-full h-1.5 mt-4"><div className="bg-sky-500 h-1.5 rounded-full" style={{ width: '100%' }} /></div>
                </div>
                <div className="bg-white dark:bg-slate-800 p-6 rounded-xl shadow-sm border border-slate-100 dark:border-slate-700 relative overflow-hidden">
                    <div className="absolute top-0 right-0 w-24 h-24 bg-amber-50 dark:bg-amber-900/10 rounded-bl-full -mr-4 -mt-4" />
                    <div className="flex justify-between items-start z-10 relative">
                        <div><p className="text-xs font-semibold text-amber-600 dark:text-amber-400 uppercase tracking-wider mb-1">Total Expense Spent</p><h3 className="text-3xl font-bold text-slate-900 dark:text-white">₩ 8,300,000</h3></div>
                        <div className="p-2.5 bg-amber-100 dark:bg-amber-900/30 rounded-lg text-amber-600 dark:text-amber-400 shadow-sm"><CreditCard className="w-5 h-5" /></div>
                    </div>
                    <div className="flex items-center justify-between text-xs mt-3 mb-2 z-10 relative"><span className="text-emerald-500 font-bold bg-emerald-50 dark:bg-emerald-900/20 px-1.5 py-0.5 rounded">66.4%</span><span className="text-slate-400">of budget</span></div>
                    <div className="w-full bg-slate-100 dark:bg-slate-800 rounded-full h-1.5"><div className="bg-amber-500 h-1.5 rounded-full" style={{ width: '66.4%' }} /></div>
                </div>
                <div className="bg-white dark:bg-slate-800 p-6 rounded-xl shadow-sm border border-slate-100 dark:border-slate-700 relative overflow-hidden">
                    <div className="absolute top-0 right-0 w-24 h-24 bg-teal-50 dark:bg-teal-900/10 rounded-bl-full -mr-4 -mt-4" />
                    <div className="flex justify-between items-start z-10 relative">
                        <div><p className="text-xs font-semibold text-teal-600 dark:text-teal-400 uppercase tracking-wider mb-1">Remaining Balance</p><h3 className="text-3xl font-bold text-emerald-500 dark:text-emerald-400">+ ₩ 4,200,000</h3></div>
                        <div className="p-2.5 bg-teal-100 dark:bg-teal-900/30 rounded-lg text-teal-600 dark:text-teal-400 shadow-sm"><PiggyBank className="w-5 h-5" /></div>
                    </div>
                    <div className="flex items-center gap-1.5 mt-4 text-xs text-emerald-500 dark:text-emerald-400 font-medium bg-emerald-50 dark:bg-emerald-900/20 self-start px-2 py-1 rounded-md border border-emerald-100 dark:border-emerald-900/30 w-fit">
                        <CheckCircle className="w-3.5 h-3.5" /> Within Budget
                    </div>
                </div>
            </div>

            {/* Table */}
            <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 overflow-hidden">
                <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-700 flex justify-between items-center">
                    <h2 className="text-sm font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wide flex items-center gap-2">
                        <span className="w-1 h-4 bg-sky-500 rounded-full" /> Expense Detail Breakdown
                    </h2>
                    <span className="text-xs font-semibold text-slate-500 bg-slate-100 dark:bg-slate-700 px-3 py-1.5 rounded-md border border-slate-200 dark:border-slate-600 shadow-sm">Unit: 1,000 KRW</span>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left border-collapse">
                        <thead className="text-xs text-slate-500 dark:text-slate-400 uppercase bg-slate-50 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700">
                            <tr>
                                <th className="px-4 py-3 font-semibold text-center border-r border-slate-200 dark:border-slate-700 w-16">Phase</th>
                                <th className="px-4 py-3 font-semibold text-left border-r border-slate-200 dark:border-slate-700">Type / Description</th>
                                <th className="px-4 py-3 font-semibold text-right border-r border-slate-200 dark:border-slate-700 w-24">Qty</th>
                                <th className="px-4 py-3 font-semibold text-right border-r border-slate-200 dark:border-slate-700 w-32">Budget</th>
                                <th className="px-4 py-3 font-semibold text-right border-r border-slate-200 dark:border-slate-700 w-32">Actual (Spent)</th>
                                <th className="px-4 py-3 font-semibold text-right border-r border-slate-200 dark:border-slate-700 w-32">Variance (Bal)</th>
                                <th className="px-4 py-3 font-semibold text-center w-28">Status</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-200 dark:divide-slate-700 text-slate-700 dark:text-slate-300">
                            {/* Internal Header */}
                            <tr className="bg-slate-50/50 dark:bg-slate-800/30"><td className="px-4 py-2 text-xs font-bold text-slate-500 uppercase tracking-wider border-b border-slate-200 dark:border-slate-700" colSpan={7}>📄 Internal Expenses (자체 경비)</td></tr>

                            {MFG_ITEMS.map((d, i) => <ExpenseRow key={`m${i}`} d={d} showPhase={i === 0} phaseLabel="MFG" phaseRows={MFG_ITEMS.length} />)}
                            <PhaseTotal label="TOTAL MANUFACTURING EXPENSE" bg="bg-blue-900" data={{ budget: '3,300,000', actual: '2,880,000', variance: '+420,000', status: 'Good' }} />

                            {INST_ITEMS.map((d, i) => <ExpenseRow key={`i${i}`} d={d} showPhase={i === 0} phaseLabel="INST" phaseRows={INST_ITEMS.length} />)}
                            <PhaseTotal label="TOTAL INSTALLATION EXPENSE" bg="bg-emerald-700" data={{ budget: '2,000,000', actual: '1,750,000', variance: '+250,000', status: 'Active' }} />

                            {/* Outsourced Header */}
                            <tr className="bg-slate-50/50 dark:bg-slate-800/30"><td className="px-4 py-2 text-xs font-bold text-slate-500 uppercase tracking-wider border-y border-slate-200 dark:border-slate-700" colSpan={7}>💼 Outsourced Personnel Expenses (외주 인원 경비)</td></tr>

                            {OUT_ITEMS.map((d, i) => <ExpenseRow key={`o${i}`} d={d} showPhase={i === 0} phaseLabel="OUT" phaseRows={OUT_ITEMS.length} />)}

                            {/* Grand Total */}
                            <tr className="bg-slate-950 text-white font-bold border-t-4 border-double border-slate-600">
                                <td className="px-4 py-4 text-center border-r border-slate-700 align-middle" colSpan={2}>
                                    TOTAL PROJECT EXPENSE REVIEW<br /><span className="text-[10px] font-normal opacity-70 tracking-wider">INTERNAL + OUTSOURCED</span>
                                </td>
                                <td className="px-4 py-4 text-right border-r border-slate-700 opacity-60">-</td>
                                <td className="px-4 py-4 text-right border-r border-slate-700 text-lg text-amber-300 font-mono">12,500,000</td>
                                <td className="px-4 py-4 text-right border-r border-slate-700 text-lg font-mono">8,300,000</td>
                                <td className="px-4 py-4 text-right border-r border-slate-700 text-amber-300 font-black text-lg font-mono">+4,200,000</td>
                                <td className="px-4 py-4 text-center">
                                    <div className="flex flex-col items-center gap-1.5"><span className="text-xs text-emerald-400 font-bold uppercase tracking-widest">Ongoing</span>
                                        <div className="w-full max-w-[5rem] bg-slate-700 rounded-full h-1.5 overflow-hidden"><div className="bg-emerald-500 h-full" style={{ width: '66%' }} /></div>
                                    </div>
                                </td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            </div>
        </>
    );
}
