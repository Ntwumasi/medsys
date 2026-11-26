import React, { useEffect, useRef, useState } from 'react';
import apiClient from '../api/client';

/**
 * Lab test box that searches the lab's own price list (lab_test_catalog).
 *
 * The old box suggested names from a fixed medical-terms list, so the same
 * test reached the lab under many spellings and often couldn't be priced
 * ("[PRICE PENDING]"). Picking a suggestion here fills the catalog name and
 * code, so the order is billed exactly. Typing freely is still allowed; the
 * server then matches the name (common abbreviations included).
 */
interface CatalogTest {
  test_code: string;
  test_name: string;
  base_price: string | number | null;
}

interface Props {
  value: string;
  /** Free typing: the code is unknown until the user picks a suggestion. */
  onChange: (value: string) => void;
  /** A catalog test was picked. */
  onSelect?: (test: { test_name: string; test_code: string }) => void;
  placeholder?: string;
  className?: string;
}

const LabTestCatalogInput: React.FC<Props> = ({ value, onChange, onSelect, placeholder = 'Test name', className = '' }) => {
  const [results, setResults] = useState<CatalogTest[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const picked = useRef<string | null>(null);
  const ticket = useRef(0);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const term = value.trim();
    if (term.length < 2 || picked.current === value) {
      setResults([]);
      setOpen(false);
      return;
    }
    const mine = ++ticket.current;
    const t = setTimeout(async () => {
      setLoading(true);
      setFailed(false);
      try {
        const { data } = await apiClient.get('/lab/test-catalog', { params: { search: term } });
        if (mine !== ticket.current) return; // a newer search is running
        setResults(((data.tests || []) as CatalogTest[]).slice(0, 8));
        setActive(0);
        setOpen(true);
      } catch {
        if (mine !== ticket.current) return;
        setResults([]);
        setFailed(true);
        setOpen(true);
      } finally {
        if (mine === ticket.current) setLoading(false);
      }
    }, 250);
    return () => clearTimeout(t);
  }, [value]);

  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  const choose = (t: CatalogTest) => {
    picked.current = t.test_name;
    onChange(t.test_name);
    onSelect?.({ test_name: t.test_name, test_code: t.test_code });
    setOpen(false);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!open || results.length === 0) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(a + 1, results.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
    else if (e.key === 'Enter') { e.preventDefault(); choose(results[active]); }
    else if (e.key === 'Escape') setOpen(false);
  };

  const price = (p: CatalogTest['base_price']) => {
    const n = Number(p);
    return Number.isFinite(n) && n > 0 ? `GHS ${n.toFixed(2)}` : 'price not set';
  };

  return (
    <div ref={box} className="relative">
      <input
        type="text"
        value={value}
        onChange={(e) => { picked.current = null; onChange(e.target.value); }}
        onKeyDown={onKeyDown}
        onFocus={() => results.length > 0 && setOpen(true)}
        placeholder={placeholder}
        className={className}
        autoComplete="off"
        role="combobox"
        aria-expanded={open}
        aria-autocomplete="list"
        aria-label="Lab test"
      />
      {open && (
        <div role="listbox" className="absolute z-50 w-full mt-1 bg-ds-surface border border-ds-border rounded-ds-control shadow-ds-overlay max-h-64 overflow-y-auto">
          {loading && results.length === 0 && (
            <div className="px-3 py-2 text-sm text-ds-text-muted">Searching the lab price list…</div>
          )}
          {failed && (
            <div className="px-3 py-2 text-sm text-ds-warning-text">Couldn't search the lab price list. You can still type the test name.</div>
          )}
          {!loading && !failed && results.length === 0 && (
            <div className="px-3 py-2 text-sm text-ds-text-muted">Not in the lab price list — the lab will price it.</div>
          )}
          {results.map((t, i) => (
            <button
              type="button"
              role="option"
              aria-selected={i === active}
              key={t.test_code}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => choose(t)}
              className={`min-h-ds-touch w-full text-left px-3 py-2 text-sm flex justify-between gap-3 ${
                i === active ? 'bg-ds-accent-soft text-ds-text' : 'text-ds-text hover:bg-ds-subtle'
              }`}
            >
              <span>{t.test_name}</span>
              <span className="text-ds-text-muted whitespace-nowrap">{price(t.base_price)}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

export default LabTestCatalogInput;
