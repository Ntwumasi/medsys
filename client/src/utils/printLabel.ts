/**
 * Prints one pharmacy label on a roll label printer (e.g. Zebra ZD411).
 *
 * Why a new window: window.print() on the dashboard printed the whole page,
 * which the label printer split across a dozen labels. The new window holds
 * only the label, with an @page size equal to one label, and shrinks the text
 * until everything fits on that one label.
 */

export interface LabelSize {
  id: string;
  label: string;
  widthMm: number;
  heightMm: number;
}

/** Common roll sizes. 60 x 40 mm = 2.36" x 1.60", what the pharmacy's driver is set to. */
export const LABEL_SIZES: LabelSize[] = [
  { id: '60x40', label: '60 × 40 mm (2.36" × 1.6")', widthMm: 60, heightMm: 40 },
  { id: '57x32', label: '57 × 32 mm (2.25" × 1.25")', widthMm: 57, heightMm: 32 },
  { id: '76x51', label: '76 × 51 mm (3" × 2")', widthMm: 76, heightMm: 51 },
  { id: '100x50', label: '100 × 50 mm (4" × 2")', widthMm: 100, heightMm: 50 },
];

const STORAGE_KEY = 'pharmacy-label-size';
const ROTATE_KEY = 'pharmacy-label-rotate';

/**
 * Some label printers (Zebra ZD411 driver) feed a wide label as a portrait
 * page and turn the print sideways. Rotating sends a portrait page with the
 * label turned 90°, so it lands the right way on the roll. Per workstation.
 */
export const getSavedLabelRotate = (): boolean => {
  try {
    return localStorage.getItem(ROTATE_KEY) === '1';
  } catch {
    return false;
  }
};

export const saveLabelRotate = (rotate: boolean): void => {
  try {
    localStorage.setItem(ROTATE_KEY, rotate ? '1' : '0');
  } catch {
    /* not remembered in private mode */
  }
};

/** The size is a property of the roll in this workstation's printer, so it is remembered per browser. */
export const getSavedLabelSize = (): LabelSize => {
  try {
    const id = localStorage.getItem(STORAGE_KEY);
    return LABEL_SIZES.find((s) => s.id === id) || LABEL_SIZES[0];
  } catch {
    return LABEL_SIZES[0];
  }
};

export const saveLabelSize = (id: string): void => {
  try {
    localStorage.setItem(STORAGE_KEY, id);
  } catch {
    /* private mode: the choice just isn't remembered */
  }
};

export interface LabelContent {
  clinicName: string;
  patientName: string;
  patientNumber: string;
  medication: string;
  dosage: string;
  take: string;
  route: string;
  quantity: string;
  refills: string;
  prescriber: string;
  notes: string;
  dispensedOn: string;
}

const esc = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const row = (k: string, v: string): string =>
  v.trim() ? `<div class="row"><span class="k">${esc(k)}</span> <span class="v">${esc(v)}</span></div>` : '';

/** Returns false when the browser blocked the pop-up. */
export const printPharmacyLabel = (c: LabelContent, size: LabelSize, rotate = false): boolean => {
  const w = window.open('', '_blank', 'width=480,height=400');
  if (!w) return false;

  const pad = 1.5; // mm; thermal printers can't print to the very edge
  const W = size.widthMm;
  const H = size.heightMm;
  // Rotated: the page is H wide and W tall, and the W x H label is turned 90°
  // clockwise inside it (rotate about the top-left corner, then shift right by H).
  const pageW = rotate ? H : W;
  const pageH = rotate ? W : H;
  const turn = rotate
    ? `position: absolute; top: 0; left: 0; transform-origin: top left; transform: translateX(${H}mm) rotate(90deg);`
    : '';
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>Label</title>
<style>
  @page { size: ${pageW}mm ${pageH}mm; margin: 0; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  html, body { width: ${pageW}mm; height: ${pageH}mm; overflow: hidden; background: #fff; color: #000; position: relative; }
  body { font-family: Arial, Helvetica, sans-serif; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  #label { width: ${W}mm; height: ${H}mm; padding: ${pad}mm; overflow: hidden; ${turn} }
  #fit { font-size: 9pt; line-height: 1.15; }
  .head { display: flex; justify-content: space-between; gap: 2mm; font-weight: 700; border-bottom: 0.3mm solid #000; padding-bottom: 0.5mm; margin-bottom: 0.7mm; }
  .clinic { white-space: nowrap; }
  .patient { font-weight: 700; }
  .med { font-weight: 700; font-size: 1.25em; margin-top: 0.5mm; }
  .take { font-weight: 700; margin: 0.5mm 0; }
  .row .k { font-weight: 700; }
  .notes { margin-top: 0.5mm; font-style: italic; }
  .foot { display: flex; justify-content: space-between; gap: 2mm; margin-top: 0.7mm; border-top: 0.3mm solid #000; padding-top: 0.5mm; font-size: 0.85em; }
</style></head><body><div id="label"><div id="fit">
  <div class="head"><span class="clinic">${esc(c.clinicName)}</span><span>${esc(c.patientNumber)}</span></div>
  <div class="patient">${esc(c.patientName)}</div>
  <div class="med">${esc([c.medication, c.dosage].filter((s) => s.trim()).join(' '))}</div>
  ${c.take.trim() ? `<div class="take">${esc(c.take)}</div>` : ''}
  ${row('Route:', c.route)}
  ${row('Qty:', [c.quantity, c.refills && c.refills !== '0' ? `· Refills: ${c.refills}` : ''].filter(Boolean).join(' '))}
  ${c.notes.trim() ? `<div class="notes">${esc(c.notes)}</div>` : ''}
  <div class="foot"><span>${esc(c.prescriber)}</span><span>${esc(c.dispensedOn)}</span></div>
</div></div>
<script>
  // Shrink the text until the whole label fits on one label, then print once.
  (function () {
    var box = document.getElementById('label');
    var fit = document.getElementById('fit');
    var cs = getComputedStyle(box);
    var room = box.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
    var size = 9;
    while (size > 4.5 && fit.offsetHeight > room) {
      size -= 0.25;
      fit.style.fontSize = size + 'pt';
    }
    window.onafterprint = function () { window.close(); };
    setTimeout(function () { window.focus(); window.print(); }, 150);
  })();
</script></body></html>`;

  w.document.open();
  w.document.write(html);
  w.document.close();
  return true;
};
