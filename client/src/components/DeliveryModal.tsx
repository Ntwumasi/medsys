import React, { useEffect, useRef, useState } from 'react';
import apiClient from '../api/client';
import { Modal } from './ui';
import { useNotification } from '../context/NotificationContext';
import { getApiError } from '../utils/apiError';
import { dobAndAge } from '../utils/age';

/**
 * "Deliver" — send a visit's medicines to the patient with a courier.
 * Opened from a patient's order group on the pharmacy queue. The address is
 * filled from the patient record (or the home-visit booking) and can be saved
 * back to the record.
 */

export interface DeliveryOrderOption {
  id: number;
  medication_name: string;
  quantity?: string | null;
  status: string;
  encounter_id: number;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onCreated: () => void;
  patient: { id: number; name: string; patient_number?: string | null; date_of_birth?: string | null };
  orders: DeliveryOrderOption[];
  isHomeVisit?: boolean;
}

const inputClass =
  'w-full min-h-ds-control px-3 py-2 border border-ds-border-control rounded-lg bg-ds-surface text-ds-text focus:ring-2 focus:ring-ds-focus-ring focus:border-transparent';
const labelClass = 'block text-xs font-medium text-ds-text-secondary mb-1';

const STATUS_LABEL: Record<string, string> = {
  ordered: 'Not started',
  in_progress: 'Preparing',
  ready: 'Ready',
  dispensed: 'Dispensed',
};

