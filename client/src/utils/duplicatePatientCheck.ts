import apiClient from '../api/client';

interface DuplicateMatch {
  id: number;
  patient_number: string;
  first_name: string;
  last_name: string;
  date_of_birth: string | null;
  phone: string | null;
  confidence: 'exact' | 'likely' | 'possible';
}

type ConfirmFn = (opts: {
  title?: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: 'default' | 'warning' | 'danger' | 'success';
}) => Promise<boolean>;

/**
 * Before creating a patient, look for an existing record with the same name or
 * phone and ask the user to confirm it really is a new person. Every quick
 * registration (pharmacy, lab, nurse walk-ins, full registration) used to
 * create a fresh profile with no check, so returning patients ended up with
 * several profiles and their notes split between them.
 *
 * Returns true to go ahead and register. A failed check never blocks.
 */
export const confirmNotDuplicatePatient = async (
  confirm: ConfirmFn,
  details: { first_name: string; last_name: string; phone?: string; date_of_birth?: string }
): Promise<boolean> => {
  let matches: DuplicateMatch[] = [];
  try {
    const params = new URLSearchParams({
      first_name: details.first_name.trim(),
      last_name: details.last_name.trim(),
    });
    if (details.date_of_birth) params.set('date_of_birth', details.date_of_birth);
    if (details.phone?.trim()) params.set('phone', details.phone.trim());
    const { data } = await apiClient.get(`/patients/check-duplicates?${params}`);
    matches = data.duplicates || [];
  } catch {
    return true;
  }
  if (matches.length === 0) return true;

  const lines = matches.slice(0, 5).map((m) => {
    const dob = m.date_of_birth && String(m.date_of_birth).slice(0, 10) > '1901-01-01'
      ? String(m.date_of_birth).slice(0, 10)
      : 'no DOB';
    return `• ${m.first_name} ${m.last_name} — ${m.patient_number}, ${dob}, ${m.phone || 'no phone'}`;
  });
  return confirm({
    title: 'This patient may already be registered',
    message:
      `Existing record${matches.length > 1 ? 's' : ''} with a similar name or the same phone:\n\n${lines.join('\n')}` +
      `\n\nIf this is the same person, cancel and search for them instead — a second profile splits their visit history.`,
    confirmLabel: 'Register as new patient',
    cancelLabel: 'Cancel',
    variant: 'warning',
  });
};
