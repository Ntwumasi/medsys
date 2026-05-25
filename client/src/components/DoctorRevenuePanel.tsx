import React, { useEffect, useState } from 'react';
import apiClient from '../api/client';

// Reusable Doctor Revenue report. Mounted on the admin Dashboard's Revenue
// tab and on the accountant dashboard. Clicking a doctor row opens a
// drill-down modal that lists every line item billed for that doctor in
// the date range (modeled on the Physician Production sheet the clinic
// uses on paper). A "Print / Save PDF" button opens a print window so
// either view can be saved as PDF.

interface DoctorRevenueRow {
  provider_id: number;
  doctor_name: string;
  doctor_clinic: string | null;
  by_category: Record<string, number>;
  total: number;
  invoice_count: number;
}

interface RevenueResponse {
  doctors: DoctorRevenueRow[];
  categories: string[];
  totals: { grand_total: number; by_category: Record<string, number> };
  start_date: string;
  end_date: string;
}

interface LineItem {
  category: string;
  description: string;
  line_count: number;
  quantity: number;
  total: number;
}

interface LinesResponse {
  provider_id: number;
  doctor_name: string;
  doctor_clinic: string | null;
  start_date: string;
  end_date: string;
  lines: LineItem[];
  totals: { grand_total: number; by_category: Record<string, number> };
}

const fmtGHS = (n: number): string =>
  'GHS ' + n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// Categories that are billed under the doctor's name but represent services
// performed by other departments (lab tech runs the test, pharmacist dispenses,
// receptionist registers, etc). On the *physician copy* of the production
// report — what the doctor themselves keeps for their records — these are
// stripped out so it reflects only the doctor's personal output.
// 'medication' is the canonical category for dispensed prescriptions (set by
// ordersController.completePharmacyOrder + billingService). 'pharmacy' is
// kept defensively in case a future code path uses it.
const AUXILIARY_CATEGORIES = new Set(['lab', 'imaging', 'medication', 'pharmacy', 'registration']);
const isAuxiliary = (category: string): boolean =>
  AUXILIARY_CATEGORIES.has((category || '').toLowerCase());