const DeliveryModal: React.FC<Props> = ({ isOpen, onClose, onCreated, patient, orders, isHomeVisit }) => {
  const { showToast } = useNotification();
  const deliverable = orders.filter((o) => !['cancelled', 'returned'].includes(o.status));
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [form, setForm] = useState({
    address: '', gps_address: '', landmark: '', contact_phone: '',
    courier_name: '', courier_phone: '', delivery_fee: '', notes: '',
  });
  const [payOnDelivery, setPayOnDelivery] = useState(true);
  const [saveAddress, setSaveAddress] = useState(false);
  const [hadAddress, setHadAddress] = useState(true);
  const [loadingAddress, setLoadingAddress] = useState(false);
  const [saving, setSaving] = useState(false);
  const forPatient = useRef<number | null>(null);

  // Reset for each patient and pre-fill the address from their record.
  useEffect(() => {
    if (!isOpen) return;
    forPatient.current = patient.id;
    setSelected(new Set(deliverable.map((o) => o.id)));
    setForm({ address: '', gps_address: '', landmark: '', contact_phone: '', courier_name: '', courier_phone: '', delivery_fee: '', notes: '' });
    setPayOnDelivery(true);
    setSaveAddress(false);
    setLoadingAddress(true);
    apiClient.get(`/patients/${patient.id}`)
      .then((res) => {
        if (forPatient.current !== patient.id) return; // a different patient was opened meanwhile
        const p = res.data.patient || res.data;
        setForm((f) => ({
          ...f,
          address: p.address || '',
          gps_address: p.gps_address || '',
          landmark: p.landmark || '',
          contact_phone: p.phone || '',
        }));
        const has = !!(p.address || p.gps_address);
        setHadAddress(has);
        setSaveAddress(!has);
      })
      .catch(() => { if (forPatient.current === patient.id) setHadAddress(false); })
      .finally(() => { if (forPatient.current === patient.id) setLoadingAddress(false); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, patient.id]);

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const toggle = (id: number) =>
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });

  const visits = new Set(deliverable.filter((o) => selected.has(o.id)).map((o) => o.encounter_id));
  const error =
    selected.size === 0 ? 'Choose at least one medicine.'
    : visits.size > 1 ? 'These medicines are from different visits — deliver one visit at a time.'
    : !form.address.trim() && !form.gps_address.trim() ? 'Enter the address or GPS code.'
    : form.delivery_fee && !(Number(form.delivery_fee) >= 0) ? 'Enter a valid delivery fee.'
    : null;

  const submit = async () => {
    if (error) { showToast(error, 'warning'); return; }
    setSaving(true);
    try {
      await apiClient.post('/deliveries', {
        order_ids: [...selected],
        ...form,
        delivery_fee: form.delivery_fee ? Number(form.delivery_fee) : 0,
        pay_on_delivery: payOnDelivery,
        save_address: saveAddress,
      });
      showToast(`Delivery set up for ${patient.name}`, 'success');
      onCreated();
      onClose();
    } catch (e) {
      showToast(getApiError(e, 'Could not set up the delivery'), 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Deliver medicines"
      size="lg"
      footer={
        <div className="flex flex-col-reverse sm:flex-row gap-3 w-full">
          <button onClick={onClose} className="min-h-ds-touch flex-1 px-4 rounded-lg border border-ds-border-control text-sm text-ds-text-secondary hover:bg-ds-subtle">
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={saving || !!error}
            className="min-h-ds-touch flex-1 px-4 rounded-lg bg-ds-accent text-ds-on-accent text-sm font-medium hover:bg-ds-accent-hover disabled:opacity-50"
          >
            {saving ? 'Setting up…' : 'Set up delivery'}
          </button>
        </div>
      }
    >
      <div className="space-y-4">
        {/* Patient identity — always visible while acting on the chart. */}
        <div className="p-3 rounded-lg bg-ds-subtle border border-ds-border">
          <p className="text-sm font-semibold text-ds-text">{patient.name}</p>
          <p className="text-xs text-ds-text-muted">
            {[patient.patient_number, dobAndAge(patient.date_of_birth)].filter(Boolean).join(' · ')}
            {isHomeVisit && <span className="ml-2 font-medium text-ds-accent-text">Home visit</span>}
          </p>
        </div>

        <fieldset>
          <legend className={labelClass}>Medicines to deliver</legend>
          <ul className="space-y-1">
            {deliverable.map((o) => (
              <li key={o.id}>
                <label className="flex items-center gap-3 min-h-ds-touch px-2 rounded-lg hover:bg-ds-subtle cursor-pointer">
                  <input type="checkbox" className="h-5 w-5" checked={selected.has(o.id)} onChange={() => toggle(o.id)} />
                  <span className="flex-1 text-sm text-ds-text">
                    {o.medication_name}{o.quantity ? <span className="text-ds-text-muted"> × {o.quantity}</span> : null}
                  </span>
                  <span className="text-xs text-ds-text-muted">{STATUS_LABEL[o.status] || o.status}</span>
                </label>
              </li>
            ))}
          </ul>
          <p className="mt-1 text-xs text-ds-text-muted">Dispense as usual — the courier can only take it once every medicine is dispensed (that's when stock comes off and it's billed).</p>
        </fieldset>

        <div className="space-y-3 p-3 rounded-lg border border-ds-border">
          {!loadingAddress && !hadAddress && (
            <p className="text-xs text-ds-warning-text">No address on the patient record — enter it below.</p>
          )}
          <div>
            <label htmlFor="dl-address" className={labelClass}>Address</label>
            <textarea id="dl-address" rows={2} value={form.address} onChange={set('address')} className={`${inputClass} resize-none`} placeholder={loadingAddress ? 'Loading…' : 'House number, street, area'} />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label htmlFor="dl-gps" className={labelClass}>GPS address</label>
              <input id="dl-gps" value={form.gps_address} onChange={set('gps_address')} className={`${inputClass} font-ds-mono`} placeholder="GA-123-4567" />
            </div>
            <div>
              <label htmlFor="dl-phone" className={labelClass}>Phone on the day</label>
              <input id="dl-phone" type="tel" value={form.contact_phone} onChange={set('contact_phone')} className={inputClass} />
            </div>
          </div>
          <div>
            <label htmlFor="dl-landmark" className={labelClass}>Landmark / directions</label>
            <input id="dl-landmark" value={form.landmark} onChange={set('landmark')} className={inputClass} placeholder="Opposite the Total filling station" />
          </div>
          <label className="flex items-center gap-2 min-h-ds-control text-sm text-ds-text-secondary cursor-pointer">
            <input type="checkbox" className="h-5 w-5" checked={saveAddress} onChange={(e) => setSaveAddress(e.target.checked)} />
            Save this address to {patient.name.split(' ')[0]}'s record
          </label>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label htmlFor="dl-courier" className={labelClass}>Courier (can add later)</label>
            <input id="dl-courier" value={form.courier_name} onChange={set('courier_name')} className={inputClass} placeholder="e.g. Bolt, Yango, rider's name" />
          </div>
          <div>
            <label htmlFor="dl-courier-phone" className={labelClass}>Courier phone</label>
            <input id="dl-courier-phone" type="tel" value={form.courier_phone} onChange={set('courier_phone')} className={inputClass} />
          </div>
          <div>
            <label htmlFor="dl-fee" className={labelClass}>Delivery fee (GHS)</label>
            <input id="dl-fee" type="number" min="0" step="0.01" inputMode="decimal" value={form.delivery_fee} onChange={set('delivery_fee')} className={inputClass} placeholder="0.00" />
            <p className="mt-1 text-xs text-ds-text-muted">Added to the visit bill, paid by the patient.</p>
          </div>
          <div className="flex items-start">
            <label className="flex items-center gap-2 min-h-ds-touch text-sm text-ds-text cursor-pointer sm:mt-5">
              <input type="checkbox" className="h-5 w-5" checked={payOnDelivery} onChange={(e) => setPayOnDelivery(e.target.checked)} />
              Pay on delivery (courier collects what the patient owes)
            </label>
          </div>
        </div>

        <div>
          <label htmlFor="dl-notes" className={labelClass}>Notes for the courier</label>
          <textarea id="dl-notes" rows={2} value={form.notes} onChange={set('notes')} className={`${inputClass} resize-none`} />
        </div>

        {error && selected.size > 0 && <p className="text-sm text-ds-warning-text">{error}</p>}
      </div>
    </Modal>
  );
};

export default DeliveryModal;
