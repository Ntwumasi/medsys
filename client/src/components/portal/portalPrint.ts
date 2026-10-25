import { branding } from '../../config/branding';
import type { PortalBill, PortalLab, PortalMe, PortalVisit } from '../../api/patientPortal';
import { parseLabResult, labFlag, rangeText, FLAG_TEXT } from './labDisplay';

// Patient-facing printouts (lab report, bill). New-window approach, as
// elsewhere in the app — the patient prints or "Save as PDF" from the dialog.

const esc = (v: unknown): string =>
  String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));

const fmt = (iso: string | null | undefined): string => {
  if (!iso) return '—';
  const d = new Date(iso);
  return isNaN(d.getTime()) ? '—' : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
};

const ghs = (n: number) => `GHS ${n.toFixed(2)}`;

const letterhead = () => `
  <header>
    ${branding.clinicLogo ? `<img src="${esc(branding.clinicLogo)}" alt="" />` : ''}
    <div>
      <h1>${esc(branding.clinicName)}</h1>
      <p>${[branding.clinicAddress, branding.clinicPhone, branding.clinicEmail].filter(Boolean).map(esc).join(' · ')}</p>
    </div>
  </header>`;

const patientBlock = (me: PortalMe) => `
  <section class="patient">
    <div><span>Patient</span>${esc(`${me.first_name} ${me.last_name}`)}</div>
    <div><span>Patient no.</span>${esc(me.patient_number)}</div>
    <div><span>Date of birth</span>${esc(fmt(me.date_of_birth))}</div>
  </section>`;

const STYLE = `
  * { box-sizing: border-box; }
  body { font-family: Arial, Helvetica, sans-serif; color: #111827; margin: 32px; font-size: 13px; }
  header { display: flex; gap: 16px; align-items: center; border-bottom: 2px solid #0f766e; padding-bottom: 12px; }
  header img { height: 56px; }
  header h1 { margin: 0; font-size: 20px; }
  header p { margin: 4px 0 0; color: #4b5563; }
  h2 { font-size: 16px; margin: 20px 0 8px; }
  .patient { display: flex; flex-wrap: wrap; gap: 24px; margin-top: 16px; }
  .patient span { display: block; font-size: 11px; color: #6b7280; text-transform: uppercase; }
  .meta { color: #4b5563; margin: 0 0 8px; }
  table { width: 100%; border-collapse: collapse; margin-top: 8px; }
  th, td { text-align: left; padding: 6px 8px; border-bottom: 1px solid #e5e7eb; }
  th { font-size: 11px; text-transform: uppercase; color: #6b7280; }
  td.num { text-align: right; font-variant-numeric: tabular-nums; }
  .flag { font-weight: bold; }
  .totals td { font-weight: bold; }
  .note { margin-top: 12px; white-space: pre-wrap; }
  footer { margin-top: 32px; font-size: 11px; color: #6b7280; border-top: 1px solid #e5e7eb; padding-top: 8px; }
  @media print { body { margin: 12mm; } }`;

