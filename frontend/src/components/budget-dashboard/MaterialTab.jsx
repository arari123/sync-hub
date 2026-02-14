import React from 'react';
import { Wallet, PieChart, Coins } from 'lucide-react';

const MFG_MECHANISM = [
    { name: 'Base Frame Structure', spec: 'AL Profile 4040, CNC Machined', qty: 2, unit: '12,000', total: '24,000', remark: 'In stock' },
    { name: 'Conveyor Belt Assembly', spec: 'W:300mm L:2000mm Anti-static', qty: 1, unit: '45,000', total: '45,000', remark: 'Vendor A' },
];
const MFG_CONTROL = [
    { name: 'PLC Main Unit', spec: 'Mitsubishi FX5U Series', qty: 1, unit: '85,000', total: '85,000', remark: 'Lead time: 4w', over: true },
    { name: 'Sensor Pack', spec: 'Photoelectric + Proximity', qty: 4, unit: '5,000', total: '20,000', remark: '', safe: true },
];
const INST_MECHANISM = [
    { name: 'Mounting Brackets', spec: 'SUS304 Laser Cut', qty: 10, unit: '1,500', total: '15,000', remark: '' },
    { name: 'Safety Covers', spec: 'Acrylic 5T', qty: 4, unit: '5,000', total: '20,000', remark: '' },
];
const INST_CONTROL = [
    { name: 'Wiring Harness', spec: 'Custom Loom', qty: 1, unit: '12,000', total: '12,000', remark: '' },
    { name: 'Terminal Blocks', spec: 'DIN Rail Mount', qty: 20, unit: '500', total: '10,000', remark: '' },
];

const KpiCard = ({ label, value, icon: Icon, color, children }) => (
    <div className="bg-white dark:bg-slate-800 p-6 rounded-xl shadow-sm border border-slate-100 dark:border-slate-700 relative overflow-hidden">
        <div className={`absolute right-0 top-0 h-full w-1 bg-${color}-500`} />
        <div className="flex justify-between items-start">
            <div>
                <p className="text-sm font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">{label}</p>
                <h3 className="text-3xl font-bold text-slate-900 dark:text-white mt-2">{value}</h3>
            </div>
            <div className={`p-3 bg-${color}-50 dark:bg-${color}-900/30 rounded-lg text-${color}-600 dark:text-${color}-400`}>
                <Icon className="w-5 h-5" />
            </div>
        </div>
        <div className="mt-4 flex items-center text-sm text-slate-500 dark:text-slate-400">{children}</div>
    </div>
);

const ItemRow = ({ item, borderTop }) => (
    <tr className={`bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition ${borderTop ? 'border-t-4 border-slate-100 dark:border-slate-800' : ''}`}>
        <td className="px-4 py-3">{item.name}</td>
        <td className="px-4 py-3 text-xs text-slate-500 dark:text-slate-400 hidden md:table-cell">{item.spec}</td>
        <td className="px-4 py-3 text-right">{item.qty}</td>
        <td className="px-4 py-3 text-right text-slate-500 dark:text-slate-400">{item.unit}</td>
        <td className={`px-4 py-3 text-right font-medium ${item.over ? 'text-red-500 dark:text-red-400' : item.safe ? 'text-emerald-600 dark:text-emerald-400' : ''}`}>{item.total}</td>
        <td className="px-4 py-3 text-xs text-slate-400 hidden lg:table-cell">{item.remark}</td>
    </tr>
);

const SubtotalRow = ({ label, value, color }) => (
    <tr className={`bg-${color}-50 dark:bg-${color}-900/20 font-semibold text-slate-900 dark:text-slate-100`}>
        <td className={`px-4 py-2 text-right text-xs uppercase tracking-wider text-${color}-700 dark:text-${color}-300`} colSpan={4}>{label}</td>
        <td className={`px-4 py-2 text-right text-${color}-700 dark:text-${color}-300`}>{value}</td>
        <td className="px-4 py-2 hidden lg:table-cell" />
    </tr>
);

