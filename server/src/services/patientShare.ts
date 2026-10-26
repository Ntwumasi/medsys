/**
 * What the PATIENT owes on each invoice. Self-pay: the whole bill. Insured /
 * corporate / staff cover: only the lines marked bill_to='patient'; the rest
 * is the payer's share and is collected through payer submission, so it must
 * never appear as the patient's debt (statements, portal bills).
 */

export const isPayerSettlement = (notes: string | null | undefined, method?: string | null) =>
  /payer settlement$/.test(notes || '') || /_settlement$/.test(method || '');

export const money = (n: number) => Math.round(n * 100) / 100;

export interface ShareInvoice {
  id: number;
  total_amount: number | string;
  amount_paid: number | string | null;
  /** payer_type of the invoice's payer source, if it has one */
  invoice_payer_type?: string | null;
}

export interface ShareLine {
  invoice_id: number;
  total_price: number | string;
  bill_to?: string | null;
}

export interface SharePayment {
  invoice_id: number;
  amount: number | string;
  notes?: string | null;
  payment_method?: string | null;
}

export interface PatientShare {
  covered: boolean;
  total: number;
  your_share: number;
  covered_share: number;
  you_paid: number;
  balance_due: number;
}

export const patientShares = (
  invoices: ShareInvoice[],
  lines: ShareLine[],
  payments: SharePayment[],
  primaryPayerType: string | null | undefined
): Map<number, PatientShare> => {
  const out = new Map<number, PatientShare>();
  for (const inv of invoices) {
    const payerType = inv.invoice_payer_type || primaryPayerType || 'self_pay';
    const covered = payerType !== 'self_pay';
    const total = Number(inv.total_amount) || 0;
    const paidTotal = Number(inv.amount_paid) || 0;
    const patientPaid = money(
      payments
        .filter((p) => p.invoice_id === inv.id && !isPayerSettlement(p.notes, p.payment_method))
        .reduce((s, p) => s + Number(p.amount || 0), 0)
    );
    const yourShare = covered
      ? money(lines.filter((l) => l.invoice_id === inv.id && (l.bill_to || 'payer') === 'patient')
          .reduce((s, l) => s + Number(l.total_price || 0), 0))
      : total;
    out.set(inv.id, {
      covered,
      total,
      your_share: yourShare,
      covered_share: covered ? money(total - yourShare) : 0,
      you_paid: covered ? patientPaid : money(paidTotal),
      balance_due: covered ? Math.max(0, money(yourShare - patientPaid)) : Math.max(0, money(total - paidTotal)),
    });
  }
  return out;
};

/** The patient's primary payer type ('self_pay' when they have none). */
export const primaryPayerTypeSql = `SELECT payer_type FROM patient_payer_sources
  WHERE patient_id = $1 ORDER BY is_primary DESC NULLS LAST, id ASC LIMIT 1`;
