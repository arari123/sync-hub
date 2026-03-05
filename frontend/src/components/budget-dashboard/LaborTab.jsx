import React from 'react';
import { Wallet, Activity, CircleDollarSign, AlertTriangle } from 'lucide-react';

const StatusBadge = ({ text, color }) => {
    const c = {
        green: 'bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-300 border-green-200 dark:border-green-800',
        red: 'bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-300 border-red-200 dark:border-red-800',
        emerald: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800',
        slate: 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-600',
    };
    return <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-bold border ${c[color]}`}>{text}</span>;
};

const INTERNAL_MFG = [
    { dept: 'PM (Project Mgmt)', bQty: 100, bCost: '3,500,000', aQty: 50, aCost: '1,750,000', variance: '+1,750,000', vColor: 'text-emerald-600', status: 'Safe', sColor: 'green' },
    { dept: 'QA Team', bQty: 100, bCost: '3,500,000', aQty: 92, aCost: '3,220,000', variance: '+280,000', vColor: 'text-emerald-600', status: 'Safe', sColor: 'green' },
    { dept: 'Design', bQty: 100, bCost: '3,500,000', aQty: 200, aCost: '7,000,000', variance: '-3,500,000', vColor: 'text-red-600 font-bold', status: 'Over', sColor: 'red' },
];
const INTERNAL_INST = [
    { dept: 'PM (Project Mgmt)', bQty: 50, bCost: '1,750,000', aQty: 50, aCost: '1,750,000', variance: '0', vColor: 'text-slate-400', status: 'On Track', sColor: 'emerald' },
    { dept: 'QA Team', bQty: 50, bCost: '1,750,000', aQty: 46, aCost: '1,610,000', variance: '+140,000', vColor: 'text-emerald-600', status: 'Safe', sColor: 'green' },
    { dept: 'Design', bQty: 50, bCost: '1,750,000', aQty: 110, aCost: '3,850,000', variance: '-2,100,000', vColor: 'text-red-600 font-bold', status: 'Critical', sColor: 'red' },
];
const EXT_MFG = [
    { dept: 'PM (External)', bQty: 100, bCost: '3,500,000' },
    { dept: 'Design (External)', bQty: 100, bCost: '3,500,000' },
    { dept: 'SW (External)', bQty: 100, bCost: '3,500,000' },
];
const EXT_INST = [
    { dept: 'PM (External)', bQty: 50, bCost: '1,750,000' },
    { dept: 'Design (External)', bQty: 50, bCost: '1,750,000' },
    { dept: 'SW (External)', bQty: 40, bCost: '1,400,000' },
];

const DataRow = ({ d, showPhase, phaseLabel, phaseRows }) => (
    <tr>
        {showPhase && (
            <td className="px-2 py-3 text-center font-bold border-r border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 align-middle" rowSpan={phaseRows}>
                <div className="transform -rotate-90 whitespace-nowrap text-xs text-slate-400">{phaseLabel}</div>
            </td>
        )}
        <td className="px-4 py-3 border-r border-slate-200 dark:border-slate-700 font-medium">{d.dept}</td>
        <td className="px-4 py-3 text-right border-r border-slate-200 dark:border-slate-700">{d.bQty}</td>
        <td className="px-4 py-3 text-right border-r border-slate-200 dark:border-slate-700 font-mono text-slate-600 dark:text-slate-400">{d.bCost}</td>
        <td className="px-4 py-3 text-right border-r border-slate-200 dark:border-slate-700 text-sky-500 font-medium">{d.aQty ?? '-'}</td>
        <td className="px-4 py-3 text-right border-r border-slate-200 dark:border-slate-700 text-sky-500 font-medium font-mono">{d.aCost ?? '-'}</td>
        <td className={`px-4 py-3 text-right border-r border-slate-200 dark:border-slate-700 font-mono ${d.vColor ?? 'text-slate-400'}`}>{d.variance ?? '-'}</td>
        <td className="px-4 py-3 text-center"><StatusBadge text={d.status ?? 'Pending'} color={d.sColor ?? 'slate'} /></td>
    </tr>
);

const PhaseTotal = ({ label, bg, data }) => (
    <tr className={`${bg} text-white font-bold border-y-2`}>
        <td className="px-4 py-3 text-right border-r border-slate-600/30" colSpan={2}>{label}</td>
        <td className="px-4 py-3 text-right border-r border-slate-600/30">{data.qty}</td>
        <td className="px-4 py-3 text-right border-r border-slate-600/30 font-mono">{data.bCost}</td>
        <td className="px-4 py-3 text-right border-r border-slate-600/30">{data.aQty}</td>
        <td className="px-4 py-3 text-right border-r border-slate-600/30 font-mono">{data.aCost}</td>
        <td className={`px-4 py-3 text-right border-r border-slate-600/30 font-mono ${data.vNeg ? 'text-red-200' : 'text-emerald-300'}`}>{data.variance}</td>
        <td className="px-4 py-3 text-center text-xs uppercase text-white/90 font-bold tracking-wider bg-white/10">{data.status}</td>
    </tr>
);

export default function LaborTab() {
    return (
        <>
            {/* KPI Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                <div className="bg-white dark:bg-slate-800 p-6 rounded-xl shadow-sm border border-slate-100 dark:border-slate-700 relative overflow-hidden">
                    <div className="absolute top-0 right-0 w-24 h-24 bg-sky-50 dark:bg-sky-900/10 rounded-bl-full -mr-4 -mt-4" />
                    <div className="flex justify-between items-start z-10 relative">
                        <div><p className="text-xs font-semibold text-sky-600 dark:text-sky-400 uppercase tracking-wider mb-1">Total Labor Budget</p><h3 className="text-3xl font-bold text-slate-900 dark:text-white">₩ 19,600,000</h3></div>
                        <div className="p-2.5 bg-sky-100 dark:bg-sky-900/30 rounded-lg text-sky-600 dark:text-sky-400 shadow-sm"><Wallet className="w-5 h-5" /></div>
                    </div>
                    <div className="w-full bg-slate-100 dark:bg-slate-800 rounded-full h-1.5 mt-4"><div className="bg-sky-500 h-1.5 rounded-full" style={{ width: '100%' }} /></div>
                </div>
                <div className="bg-white dark:bg-slate-800 p-6 rounded-xl shadow-sm border border-slate-100 dark:border-slate-700 relative overflow-hidden">
                    <div className="absolute top-0 right-0 w-24 h-24 bg-amber-50 dark:bg-amber-900/10 rounded-bl-full -mr-4 -mt-4" />
                    <div className="flex justify-between items-start z-10 relative">
                        <div><p className="text-xs font-semibold text-amber-600 dark:text-amber-400 uppercase tracking-wider mb-1">Total Labor Spent</p><h3 className="text-3xl font-bold text-slate-900 dark:text-white">₩ 23,030,000</h3></div>
                        <div className="p-2.5 bg-amber-100 dark:bg-amber-900/30 rounded-lg text-amber-600 dark:text-amber-400 shadow-sm"><Activity className="w-5 h-5" /></div>
                    </div>
                    <div className="flex items-center justify-between text-xs mt-3 mb-2 z-10 relative"><span className="text-red-500 font-bold bg-red-50 dark:bg-red-900/20 px-1.5 py-0.5 rounded">117.5%</span><span className="text-slate-400">of budget</span></div>
                    <div className="w-full bg-slate-100 dark:bg-slate-800 rounded-full h-1.5"><div className="bg-amber-500 h-1.5 rounded-full" style={{ width: '100%' }} /></div>
                </div>
                <div className="bg-white dark:bg-slate-800 p-6 rounded-xl shadow-sm border border-slate-100 dark:border-slate-700 relative overflow-hidden">
                    <div className="absolute top-0 right-0 w-24 h-24 bg-teal-50 dark:bg-teal-900/10 rounded-bl-full -mr-4 -mt-4" />
                    <div className="flex justify-between items-start z-10 relative">
                        <div><p className="text-xs font-semibold text-teal-600 dark:text-teal-400 uppercase tracking-wider mb-1">Remaining Balance</p><h3 className="text-3xl font-bold text-red-500 dark:text-red-400">- ₩ 3,430,000</h3></div>
                        <div className="p-2.5 bg-teal-100 dark:bg-teal-900/30 rounded-lg text-teal-600 dark:text-teal-400 shadow-sm"><CircleDollarSign className="w-5 h-5" /></div>
                    </div>
                    <div className="flex items-center gap-1.5 mt-4 text-xs text-red-500 dark:text-red-400 font-medium bg-red-50 dark:bg-red-900/20 self-start px-2 py-1 rounded-md border border-red-100 dark:border-red-900/30 w-fit">
                        <AlertTriangle className="w-3.5 h-3.5" /> Over Budget
                    </div>
                </div>
            </div>

            {/* Table */}
            <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 overflow-hidden">
                <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-700 flex justify-between items-center">
                    <h2 className="text-sm font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wide flex items-center gap-2">
                        <span className="w-1 h-4 bg-sky-500 rounded-full" /> Labor Cost Detail Breakdown
                    </h2>
                    <span className="text-xs font-semibold text-slate-500 bg-slate-100 dark:bg-slate-700 px-3 py-1.5 rounded-md border border-slate-200 dark:border-slate-600 shadow-sm">Unit: 1,000 KRW</span>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left border-collapse">
                        <thead className="text-xs text-slate-500 dark:text-slate-400 uppercase bg-slate-50 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700">
                            <tr>
                                <th className="px-4 py-3 font-semibold text-center border-r border-slate-200 dark:border-slate-700 w-16">Phase</th>
                                <th className="px-4 py-3 font-semibold text-left border-r border-slate-200 dark:border-slate-700">Department / Type</th>
                                <th className="px-4 py-3 font-semibold text-right border-r border-slate-200 dark:border-slate-700 w-24">Budget Qty</th>
                                <th className="px-4 py-3 font-semibold text-right border-r border-slate-200 dark:border-slate-700 w-32">Budget Cost</th>
                                <th className="px-4 py-3 font-semibold text-right border-r border-slate-200 dark:border-slate-700 w-24">Actual Qty</th>
                                <th className="px-4 py-3 font-semibold text-right border-r border-slate-200 dark:border-slate-700 w-32">Actual Cost</th>
                                <th className="px-4 py-3 font-semibold text-right border-r border-slate-200 dark:border-slate-700 w-32">Variance</th>
                                <th className="px-4 py-3 font-semibold text-center w-28">Status</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-200 dark:divide-slate-700 text-slate-700 dark:text-slate-300">
                            {/* Internal Personnel Header */}
                            <tr className="bg-slate-50/50 dark:bg-slate-800/30"><td className="px-4 py-2 text-xs font-bold text-slate-500 uppercase tracking-wider border-b border-slate-200 dark:border-slate-700" colSpan={8}>👤 Internal Personnel (자체 인원)</td></tr>

                            {INTERNAL_MFG.map((d, i) => <DataRow key={`im${i}`} d={d} showPhase={i === 0} phaseLabel="MFG" phaseRows={3} />)}
                            <PhaseTotal label="TOTAL MANUFACTURING LABOR COST" bg="bg-blue-900" data={{ qty: 300, bCost: '10,500,000', aQty: 342, aCost: '11,970,000', variance: '-1,470,000', vNeg: true, status: 'In Progress' }} />

                            {INTERNAL_INST.map((d, i) => <DataRow key={`ii${i}`} d={d} showPhase={i === 0} phaseLabel="INST" phaseRows={3} />)}
                            <PhaseTotal label="TOTAL INSTALLATION LABOR COST" bg="bg-emerald-700" data={{ qty: 150, bCost: '5,250,000', aQty: 206, aCost: '7,210,000', variance: '-1,960,000', vNeg: true, status: 'Active' }} />

                            {/* Outsourced Header */}
                            <tr className="bg-slate-50/50 dark:bg-slate-800/30"><td className="px-4 py-2 text-xs font-bold text-slate-500 uppercase tracking-wider border-y border-slate-200 dark:border-slate-700" colSpan={8}>💼 Outsourced Personnel (외주 인원)</td></tr>

                            {EXT_MFG.map((d, i) => <DataRow key={`em${i}`} d={d} showPhase={i === 0} phaseLabel="MFG" phaseRows={3} />)}
                            <PhaseTotal label="TOTAL MFG OUTSOURCED" bg="bg-blue-900" data={{ qty: 300, bCost: '10,500,000', aQty: 0, aCost: '0', variance: '+10,500,000', status: 'On Hold' }} />

                            {EXT_INST.map((d, i) => <DataRow key={`ei${i}`} d={d} showPhase={i === 0} phaseLabel="INST" phaseRows={3} />)}
                            <PhaseTotal label="TOTAL INST OUTSOURCED" bg="bg-emerald-700" data={{ qty: 140, bCost: '4,900,000', aQty: 0, aCost: '0', variance: '+4,900,000', status: 'Upcoming' }} />

                            {/* Grand Total */}
                            <tr className="bg-slate-950 text-white font-bold border-t-4 border-double border-slate-600">
                                <td className="px-4 py-4 text-center border-r border-slate-700 align-middle" colSpan={2}>
                                    TOTAL PROJECT LABOR BUDGET REVIEW<br /><span className="text-[10px] font-normal opacity-70 tracking-wider">INTERNAL + OUTSOURCED (MFG &amp; INST)</span>
                                </td>
                                <td className="px-4 py-4 text-right border-r border-slate-700 opacity-60">-</td>
                                <td className="px-4 py-4 text-right border-r border-slate-700 text-lg text-amber-300 font-mono">31,150,000</td>
                                <td className="px-4 py-4 text-right border-r border-slate-700 opacity-60">-</td>
                                <td className="px-4 py-4 text-right border-r border-slate-700 text-lg font-mono">19,180,000</td>
                                <td className="px-4 py-4 text-right border-r border-slate-700 text-amber-300 font-black text-lg font-mono">+11,970,000</td>
                                <td className="px-4 py-4 text-center">
                                    <div className="flex flex-col items-center gap-1.5"><span className="text-xs text-red-400 font-bold uppercase tracking-widest">Incomplete</span>
                                        <div className="w-full max-w-[5rem] bg-slate-700 rounded-full h-1.5 overflow-hidden"><div className="bg-red-500 h-full" style={{ width: '61%' }} /></div>
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
