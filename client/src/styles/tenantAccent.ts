/**
 * White-label accent. A clinic supplies one brand colour; this derives the
 * tenant tokens (accent, hover, on-accent, soft, accent-text, focus ring) for
 * light and dark mode, with WCAG AA guaranteed:
 *  - accent and accent-text reach 4.5:1 on their surfaces (lightness is
 *    nudged until they do),
 *  - on-accent is white or near-black, whichever reads better.
 *
 * Semantic colours (critical, warning, success, info) are NEVER tenant-
 * controlled. A brand colour that would be mistaken for one — red/orange
 * (critical / warning) — is rejected and the default accent kept, so a red
 * logo can't make every button look like an alarm.
 */

export interface TenantTokens {
  accent: string;
  accentHover: string;
  onAccent: string;
  accentSoft: string;
  accentText: string;
  focusRing: string;
}

const SURFACE = { light: '#FFFFFF', dark: '#1C1A17' } as const;

type RGB = [number, number, number];
const toRgb = (hex: string): RGB => {
  const h = hex.replace('#', '');
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  return [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16)) as RGB;
};
const toHex = ([r, g, b]: RGB) =>
  '#' + [r, g, b].map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('').toUpperCase();

const luminance = (hex: string) => {
  const [r, g, b] = toRgb(hex).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

export const contrast = (a: string, b: string): number => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

const toHsl = (hex: string): [number, number, number] => {
  const [r, g, b] = toRgb(hex).map((v) => v / 255);
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h * 60, s, l];
};

const fromHsl = (h: number, s: number, l: number): string => {
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return toHex([f(0) * 255, f(8) * 255, f(4) * 255]);
};

const mix = (fg: string, alpha: number, bg: string) => {
  const a = toRgb(fg), b = toRgb(bg);
  return toHex([0, 1, 2].map((i) => a[i] * alpha + b[i] * (1 - alpha)) as RGB);
};

/** Move lightness toward `direction` until `colour` reaches `min` contrast on `bg`. */
const ensureContrast = (colour: string, bg: string, min: number, direction: 'darker' | 'lighter'): string => {
  const [h, s, initialL] = toHsl(colour);
  let l = initialL;
  let out = colour;
  for (let i = 0; i < 60 && contrast(out, bg) < min; i++) {
    l = direction === 'darker' ? l - 0.01 : l + 0.01;
    out = fromHsl(h, s, Math.max(0, Math.min(1, l)));
  }
  return out;
};

/** True when a colour would read as a clinical status (critical red / warning orange). */
export const clashesWithSemantics = (hex: string): boolean => {
  const [h, s] = toHsl(hex);
  return s > 0.35 && (h >= 330 || h <= 45);
};

export const deriveTenantTokens = (brandHex: string): { light: TenantTokens; dark: TenantTokens } | null => {
  if (!/^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.test(brandHex) || clashesWithSemantics(brandHex)) return null;
  const brand = toHex(toRgb(brandHex));

  const build = (mode: 'light' | 'dark'): TenantTokens => {
    const surface = SURFACE[mode];
    const accent = ensureContrast(brand, surface, 4.5, mode === 'light' ? 'darker' : 'lighter');
    const onAccent = contrast('#FFFFFF', accent) >= contrast('#111111', accent) ? '#FFFFFF' : '#111111';
    const accentSoft = mix(accent, mode === 'light' ? 0.12 : 0.14, surface);
    const accentText = ensureContrast(accent, accentSoft, 4.5, mode === 'light' ? 'darker' : 'lighter');
    const [h, s, l] = toHsl(accent);
    const accentHover = fromHsl(h, s, mode === 'light' ? Math.max(0, l - 0.07) : Math.min(1, l + 0.07));
    return { accent, accentHover, onAccent, accentSoft, accentText, focusRing: accent };
  };
  return { light: build('light'), dark: build('dark') };
};

const channels = (hex: string) => toRgb(hex).join(' ');
const VAR: Record<keyof TenantTokens, string> = {
  accent: '--ds-accent', accentHover: '--ds-accent-hover', onAccent: '--ds-on-accent',
  accentSoft: '--ds-accent-soft', accentText: '--ds-accent-text', focusRing: '--ds-focus-ring',
};

/**
 * Apply a clinic's brand colour for the current colour mode. Returns false
 * (and leaves the default accent) when the colour is invalid or would clash
 * with the clinical status colours.
 */
export const applyTenantAccent = (brandHex: string, mode: 'light' | 'dark', root: HTMLElement = document.documentElement): boolean => {
  const derived = deriveTenantTokens(brandHex);
  if (!derived) {
    console.warn(`[tenant] brand colour ${brandHex} rejected (invalid or reads as a status colour); keeping the default accent`);
    return false;
  }
  for (const [k, v] of Object.entries(derived[mode]) as [keyof TenantTokens, string][]) {
    root.style.setProperty(VAR[k], channels(v));
  }
  return true;
};