/** Returns false if the browser blocked the new window (caller tells the patient). */
const openPrintWindow = (title: string, body: string): boolean => {
  const w = window.open('', '_blank');
  if (!w) return false;
  w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title><style>${STYLE}</style></head>
    <body>${body}
    <footer>Downloaded from the ${esc(branding.clinicName)} patient portal on ${esc(fmt(new Date().toISOString()))}.</footer>
    <script>window.onload = function () { window.print(); };</script></body></html>`);
  w.document.close();
  return true;
};

export const printLabReport = (lab: PortalLab, me: PortalMe): boolean => {
  const parsed = parseLabResult(lab.result);
  let rows = '';
  if (parsed.kind === 'structured') {
    const byCode = new Map(lab.parameters.map((p) => [p.parameter_code, p]));
    rows = `<table><thead><tr><th>Test</th><th class="num">Result</th><th>Unit</th><th>Normal range</th><th>Flag</th></tr></thead><tbody>
      ${parsed.values.map(({ code, label, value }) => {
        const def = byCode.get(code);
        const flag = labFlag(value, def);
        return `<tr><td>${esc(def?.parameter_name || label)}</td><td class="num">${esc(value)}</td>
          <td>${esc(def?.unit || '')}</td><td>${esc(rangeText(def) || '—')}</td>
          <td class="flag">${flag === 'normal' || flag === 'none' ? '' : esc(FLAG_TEXT[flag])}</td></tr>`;
      }).join('')}
    </tbody></table>${parsed.notes ? `<p class="note"><strong>Notes:</strong> ${esc(parsed.notes)}</p>` : ''}`;
  } else {
    rows = `<p class="note">${esc(parsed.text)}</p>`;
  }
  return openPrintWindow(`${lab.test_name} — Lab report`, `${letterhead()}${patientBlock(me)}
    <h2>Laboratory report: ${esc(lab.test_name)}</h2>
    <p class="meta">Ordered ${esc(fmt(lab.ordered_date))}${lab.ordered_by ? ` by ${esc(lab.ordered_by)}` : ''} · Released ${esc(fmt(lab.released_at))}</p>
    ${rows}`);
};

export const printBill = (bill: PortalBill, me: PortalMe): boolean => {
  return openPrintWindow(`Invoice ${bill.invoice_number}`, `${letterhead()}${patientBlock(me)}
    <h2>Invoice ${esc(bill.invoice_number)}</h2>
    <p class="meta">Date ${esc(fmt(bill.invoice_date))}${bill.covered && bill.payer_name ? ` · Covered by ${esc(bill.payer_name)}` : ''}</p>
    <table><thead><tr><th>Item</th><th class="num">Qty</th><th class="num">Amount</th>${bill.covered ? '<th>Paid by</th>' : ''}</tr></thead><tbody>
      ${bill.items.map((i) => `<tr><td>${esc(i.description)}</td><td class="num">${i.quantity}</td><td class="num">${esc(ghs(i.amount))}</td>
        ${bill.covered ? `<td>${i.paid_by === 'you' ? 'You' : esc(bill.payer_name || 'Your cover')}</td>` : ''}</tr>`).join('')}
    </tbody></table>
    <table class="totals"><tbody>
      <tr><td>Total</td><td class="num">${esc(ghs(bill.total))}</td></tr>
      ${bill.covered ? `<tr><td>Covered by ${esc(bill.payer_name || 'your cover')}</td><td class="num">${esc(ghs(bill.covered_share))}</td></tr>
        <tr><td>Your share</td><td class="num">${esc(ghs(bill.your_share))}</td></tr>` : ''}
      <tr><td>You paid</td><td class="num">${esc(ghs(bill.you_paid))}</td></tr>
      <tr><td>Balance due</td><td class="num">${esc(ghs(bill.balance_due))}</td></tr>
    </tbody></table>
    ${bill.payments.length ? `<h2>Payments</h2><table><tbody>${bill.payments.map((p) =>
      `<tr><td>${esc(fmt(p.date))}</td><td>${esc((p.method || '').replace(/_/g, ' '))}</td><td class="num">${esc(ghs(p.amount))}</td></tr>`).join('')}</tbody></table>` : ''}`);
};

const list = (items: string[]) => (items.length ? `<ul>${items.map((i) => `<li>${esc(i)}</li>`).join('')}</ul>` : '<p class="meta">None</p>');

export const medicineLine = (m: PortalVisit['medicines'][number]): string =>
  [m.name, m.dosage, m.frequency, m.route, m.days ? `for ${m.days} days` : ''].filter(Boolean).join(' · ');

export const followUpLine = (f: NonNullable<PortalVisit['follow_up']>): string => {
  const when = f.date
    ? new Date(f.date).toLocaleString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', ...(f.has_time ? { hour: 'numeric', minute: '2-digit' } : {}) })
    : f.timeframe ? `in about ${f.timeframe}` : 'to be booked';
  return `${f.date ? 'Booked for ' : 'Come back '}${when}${f.reason ? ` — ${f.reason}` : ''}`;
};

export const printVisitSummary = (visit: PortalVisit, me: PortalMe): boolean =>
  openPrintWindow(`Visit summary — ${fmt(visit.visit_date)}`, `${letterhead()}${patientBlock(me)}
    <h2>Visit summary — ${esc(fmt(visit.visit_date))}</h2>
    <p class="meta">${[visit.clinic, visit.doctor_name && `Seen by ${visit.doctor_name}`, visit.encounter_number && `Visit ${visit.encounter_number}`].filter(Boolean).map((x) => esc(x)).join(' · ')}</p>
    ${visit.reason ? `<h2>Reason for visit</h2><p class="note">${esc(visit.reason)}</p>` : ''}
    <h2>Diagnosis</h2>${list(visit.diagnoses)}
    <h2>Medicines prescribed</h2>${list(visit.medicines.map(medicineLine))}
    <h2>Tests ordered</h2>${list(visit.tests)}
    ${visit.follow_up ? `<h2>Follow-up</h2><p class="note">${esc(followUpLine(visit.follow_up))}</p>` : ''}
    ${visit.patient_note ? `<h2>Notes from your doctor</h2><p class="note">${esc(visit.patient_note)}</p>` : ''}`);
