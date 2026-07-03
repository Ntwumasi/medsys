/**
 * Patient-facing display cleanup for invoice/receipt line descriptions.
 *
 * Lab catalog names carry a sex/age qualifier baked into the name (from the
 * MDS-Lancet price list), e.g. "Lab: ENDOCERVICAL SWAB C/S - FEMALE ADULT
 * (HVS C/S)". Reception asked that the SEX not appear on patient invoices.
 *
 * This strips only the MALE/FEMALE token (keeping the age qualifier, e.g.
 * ADULT/CHILD, and the rest of the name) and tidies up any separator/spacing
 * left behind. It's display-only: the stored description and the clinical lab
 * catalog are untouched, so internal reports and pricing are unaffected. Scoped
 * to lab lines (description begins with "Lab:") so nothing else is altered.
 */
export function stripLabSex(description: string): string {
  if (!description || !/^\s*lab\s*:/i.test(description)) return description;

  let out = description.replace(/\b(fe)?male\b/gi, '');
  // Tidy artifacts left where the sex word was removed:
  out = out.replace(/\s*-\s*(?=\))/g, ' '); // " - (HVS)" -> " (HVS)"
  out = out.replace(/\(\s+/g, '(').replace(/\s+\)/g, ')'); // "( HVS )" -> "(HVS)"
  out = out.replace(/\s*-\s*$/g, ''); // trailing " -"
  out = out.replace(/\s{2,}/g, ' ').trim(); // collapse double spaces
  return out;
}
