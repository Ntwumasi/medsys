import React, { useCallback, useEffect, useState } from 'react';
import { format, parseISO, isValid } from 'date-fns';
import apiClient from '../api/client';
import { useNotification } from '../context/NotificationContext';
import { useDialog } from '../context/DialogContext';
import { getApiError } from '../utils/apiError';
import { dobAndAge } from '../utils/age';

/**
 * The pharmacy's delivery board. Couriers are external, so the pharmacy moves
 * each delivery along as the courier reports back:
 *   Preparing → Ready → Out for delivery → Delivered  (or Failed → retry / cancel)
 * Pay on delivery: when the courier hands in the money, "Record payment" puts
 * it on the invoice like any front-desk payment.
 */

type Status = 'preparing' | 'ready' | 'out_for_delivery' | 'delivered' | 'failed' | 'cancelled';

interface DeliveryOrder { id: number; medication_name: string; quantity?: string | null; status: string }
interface DeliveryEvent { id: number; status: string; note: string | null; created_at: string; by_name: string | null }

export interface Delivery {
  id: number;
  patient_id: number;
  patient_name: string;
  patient_number: string | null;
  patient_date_of_birth: string | null;
  patient_phone: string | null;
  status: Status;
  address: string | null;
  gps_address: string | null;
  landmark: string | null;
  contact_phone: string | null;
  courier_name: string | null;
  courier_phone: string | null;
  courier_reference: string | null;
  delivery_fee: string | number;
  pay_on_delivery: boolean;
  amount_to_collect: string | number | null;
  amount_collected: string | number | null;
  failed_reason: string | null;
  notes: string | null;
  is_home_visit: boolean;
  invoice_number: string | null;
  created_at: string;
  dispatched_at: string | null;
  delivered_at: string | null;
  orders: DeliveryOrder[];
  events?: DeliveryEvent[];
  balance_due?: number;
}

const STATUS: Record<Status, { label: string; cls: string }> = {
  preparing: { label: 'Preparing', cls: 'bg-ds-subtle text-ds-text-secondary border-ds-border' },
  ready: { label: 'Ready for courier', cls: 'bg-ds-accent-soft text-ds-accent-text border-ds-accent-soft' },
  out_for_delivery: { label: 'Out for delivery', cls: 'bg-ds-warning-soft text-ds-warning-text border-ds-warning-soft' },
  delivered: { label: 'Delivered', cls: 'bg-ds-success-soft text-ds-success-text border-ds-success-soft' },
  failed: { label: 'Failed', cls: 'bg-ds-critical-soft text-ds-critical-text border-ds-critical-border' },
  cancelled: { label: 'Cancelled', cls: 'bg-ds-subtle text-ds-text-muted border-ds-border' },
};

