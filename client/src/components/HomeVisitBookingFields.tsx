import React, { useEffect, useRef, useState } from 'react';
import apiClient from '../api/client';

/**
 * "Where" part of an appointment booking: In the clinic, or a home visit with
 * the address, Ghana GPS code, landmark, a contact phone and the nurse going
 * along. When a patient is chosen, the address on their record is filled in;
 * "Save to the patient's record" keeps any correction for next time.
 */

export interface HomeVisitDraft {
  location_type: 'clinic' | 'home';
  visit_address: string;
  visit_gps_address: string;
  visit_landmark: string;
  visit_contact_phone: string;
  nurse_id: number | null;
  save_to_patient: boolean;
}

export const emptyHomeVisitDraft = (): HomeVisitDraft => ({
  location_type: 'clinic',
  visit_address: '',
  visit_gps_address: '',
  visit_landmark: '',
  visit_contact_phone: '',
  nurse_id: null,
  save_to_patient: true,
});

/** The appointment request fields for a draft (nothing extra for a clinic visit). */
export const homeVisitPayload = (d: HomeVisitDraft) =>
  d.location_type === 'home'
    ? {
        location_type: 'home' as const,
        visit_address: d.visit_address.trim() || null,
        visit_gps_address: d.visit_gps_address.trim() || null,
        visit_landmark: d.visit_landmark.trim() || null,
        visit_contact_phone: d.visit_contact_phone.trim() || null,
        nurse_id: d.nurse_id,
        save_to_patient: d.save_to_patient,
      }
    : { location_type: 'clinic' as const };

/** A home visit needs somewhere to go. */
export const homeVisitDraftError = (d: HomeVisitDraft): string | null =>
  d.location_type === 'home' && !d.visit_address.trim() && !d.visit_gps_address.trim()
    ? 'Enter the address or GPS address for the home visit'
    : null;

interface Props {
  value: HomeVisitDraft;
  onChange: (next: HomeVisitDraft) => void;
  /** Registered patient being booked, if any — used to fill in their address. */
  patientId?: number | null;
}

interface Nurse {
  id: number;
  first_name: string;
  last_name: string;
}

const inputClass =
  'w-full min-h-ds-control px-3 py-2 border border-ds-border-control rounded-lg bg-ds-surface text-ds-text focus:ring-2 focus:ring-ds-focus-ring focus:border-transparent';