export default function MaterialTab() {
    return (
        <>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                <KpiCard label="Total Budget" value="₩ 450,000" icon={Wallet} color="blue">
                    <span className="text-emerald-500 font-medium flex items-center gap-1 mr-2">↑ 5.2%</span>
                    <span>vs last estimation</span>
                </KpiCard>
                <KpiCard label="Total Spent" value="₩ 125,500" icon={PieChart} color="emerald">
                    <div className="w-full bg-slate-200 dark:bg-slate-700 rounded-full h-2 mr-2">
                        <div className="bg-emerald-500 h-2 rounded-full" style={{ width: '28%' }} />
                    </div>
                    <span className="whitespace-nowrap">28% Utilized</span>
                </KpiCard>
                <KpiCard label="Remaining Balance" value="₩ 324,500" icon={Coins} color="amber">
                    <span className="bg-green-100 dark:bg-green-900/50 text-green-700 dark:text-green-300 px-2 py-0.5 rounded text-xs font-semibold">Healthy</span>
                    <span className="ml-2">Budget on track</span>
                </KpiCard>
            </div>

            <div className="bg-white dark:bg-slate-800 rounded-xl shadow-lg border border-slate-200 dark:border-slate-700 overflow-hidden">
                <div className="bg-slate-50 dark:bg-slate-800/50 p-4 border-b border-slate-200 dark:border-slate-700 flex justify-between items-center">
                    <h2 className="text-lg font-bold text-slate-800 dark:text-slate-100">Material Cost Breakdown</h2>
                    <span className="text-xs text-slate-500 dark:text-slate-400 px-2 py-1 bg-slate-100 dark:bg-slate-700 rounded">Unit: 1,000 KRW</span>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left">
                        <thead className="text-xs text-slate-500 dark:text-slate-400 uppercase bg-slate-100 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700">
                            <tr>
                                <th className="px-4 py-3 font-semibold text-center w-24">Phase</th>
                                <th className="px-4 py-3 font-semibold text-center w-24">Type</th>
                                <th className="px-4 py-3 font-semibold">Unit Name</th>
                                <th className="px-4 py-3 font-semibold hidden md:table-cell">SPEC &amp; Notes</th>
                                <th className="px-4 py-3 font-semibold text-right w-16">Qty</th>
                                <th className="px-4 py-3 font-semibold text-right w-24">Unit Cost</th>
                                <th className="px-4 py-3 font-semibold text-right w-32">Total (A)</th>
                                <th className="px-4 py-3 font-semibold hidden lg:table-cell">Remarks</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-200 dark:divide-slate-700 text-slate-700 dark:text-slate-300">
                            {/* Header */}
                            <tr className="bg-slate-50 dark:bg-slate-800 font-bold text-slate-900 dark:text-white">
                                <td className="px-4 py-3 text-center tracking-wide" colSpan={8}>TOTAL MATERIAL COST SUMMARY</td>
                            </tr>

                            {/* MFG Section */}
                            <tr className="bg-white dark:bg-slate-800">
                                <td className="px-2 py-4 border-r border-slate-200 dark:border-slate-700 font-bold text-slate-900 dark:text-white text-center align-middle bg-white dark:bg-slate-800" rowSpan={7}>
                                    <span className="bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-100 px-2 py-1 rounded text-xs font-bold">MFG</span>
                                </td>
                                <td className="px-2 py-4 border-r border-slate-200 dark:border-slate-700 font-medium text-slate-600 dark:text-slate-300 text-center align-middle" rowSpan={3}>Mechanism</td>
                                <td className="px-4 py-3">{MFG_MECHANISM[0].name}</td>
                                <td className="px-4 py-3 text-xs text-slate-500 hidden md:table-cell">{MFG_MECHANISM[0].spec}</td>
                                <td className="px-4 py-3 text-right">{MFG_MECHANISM[0].qty}</td>
                                <td className="px-4 py-3 text-right text-slate-500">{MFG_MECHANISM[0].unit}</td>
                                <td className="px-4 py-3 text-right font-medium">{MFG_MECHANISM[0].total}</td>
                                <td className="px-4 py-3 text-xs text-slate-400 hidden lg:table-cell">{MFG_MECHANISM[0].remark}</td>
                            </tr>
                            <ItemRow item={MFG_MECHANISM[1]} />
                            <SubtotalRow label="Mechanism Subtotal" value="69,000" color="blue" />

                            <tr className="bg-white dark:bg-slate-800">
                                <td className="px-2 py-4 border-r border-slate-200 dark:border-slate-700 font-medium text-slate-600 dark:text-slate-300 text-center align-middle" rowSpan={3}>Control</td>
                                <td className="px-4 py-3">{MFG_CONTROL[0].name}</td>
                                <td className="px-4 py-3 text-xs text-slate-500 hidden md:table-cell">{MFG_CONTROL[0].spec}</td>
                                <td className="px-4 py-3 text-right">{MFG_CONTROL[0].qty}</td>
                                <td className="px-4 py-3 text-right text-slate-500">{MFG_CONTROL[0].unit}</td>
                                <td className="px-4 py-3 text-right font-medium text-red-500">85,000 ⚠</td>
                                <td className="px-4 py-3 text-xs text-slate-400 hidden lg:table-cell">{MFG_CONTROL[0].remark}</td>
                            </tr>
                            <ItemRow item={MFG_CONTROL[1]} />
                            <SubtotalRow label="Control Subtotal" value="105,000" color="blue" />

                            {/* MFG Total */}
                            <tr className="bg-blue-900 text-white">
                                <td className="px-4 py-3 text-right font-bold uppercase text-sm tracking-wide" colSpan={6}>Total Manufacturing Material Cost</td>
                                <td className="px-4 py-3 text-right font-bold text-lg">174,000</td>
                                <td className="px-4 py-3 hidden lg:table-cell" />
                            </tr>

                            {/* INST Section */}
                            <tr className="bg-white dark:bg-slate-800">
                                <td className="px-2 py-4 border-r border-slate-200 dark:border-slate-700 font-bold text-slate-900 dark:text-white text-center align-middle bg-white dark:bg-slate-800 border-t-4 border-slate-100 dark:border-slate-800" rowSpan={7}>
                                    <span className="bg-emerald-100 dark:bg-emerald-900 text-emerald-800 dark:text-emerald-100 px-2 py-1 rounded text-xs font-bold">INST</span>
                                </td>
                                <td className="px-2 py-4 border-r border-slate-200 dark:border-slate-700 font-medium text-slate-600 dark:text-slate-300 text-center align-middle border-t-4 border-slate-100 dark:border-slate-800" rowSpan={3}>Mechanism</td>
                                <td className="px-4 py-3 border-t-4 border-slate-100 dark:border-slate-800">{INST_MECHANISM[0].name}</td>
                                <td className="px-4 py-3 text-xs text-slate-500 hidden md:table-cell border-t-4 border-slate-100 dark:border-slate-800">{INST_MECHANISM[0].spec}</td>
                                <td className="px-4 py-3 text-right border-t-4 border-slate-100 dark:border-slate-800">{INST_MECHANISM[0].qty}</td>
                                <td className="px-4 py-3 text-right text-slate-500 border-t-4 border-slate-100 dark:border-slate-800">{INST_MECHANISM[0].unit}</td>
                                <td className="px-4 py-3 text-right font-medium border-t-4 border-slate-100 dark:border-slate-800">{INST_MECHANISM[0].total}</td>
                                <td className="px-4 py-3 text-xs text-slate-400 hidden lg:table-cell border-t-4 border-slate-100 dark:border-slate-800" />
                            </tr>
                            <ItemRow item={INST_MECHANISM[1]} />
                            <SubtotalRow label="Mechanism Subtotal" value="35,000" color="emerald" />

                            <tr className="bg-white dark:bg-slate-800">
                                <td className="px-2 py-4 border-r border-slate-200 dark:border-slate-700 font-medium text-slate-600 dark:text-slate-300 text-center align-middle" rowSpan={3}>Control</td>
                                <td className="px-4 py-3">{INST_CONTROL[0].name}</td>
                                <td className="px-4 py-3 text-xs text-slate-500 hidden md:table-cell">{INST_CONTROL[0].spec}</td>
                                <td className="px-4 py-3 text-right">{INST_CONTROL[0].qty}</td>
                                <td className="px-4 py-3 text-right text-slate-500">{INST_CONTROL[0].unit}</td>
                                <td className="px-4 py-3 text-right font-medium">{INST_CONTROL[0].total}</td>
                                <td className="px-4 py-3 text-xs text-slate-400 hidden lg:table-cell" />
                            </tr>
                            <ItemRow item={INST_CONTROL[1]} />
                            <SubtotalRow label="Control Subtotal" value="22,000" color="emerald" />

                            {/* INST Total */}
                            <tr className="bg-emerald-700 text-white">
                                <td className="px-4 py-3 text-right font-bold uppercase text-sm tracking-wide" colSpan={6}>Total Installation Material Cost</td>
                                <td className="px-4 py-3 text-right font-bold text-lg">57,000</td>
                                <td className="px-4 py-3 hidden lg:table-cell" />
                            </tr>
                        </tbody>
                        <tfoot>
                            <tr className="bg-slate-900 dark:bg-black text-white">
                                <td className="px-6 py-5 text-right font-bold uppercase text-base tracking-wider" colSpan={6}>
                                    <span className="text-slate-400 text-sm font-normal mr-2">Grand Total</span>
                                    Total Project Material Budget Review
                                </td>
                                <td className="px-4 py-5 text-right font-bold text-xl text-yellow-400">231,000</td>
                                <td className="px-4 py-5 hidden lg:table-cell" />
                            </tr>
                        </tfoot>
                    </table>
                </div>
            </div>
        </>
    );
}