const ghs = (n: number | string | null | undefined) => `GHS ${(Number(n) || 0).toFixed(2)}`;
const when = (iso: string | null) => {
  if (!iso) return '';
  const d = parseISO(iso);
  return isValid(d) ? format(d, 'd MMM, h:mm a') : '';
};
const mapsLink = (d: Delivery) => {
  const q = d.gps_address || d.address;
  return q ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}` : null;
};
const telLink = (phone: string) => `tel:${phone.replace(/[^\d+]/g, '')}`;

const inputClass =
  'w-full min-h-ds-control px-3 py-2 border border-ds-border-control rounded-lg bg-ds-surface text-ds-text focus:ring-2 focus:ring-ds-focus-ring focus:border-transparent';
const btn = 'min-h-ds-touch px-3 rounded-lg border border-ds-border-control text-sm text-ds-text-secondary hover:bg-ds-subtle disabled:opacity-50';
const primaryBtn = 'min-h-ds-touch px-4 rounded-lg bg-ds-accent text-ds-on-accent text-sm font-medium hover:bg-ds-accent-hover disabled:opacity-50';

type Panel = null | { kind: 'send' | 'fail' | 'collect'; id: number };

interface Props {
  /** Bumped by the parent when a delivery is created elsewhere, to reload. */
  refreshKey?: number;
  /** Lets the pharmacy tab show a count badge. */
  onActiveCount?: (n: number) => void;
}

const DeliveriesPanel: React.FC<Props> = ({ refreshKey = 0, onActiveCount }) => {
  const { showToast } = useNotification();
  const { confirm } = useDialog();
  const [scope, setScope] = useState<'active' | 'done'>('active');
  const [deliveries, setDeliveries] = useState<Delivery[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<number | null>(null);
  const [panel, setPanel] = useState<Panel>(null);
  const [form, setForm] = useState({ courier_name: '', courier_phone: '', courier_reference: '', reason: '', amount: '', method: 'cash' });
  const [expanded, setExpanded] = useState<Record<number, Delivery | 'loading'>>({});

  const load = useCallback(async () => {
    try {
      const res = await apiClient.get('/deliveries', { params: { scope } });
      const list: Delivery[] = res.data.deliveries || [];
      setDeliveries(list);
      if (scope === 'active') onActiveCount?.(list.length);
      setError(null);
    } catch (e) {
      setError(getApiError(e, "Couldn't load deliveries"));
    } finally {
      setLoading(false);
    }
  }, [scope, onActiveCount]);

  useEffect(() => { setLoading(true); load(); }, [load, refreshKey]);
  useEffect(() => {
    const t = setInterval(load, 60_000);
    return () => clearInterval(t);
  }, [load]);

  const replace = (d: Delivery) => {
    setDeliveries((list) => list.map((x) => (x.id === d.id ? { ...x, ...d } : x)));
    setExpanded((e) => (e[d.id] ? { ...e, [d.id]: d } : e));
  };

  const openPanel = (kind: 'send' | 'fail' | 'collect', d: Delivery) => {
    setForm({
      courier_name: d.courier_name || '',
      courier_phone: d.courier_phone || '',
      courier_reference: d.courier_reference || '',
      reason: '',
      amount: kind === 'collect' ? String(Math.max(0, Number(d.amount_to_collect ?? 0) - Number(d.amount_collected ?? 0)).toFixed(2)) : '',
      method: 'cash',
    });
    setPanel({ kind, id: d.id });
  };

  const move = async (d: Delivery, status: Status, extra: Record<string, unknown> = {}, done?: string) => {
    setBusy(d.id);
    try {
      const res = await apiClient.post(`/deliveries/${d.id}/status`, { status, ...extra });
      replace(res.data.delivery);
      setPanel(null);
      showToast(done || `${d.patient_name}: ${STATUS[status].label.toLowerCase()}`, 'success');
      if (status === 'delivered' || status === 'cancelled') load();
    } catch (e) {
      showToast(getApiError(e, 'Could not update the delivery'), 'error');
    } finally {
      setBusy(null);
    }
  };

  const collect = async (d: Delivery) => {
    const amount = Number(form.amount);
    if (!(amount > 0)) { showToast('Enter the amount the courier handed in', 'warning'); return; }
    setBusy(d.id);
    try {
      const res = await apiClient.post(`/deliveries/${d.id}/collect`, { amount, payment_method: form.method });
      replace(res.data.delivery);
      setPanel(null);
      showToast(`${ghs(amount)} recorded for ${d.patient_name}`, 'success');
    } catch (e) {
      showToast(getApiError(e, 'Could not record the payment'), 'error');
    } finally {
      setBusy(null);
    }
  };

  const cancel = async (d: Delivery) => {
    const ok = await confirm({
      title: 'Cancel this delivery?',
      message: `The delivery fee comes off ${d.patient_name}'s bill and the medicines go back to normal pickup.`,
      variant: 'warning',
      confirmLabel: 'Cancel delivery',
      cancelLabel: 'Keep',
    });
    if (ok) move(d, 'cancelled');
  };

  const toggleTimeline = async (d: Delivery) => {
    if (expanded[d.id]) {
      setExpanded(({ [d.id]: _gone, ...rest }) => rest);
      return;
    }
    setExpanded((e) => ({ ...e, [d.id]: 'loading' }));
    try {
      const res = await apiClient.get(`/deliveries/${d.id}`);
      setExpanded((e) => ({ ...e, [d.id]: res.data.delivery }));
    } catch (e) {
      setExpanded(({ [d.id]: _gone, ...rest }) => rest);
      showToast(getApiError(e, "Couldn't load the delivery history"), 'error');
    }
  };

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  return (
    <section aria-labelledby="deliveries-title" className="bg-ds-surface rounded-ds-card shadow-ds-card border border-ds-border overflow-hidden">
      <div className="px-4 py-3 border-b border-ds-border flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 id="deliveries-title" className="text-base font-semibold text-ds-text">Deliveries</h2>
          <p className="text-xs text-ds-text-muted">Set one up with “Deliver” on a patient's orders. Update it as the courier reports back.</p>
        </div>
        <div className="flex bg-ds-subtle rounded-lg p-1" role="tablist">
          {(['active', 'done'] as const).map((s) => (
            <button
              key={s}
              role="tab"
              aria-selected={scope === s}
              onClick={() => setScope(s)}
              className={`min-h-[40px] px-4 text-sm font-medium rounded-md ${scope === s ? 'bg-ds-surface shadow-ds-card text-ds-text' : 'text-ds-text-muted hover:text-ds-text'}`}
            >
              {s === 'active' ? 'In progress' : 'Last 30 days'}
            </button>
          ))}
        </div>
      </div>

      {error ? (
        <div className="p-4 text-sm">
          <p className="text-ds-critical-text">{error}</p>
          <button onClick={load} className="mt-2 min-h-ds-control px-3 text-sm text-ds-accent-text hover:underline">Try again</button>
        </div>
      ) : loading ? (
        <p className="p-6 text-sm text-ds-text-muted">Loading deliveries…</p>
      ) : deliveries.length === 0 ? (
        <p className="p-6 text-sm text-ds-text-muted">
          {scope === 'active' ? 'No deliveries in progress.' : 'No finished deliveries in the last 30 days.'}
        </p>
      ) : (
        <ul className="divide-y divide-ds-border">
          {deliveries.map((d) => {
            const s = STATUS[d.status];
            const map = mapsLink(d);
            const phone = d.contact_phone || d.patient_phone;
            const toCollect = Number(d.amount_to_collect ?? 0);
            const collected = Number(d.amount_collected ?? 0);
            const owed = Math.max(0, toCollect - collected);
            const isBusy = busy === d.id;
            const open = panel?.id === d.id ? panel.kind : null;
            const detail = expanded[d.id];
            return (
              <li key={d.id} className="px-4 py-4">
                <div className="flex flex-col lg:flex-row lg:items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-semibold text-ds-text">{d.patient_name}</p>
                      <span className="text-xs text-ds-text-muted">{[d.patient_number, dobAndAge(d.patient_date_of_birth)].filter(Boolean).join(' · ')}</span>
                      <span className={`px-2 py-0.5 rounded-full border text-xs font-semibold ${s.cls}`}>{s.label}</span>
                      {d.is_home_visit && <span className="px-2 py-0.5 rounded-full bg-ds-accent-soft text-ds-accent-text text-xs">Home visit</span>}
                    </div>
                    <p className="mt-1 text-sm text-ds-text-secondary break-words">
                      {[d.address, d.gps_address].filter(Boolean).join(' · ')}
                    </p>
                    {d.landmark && <p className="text-xs text-ds-text-muted break-words">{d.landmark}</p>}
                    <p className="mt-1 text-xs text-ds-text-muted">
                      {d.orders.map((o) => o.medication_name).join(', ') || 'No medicines'}
                    </p>
                    <p className="mt-1 text-xs text-ds-text-muted">
                      {d.courier_name ? `Courier: ${d.courier_name}${d.courier_phone ? ` (${d.courier_phone})` : ''}` : 'No courier yet'}
                      {d.courier_reference ? ` · Ref ${d.courier_reference}` : ''}
                      {Number(d.delivery_fee) > 0 ? ` · Fee ${ghs(d.delivery_fee)}` : ''}
                      {d.dispatched_at ? ` · Sent ${when(d.dispatched_at)}` : ''}
                      {d.delivered_at ? ` · Delivered ${when(d.delivered_at)}` : ''}
                    </p>
                    {d.pay_on_delivery && d.status !== 'cancelled' && (
                      <p className="mt-1 text-sm font-medium text-ds-text">
                        {d.amount_to_collect === null
                          ? 'Pay on delivery — amount set when it goes out'
                          : owed > 0
                            ? `Courier to collect ${ghs(owed)}${collected > 0 ? ` (${ghs(collected)} handed in)` : ''}`
                            : toCollect > 0 ? `${ghs(collected)} collected and recorded` : 'Nothing to collect — already paid'}
                      </p>
                    )}
                    {d.status === 'failed' && d.failed_reason && (
                      <p className="mt-1 text-sm text-ds-critical-text">Failed: {d.failed_reason}</p>
                    )}
                    {d.notes && <p className="mt-1 text-xs text-ds-text-muted italic break-words">{d.notes}</p>}
                  </div>

                  <div className="flex flex-wrap gap-2 lg:justify-end lg:max-w-md">
                    {phone && <a href={telLink(phone)} className={`${btn} inline-flex items-center`}>Call patient</a>}
                    {map && <a href={map} target="_blank" rel="noopener noreferrer" className={`${btn} inline-flex items-center`}>Map</a>}
                    {d.status === 'preparing' && (
                      <button className={primaryBtn} disabled={isBusy} onClick={() => move(d, 'ready')}>Ready for courier</button>
                    )}
                    {(d.status === 'ready' || d.status === 'failed') && (
                      <button className={primaryBtn} disabled={isBusy} onClick={() => openPanel('send', d)}>
                        {d.status === 'failed' ? 'Try again' : 'Hand to courier'}
                      </button>
                    )}
                    {d.status === 'out_for_delivery' && (
                      <>
                        <button
                          className={primaryBtn}
                          disabled={isBusy}
                          onClick={() => move(d, 'delivered', {}, `Delivered to ${d.patient_name}`)}
                        >
                          Delivered
                        </button>
                        <button className={btn} disabled={isBusy} onClick={() => openPanel('fail', d)}>Failed</button>
                      </>
                    )}
                    {d.pay_on_delivery && owed > 0 && (d.status === 'out_for_delivery' || d.status === 'delivered') && (
                      <button className={btn} disabled={isBusy} onClick={() => openPanel('collect', d)}>Record payment</button>
                    )}
                    {['preparing', 'ready', 'failed'].includes(d.status) && (
                      <button className={`${btn} text-ds-critical-text`} disabled={isBusy} onClick={() => cancel(d)}>Cancel</button>
                    )}
                    <button className={btn} onClick={() => toggleTimeline(d)} aria-expanded={!!detail}>
                      {detail ? 'Hide history' : 'History'}
                    </button>
                  </div>
                </div>

                {open === 'send' && (
                  <div className="mt-3 p-3 rounded-lg border border-ds-border bg-ds-subtle grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <input aria-label="Courier" placeholder="Courier (Bolt, rider's name…)" value={form.courier_name} onChange={set('courier_name')} className={inputClass} />
                    <input aria-label="Courier phone" type="tel" placeholder="Courier phone" value={form.courier_phone} onChange={set('courier_phone')} className={inputClass} />
                    <input aria-label="Tracking or trip reference" placeholder="Trip / tracking ref (optional)" value={form.courier_reference} onChange={set('courier_reference')} className={inputClass} />
                    <div className="sm:col-span-3 flex flex-wrap gap-2">
                      <button
                        className={primaryBtn}
                        disabled={isBusy || !form.courier_name.trim()}
                        onClick={() => move(d, 'out_for_delivery', {
                          courier_name: form.courier_name, courier_phone: form.courier_phone, courier_reference: form.courier_reference,
                        }, `${d.patient_name}'s medicines are out for delivery`)}
                      >
                        Send out
                      </button>
                      <button className={btn} onClick={() => setPanel(null)}>Back</button>
                    </div>
                  </div>
                )}

                {open === 'fail' && (
                  <div className="mt-3 p-3 rounded-lg border border-ds-border bg-ds-subtle space-y-2">
                    <input aria-label="Why it failed" placeholder="Why? e.g. patient not home, wrong address" value={form.reason} onChange={set('reason')} className={inputClass} />
                    <div className="flex flex-wrap gap-2">
                      <button
                        className={primaryBtn}
                        disabled={isBusy || !form.reason.trim()}
                        onClick={() => move(d, 'failed', { failed_reason: form.reason })}
                      >
                        Mark failed
                      </button>
                      <button className={btn} onClick={() => setPanel(null)}>Back</button>
                    </div>
                  </div>
                )}

                {open === 'collect' && (
                  <div className="mt-3 p-3 rounded-lg border border-ds-border bg-ds-subtle grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
                    <label className="block">
                      <span className="block text-xs font-medium text-ds-text-secondary mb-1">Amount handed in (GHS)</span>
                      <input type="number" min="0" step="0.01" inputMode="decimal" value={form.amount} onChange={set('amount')} className={inputClass} />
                    </label>
                    <label className="block">
                      <span className="block text-xs font-medium text-ds-text-secondary mb-1">How it was paid</span>
                      <select value={form.method} onChange={set('method')} className={inputClass}>
                        <option value="cash">Cash</option>
                        <option value="mobile_money">Mobile money</option>
                        <option value="card">Card</option>
                      </select>
                    </label>
                    <div className="flex flex-wrap gap-2">
                      <button className={primaryBtn} disabled={isBusy} onClick={() => collect(d)}>Record payment</button>
                      <button className={btn} onClick={() => setPanel(null)}>Back</button>
                    </div>
                  </div>
                )}

                {detail && (
                  <div className="mt-3 pl-3 border-l-2 border-ds-border">
                    {detail === 'loading' ? (
                      <p className="text-xs text-ds-text-muted">Loading…</p>
                    ) : (
                      <ol className="space-y-1">
                        {(detail.events || []).map((ev) => (
                          <li key={ev.id} className="text-xs text-ds-text-secondary">
                            <span className="font-medium text-ds-text">{STATUS[ev.status as Status]?.label || ev.status}</span>
                            {' · '}{when(ev.created_at)}{ev.by_name ? ` · ${ev.by_name}` : ''}
                            {ev.note ? <span className="block text-ds-text-muted">{ev.note}</span> : null}
                          </li>
                        ))}
                        {detail.invoice_number && (
                          <li className="text-xs text-ds-text-muted">
                            Invoice {detail.invoice_number}{typeof detail.balance_due === 'number' ? ` · patient still owes ${ghs(detail.balance_due)}` : ''}
                          </li>
                        )}
                      </ol>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
};

export default DeliveriesPanel;