const HomeVisitBookingFields: React.FC<Props> = ({ value, onChange, patientId }) => {
  const [nurses, setNurses] = useState<Nurse[]>([]);
  const [addressNote, setAddressNote] = useState<string | null>(null);
  const filledFor = useRef<number | null>(null);
  const isHome = value.location_type === 'home';
  const set = (patch: Partial<HomeVisitDraft>) => onChange({ ...value, ...patch });

  useEffect(() => {
    if (!isHome || nurses.length > 0) return;
    apiClient
      .get('/workflow/nurses')
      .then((res) => setNurses(res.data.nurses || []))
      .catch(() => setNurses([]));
  }, [isHome, nurses.length]);

  // Fill the address from the patient's record once per patient, and only
  // into empty fields, so nothing the booker typed is overwritten.
  useEffect(() => {
    if (!isHome || !patientId || filledFor.current === patientId) return;
    let cancelled = false;
    apiClient
      .get(`/patients/${patientId}`)
      .then((res) => {
        if (cancelled) return;
        filledFor.current = patientId;
        const p = res.data.patient || {};
        const street = [p.address, p.city].filter(Boolean).join(', ');
        onChange({
          ...value,
          visit_address: value.visit_address || street || '',
          visit_gps_address: value.visit_gps_address || p.gps_address || '',
          visit_landmark: value.visit_landmark || p.landmark || '',
          visit_contact_phone: value.visit_contact_phone || p.phone || '',
        });
        setAddressNote(street || p.gps_address ? null : 'No address on file for this patient — please ask for it.');
      })
      .catch(() => setAddressNote("Couldn't load the patient's address — enter it below."));
    return () => {
      cancelled = true;
    };
    // value/onChange are deliberately left out: this runs when the patient changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isHome, patientId]);

  useEffect(() => {
    if (patientId !== filledFor.current) setAddressNote(null);
  }, [patientId]);

  return (
    <fieldset className="space-y-3">
      <legend className="block text-sm font-medium text-ds-text-secondary mb-2">Where</legend>
      <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Where the appointment happens">
        {([
          { v: 'clinic' as const, label: 'In the clinic' },
          { v: 'home' as const, label: 'Home visit' },
        ]).map((o) => (
          <button
            key={o.v}
            type="button"
            role="radio"
            aria-checked={value.location_type === o.v}
            onClick={() => set({ location_type: o.v })}
            className={`min-h-ds-touch px-3 rounded-lg border text-sm font-medium transition-colors ${
              value.location_type === o.v
                ? 'bg-ds-accent text-ds-on-accent border-ds-accent'
                : 'bg-ds-surface text-ds-text-secondary border-ds-border-control hover:bg-ds-subtle'
            }`}
          >
            {o.label}
          </button>
        ))}
      </div>

      {isHome && (
        <div className="space-y-3 p-3 rounded-lg border border-ds-border bg-ds-subtle">
          {addressNote && <p className="text-xs text-ds-warning-text">{addressNote}</p>}
          <div>
            <label htmlFor="hv-address" className="block text-xs font-medium text-ds-text-secondary mb-1">Address</label>
            <textarea
              id="hv-address"
              rows={2}
              value={value.visit_address}
              onChange={(e) => set({ visit_address: e.target.value })}
              placeholder="House number, street, area"
              className={`${inputClass} resize-none`}
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label htmlFor="hv-gps" className="block text-xs font-medium text-ds-text-secondary mb-1">GPS address</label>
              <input
                id="hv-gps"
                value={value.visit_gps_address}
                onChange={(e) => set({ visit_gps_address: e.target.value.toUpperCase() })}
                placeholder="e.g. GA-123-4567"
                className={`${inputClass} font-ds-mono`}
              />
            </div>
            <div>
              <label htmlFor="hv-phone" className="block text-xs font-medium text-ds-text-secondary mb-1">Phone on the day</label>
              <input
                id="hv-phone"
                type="tel"
                value={value.visit_contact_phone}
                onChange={(e) => set({ visit_contact_phone: e.target.value })}
                placeholder="Who to call on arrival"
                className={inputClass}
              />
            </div>
          </div>
          <div>
            <label htmlFor="hv-landmark" className="block text-xs font-medium text-ds-text-secondary mb-1">Landmark / directions</label>
            <input
              id="hv-landmark"
              value={value.visit_landmark}
              onChange={(e) => set({ visit_landmark: e.target.value })}
              placeholder="e.g. Blue gate opposite the Shell station"
              className={inputClass}
            />
          </div>
          <div>
            <label htmlFor="hv-nurse" className="block text-xs font-medium text-ds-text-secondary mb-1">Nurse going along (optional)</label>
            <select
              id="hv-nurse"
              value={value.nurse_id ?? ''}
              onChange={(e) => set({ nurse_id: e.target.value ? Number(e.target.value) : null })}
              className={inputClass}
            >
              <option value="">No nurse — doctor only</option>
              {nurses.map((n) => (
                <option key={n.id} value={n.id}>{n.first_name} {n.last_name}</option>
              ))}
            </select>
          </div>
          {patientId ? (
            <label className="flex items-center gap-2 min-h-ds-control text-sm text-ds-text-secondary cursor-pointer">
              <input
                type="checkbox"
                checked={value.save_to_patient}
                onChange={(e) => set({ save_to_patient: e.target.checked })}
                className="h-5 w-5"
              />
              Save this address to the patient's record
            </label>
          ) : null}
        </div>
      )}
    </fieldset>
  );
};

export default HomeVisitBookingFields;