const DoctorRevenuePanel: React.FC = () => {
  // Default to current calendar month
  const today = new Date();
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().slice(0, 10);
  const monthEnd = new Date(today.getFullYear(), today.getMonth() + 1, 0).toISOString().slice(0, 10);

  const [start, setStart] = useState(monthStart);
  const [end, setEnd] = useState(monthEnd);
  const [data, setData] = useState<RevenueResponse | null>(null);
  const [loading, setLoading] = useState(false);

  // Drill-down state
  const [drillDoctor, setDrillDoctor] = useState<DoctorRevenueRow | null>(null);
  const [drillData, setDrillData] = useState<LinesResponse | null>(null);
  const [drillLoading, setDrillLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const res = await apiClient.get('/admin/reports/doctor-revenue', {
        params: { start, end },
      });
      setData(res.data);
    } catch (err) {
      console.error('Error loading doctor revenue:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const openDrill = async (doc: DoctorRevenueRow) => {
    setDrillDoctor(doc);
    setDrillData(null);
    setDrillLoading(true);
    try {
      const res = await apiClient.get('/admin/reports/doctor-revenue/lines', {
        params: { provider_id: doc.provider_id, start, end },
      });
      setDrillData(res.data);
    } catch (err) {
      console.error('Error loading doctor revenue line items:', err);
    } finally {
      setDrillLoading(false);
    }
  };

  const closeDrill = () => {
    setDrillDoctor(null);
    setDrillData(null);
  };

  const printSummary = () => {
    if (!data) return;
    const html = `
      <h1>Doctor Revenue Report</h1>
      <p class="meta">Period: <strong>${data.start_date}</strong> to <strong>${data.end_date}</strong></p>
      <p class="meta">Generated: ${new Date().toLocaleString()}</p>
      <table>
        <thead>
          <tr>
            <th>Doctor</th>
            <th>Clinic</th>
            ${data.categories.map(c => `<th class="r cap">${c}</th>`).join('')}
            <th class="r">Total</th>
          </tr>
        </thead>
        <tbody>
          ${data.doctors.map(d => `
            <tr>
              <td>${d.doctor_name}</td>
              <td>${d.doctor_clinic || '—'}</td>
              ${data.categories.map(c => `<td class="r mono">${d.by_category[c] ? d.by_category[c].toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—'}</td>`).join('')}
              <td class="r mono bold">${d.total.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
            </tr>`).join('')}
        </tbody>
        <tfoot>
          <tr>
            <td colspan="2"><strong>All doctors</strong></td>
            ${data.categories.map(c => `<td class="r mono bold">${(data.totals.by_category[c] || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>`).join('')}
            <td class="r mono bold">${data.totals.grand_total.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
          </tr>
        </tfoot>
      </table>
    `;
    openPrintWindow('Doctor Revenue Report', html);
  };

  // Print a Physician Production sheet. When `physicianOnly` is true, strip
  // auxiliary categories (lab, imaging, pharmacy, registration) — that's the
  // copy the doctor keeps for their own records, which should reflect only
  // their personal output.
  const printDrill = (physicianOnly = false) => {
    if (!drillData) return;

    const lines = physicianOnly
      ? drillData.lines.filter(l => !isAuxiliary(l.category))
      : drillData.lines;

    // Group lines by category for a Physician-Production style layout
    const byCategory = new Map<string, LineItem[]>();
    for (const l of lines) {
      if (!byCategory.has(l.category)) byCategory.set(l.category, []);
      byCategory.get(l.category)!.push(l);
    }
    const sortedCategories = Array.from(byCategory.keys()).sort();

    // Recompute totals from the filtered line set (don't trust drillData.totals
    // when we've stripped categories out of the line list).
    const subtotals: Record<string, number> = {};
    let grandTotal = 0;
    for (const cat of sortedCategories) {
      const sub = byCategory.get(cat)!.reduce((s, l) => s + l.total, 0);
      subtotals[cat] = sub;
      grandTotal += sub;
    }

    const sections = sortedCategories.map(cat => {
      const items = byCategory.get(cat)!;
      const sub = subtotals[cat];
      return `
        <h2 class="section">${cat.charAt(0).toUpperCase() + cat.slice(1)}</h2>
        <table>
          <thead>
            <tr>
              <th>Service / Line item</th>
              <th class="r">Times billed</th>
              <th class="r">Quantity</th>
              <th class="r">Total</th>
            </tr>
          </thead>
          <tbody>
            ${items.map(l => `
              <tr>
                <td>${l.description}</td>
                <td class="r mono">${l.line_count}</td>
                <td class="r mono">${l.quantity}</td>
                <td class="r mono">${l.total.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
              </tr>`).join('')}
            <tr class="subtotal">
              <td colspan="3"><strong>Subtotal — ${cat}</strong></td>
              <td class="r mono bold">${sub.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
            </tr>
          </tbody>
        </table>
      `;
    }).join('');

    const title = physicianOnly ? 'Physician Production (Physician Copy)' : 'Physician Production';
    const subtitle = physicianOnly
      ? '<p class="meta" style="font-style:italic;color:#666;">Personal services only — excludes lab, imaging, pharmacy, and registration.</p>'
      : '';

    const emptyNotice = lines.length === 0
      ? '<p class="meta" style="margin-top:24px;">No personal-service line items for this doctor in the selected period.</p>'
      : '';

    const html = `
      <h1>${title}</h1>
      <p class="meta"><strong>${drillData.doctor_name}</strong>${drillData.doctor_clinic ? ' — ' + drillData.doctor_clinic : ''}</p>
      <p class="meta">Period: <strong>${drillData.start_date}</strong> to <strong>${drillData.end_date}</strong></p>
      <p class="meta">Generated: ${new Date().toLocaleString()}</p>
      ${subtitle}
      ${sections}
      ${emptyNotice}
      <h2 class="section">Total</h2>
      <table>
        <tbody>
          <tr class="grandtotal">
            <td><strong>Net Service Revenue</strong></td>
            <td class="r mono bold">${grandTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
          </tr>
        </tbody>
      </table>
    `;
    openPrintWindow(`${title} — ${drillData.doctor_name}`, html);
  };

  const openPrintWindow = (title: string, bodyHtml: string) => {
    const w = window.open('', '_blank', 'width=900,height=700');
    if (!w) {
      alert('Please allow popups to print this report.');
      return;
    }
    w.document.write(`
      <!doctype html>
      <html>
      <head>
        <meta charset="utf-8" />
        <title>${title}</title>
        <style>
          * { box-sizing: border-box; }
          body { font-family: Arial, Helvetica, sans-serif; padding: 32px; color: #111; }
          h1 { font-size: 22px; margin: 0 0 4px; }
          h2.section { font-size: 14px; margin: 24px 0 6px; text-transform: uppercase; letter-spacing: 0.04em; color: #444; border-bottom: 1px solid #999; padding-bottom: 4px; }
          .meta { font-size: 12px; color: #444; margin: 2px 0; }
          table { width: 100%; border-collapse: collapse; margin: 8px 0 18px; font-size: 12px; }
          th, td { padding: 6px 8px; border-bottom: 1px solid #ddd; text-align: left; vertical-align: top; }
          th { background: #f3f4f6; font-weight: 600; }
          td.r, th.r { text-align: right; }
          .mono { font-family: 'Courier New', Courier, monospace; }
          .bold { font-weight: 700; }
          .cap { text-transform: capitalize; }
          tr.subtotal td { background: #f9fafb; }
          tr.grandtotal td { background: #ecfdf5; border-top: 2px solid #065f46; font-size: 13px; }
          tfoot td { border-top: 2px solid #999; font-weight: 700; background: #f9fafb; }
          @media print {
            body { padding: 12px; }
            button { display: none; }
          }
        </style>
      </head>
      <body>
        ${bodyHtml}
        <div style="margin-top:24px;text-align:center;">
          <button onclick="window.print()" style="padding:8px 18px;font-size:14px;cursor:pointer;">Print / Save as PDF</button>
        </div>
        <script>setTimeout(() => window.print(), 250);</script>
      </body>
      </html>
    `);
    w.document.close();
  };

  return (
    <div className="bg-white rounded-xl shadow-lg border border-gray-200 p-6">
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div>
          <h2 className="text-xl font-semibold text-gray-900">Doctor Revenue</h2>
          <p className="text-sm text-gray-600 mt-1">
            Revenue attributed to each doctor by line item type. Click a doctor to drill into line items.
          </p>
        </div>
        <div className="flex items-end gap-2 flex-wrap">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">From</label>
            <input
              type="date"
              value={start}
              onChange={(e) => setStart(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">To</label>
            <input
              type="date"
              value={end}
              onChange={(e) => setEnd(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
            />
          </div>
          <button
            onClick={load}
            className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 text-sm"
          >
            Apply
          </button>
          <button
            onClick={printSummary}
            disabled={!data || data.doctors.length === 0}
            className="px-4 py-2 bg-gray-700 text-white rounded-lg hover:bg-gray-800 text-sm disabled:opacity-40 disabled:cursor-not-allowed inline-flex items-center gap-1"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
            </svg>
            Print / PDF
          </button>
        </div>
      </div>

      {data && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-gradient-to-br from-success-50 to-success-100 rounded-lg p-4 border border-success-200">
            <div className="text-xs font-semibold text-success-700 uppercase">Total Revenue</div>
            <div className="text-2xl font-bold text-success-800 mt-1">{fmtGHS(data.totals.grand_total)}</div>
          </div>
          <div className="bg-gradient-to-br from-primary-50 to-primary-100 rounded-lg p-4 border border-primary-200">
            <div className="text-xs font-semibold text-primary-700 uppercase">Doctors with Revenue</div>
            <div className="text-2xl font-bold text-primary-800 mt-1">{data.doctors.length}</div>
          </div>
          <div className="bg-gradient-to-br from-warning-50 to-warning-100 rounded-lg p-4 border border-warning-200">
            <div className="text-xs font-semibold text-warning-700 uppercase">Top Doctor</div>
            <div className="text-lg font-bold text-warning-800 mt-1 truncate">
              {data.doctors[0]?.doctor_name || '—'}
            </div>
            <div className="text-xs text-warning-700 mt-0.5">
              {data.doctors[0] ? fmtGHS(data.doctors[0].total) : ''}
            </div>
          </div>
          <div className="bg-gradient-to-br from-secondary-50 to-secondary-100 rounded-lg p-4 border border-secondary-200">
            <div className="text-xs font-semibold text-secondary-700 uppercase">Top Category</div>
            {(() => {
              const top = Object.entries(data.totals.by_category).sort((a, b) => b[1] - a[1])[0];
              if (!top) return <div className="text-lg font-bold text-secondary-800 mt-1">—</div>;
              return (
                <>
                  <div className="text-lg font-bold text-secondary-800 mt-1 capitalize">{top[0]}</div>
                  <div className="text-xs text-secondary-700 mt-0.5">{fmtGHS(top[1])}</div>
                </>
              );
            })()}
          </div>
        </div>
      )}

      {loading ? (
        <div className="py-8 text-center text-gray-500 text-sm">Loading...</div>
      ) : !data || data.doctors.length === 0 ? (
        <div className="py-12 text-center text-gray-500 text-sm">
          No revenue attributed to doctors in this date range.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-3 py-2 font-semibold text-gray-700">Doctor</th>
                <th className="text-left px-3 py-2 font-semibold text-gray-700">Clinic</th>
                {data.categories.map(cat => (
                  <th key={cat} className="text-right px-3 py-2 font-semibold text-gray-700 capitalize">{cat}</th>
                ))}
                <th className="text-right px-3 py-2 font-semibold text-gray-900">Total</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {data.doctors.map(d => (
                <tr
                  key={d.provider_id}
                  className="border-t border-gray-100 hover:bg-primary-50 cursor-pointer"
                  onClick={() => openDrill(d)}
                  title="Click to see line items"
                >
                  <td className="px-3 py-2 font-medium text-primary-700 underline-offset-2 hover:underline">
                    {d.doctor_name}
                  </td>
                  <td className="px-3 py-2 text-gray-600 text-xs">{d.doctor_clinic || '—'}</td>
                  {data.categories.map(cat => (
                    <td key={cat} className="px-3 py-2 text-right text-gray-700 font-mono">
                      {d.by_category[cat]
                        ? d.by_category[cat].toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
                        : '—'}
                    </td>
                  ))}
                  <td className="px-3 py-2 text-right font-bold text-gray-900 font-mono">
                    {d.total.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </td>
                  <td className="px-3 py-2 text-right text-xs text-primary-600">View →</td>
                </tr>
              ))}
            </tbody>
            <tfoot className="bg-gray-50 border-t-2 border-gray-300">
              <tr>
                <td className="px-3 py-2 font-bold text-gray-900" colSpan={2}>All doctors</td>
                {data.categories.map(cat => (
                  <td key={cat} className="px-3 py-2 text-right font-bold text-gray-900 font-mono">
                    {(data.totals.by_category[cat] || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </td>
                ))}
                <td className="px-3 py-2 text-right font-bold text-success-700 font-mono">
                  {data.totals.grand_total.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </td>
                <td></td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {/* Drill-down modal — Physician Production layout */}
      {drillDoctor && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-4xl w-full max-h-[90vh] flex flex-col">
            <div className="px-6 py-4 border-b border-gray-200 flex items-start justify-between">
              <div>
                <h3 className="text-lg font-semibold text-gray-900">
                  Physician Production — {drillDoctor.doctor_name}
                </h3>
                <p className="text-xs text-gray-500 mt-0.5">
                  {drillDoctor.doctor_clinic || 'No clinic on file'} · {start} to {end}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => printDrill(true)}
                  disabled={!drillData || drillData.lines.filter(l => !isAuxiliary(l.category)).length === 0}
                  className="px-3 py-1.5 bg-primary-600 text-white rounded-lg hover:bg-primary-700 text-xs disabled:opacity-40 inline-flex items-center gap-1"
                  title="Print a copy for the physician — excludes lab, imaging, pharmacy, registration"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                  </svg>
                  Physician Copy
                </button>
                <button
                  onClick={() => printDrill(false)}
                  disabled={!drillData || drillData.lines.length === 0}
                  className="px-3 py-1.5 bg-gray-700 text-white rounded-lg hover:bg-gray-800 text-xs disabled:opacity-40 inline-flex items-center gap-1"
                  title="Print the full breakdown — includes auxiliary services (lab, imaging, pharmacy, registration)"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                  </svg>
                  Full Print / PDF
                </button>
                <button
                  onClick={closeDrill}
                  className="text-gray-400 hover:text-gray-600"
                  aria-label="Close"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-6">
              {drillLoading ? (
                <div className="py-12 text-center text-gray-500 text-sm">Loading line items…</div>
              ) : !drillData || drillData.lines.length === 0 ? (
                <div className="py-12 text-center text-gray-500 text-sm">
                  No line items billed for this doctor in the selected period.
                </div>
              ) : (
                <>
                  {(() => {
                    const byCategory = new Map<string, LineItem[]>();
                    for (const l of drillData.lines) {
                      if (!byCategory.has(l.category)) byCategory.set(l.category, []);
                      byCategory.get(l.category)!.push(l);
                    }
                    const sortedCategories = Array.from(byCategory.keys()).sort();
                    return sortedCategories.map(cat => {
                      const items = byCategory.get(cat)!;
                      const sub = drillData.totals.by_category[cat] || 0;
                      return (
                        <div key={cat} className="mb-6">
                          <h4 className="text-sm font-semibold text-gray-700 uppercase tracking-wide border-b border-gray-300 pb-1 mb-2">
                            {cat}
                          </h4>
                          <table className="w-full text-sm">
                            <thead>
                              <tr className="text-xs text-gray-500">
                                <th className="text-left py-1.5 font-medium">Service / Line item</th>
                                <th className="text-right py-1.5 font-medium w-24">Times billed</th>
                                <th className="text-right py-1.5 font-medium w-20">Qty</th>
                                <th className="text-right py-1.5 font-medium w-28">Total</th>
                              </tr>
                            </thead>
                            <tbody>
                              {items.map((l, idx) => (
                                <tr key={idx} className="border-t border-gray-100">
                                  <td className="py-1.5 text-gray-800">{l.description}</td>
                                  <td className="py-1.5 text-right text-gray-600 font-mono">{l.line_count}</td>
                                  <td className="py-1.5 text-right text-gray-600 font-mono">{l.quantity}</td>
                                  <td className="py-1.5 text-right text-gray-900 font-mono">
                                    {l.total.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                  </td>
                                </tr>
                              ))}
                              <tr className="border-t border-gray-300 bg-gray-50">
                                <td className="py-1.5 font-semibold text-gray-700" colSpan={3}>
                                  Subtotal — {cat}
                                </td>
                                <td className="py-1.5 text-right font-bold text-gray-900 font-mono">
                                  {sub.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                </td>
                              </tr>
                            </tbody>
                          </table>
                        </div>
                      );
                    });
                  })()}

                  <div className="mt-6 pt-4 border-t-2 border-gray-300">
                    <div className="flex items-center justify-between bg-success-50 border border-success-200 rounded-lg px-4 py-3">
                      <div className="text-sm font-semibold text-success-800">Net Service Revenue</div>
                      <div className="text-xl font-bold text-success-800 font-mono">
                        {fmtGHS(drillData.totals.grand_total)}
                      </div>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default DoctorRevenuePanel;
