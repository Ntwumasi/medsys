#!/usr/bin/env node
/**
 * Generates src/utils/dsClassMap.generated.ts: a legacy-colour-class → "Care"
 * design-system-token map for every legacy colour class used anywhere in
 * client/src. utils/dsClass.ts layers its hand-written entries on top.
 *
 * Rules (docs/design-system.md): colour families collapse onto semantic
 * roles — rose/red/danger → critical, orange/amber/yellow/warning → warning,
 * green/emerald/lime/success → success, blue/indigo/cyan/sky → info,
 * teal/primary → accent, purple/pink/violet/fuchsia/secondary → brand plum,
 * gray/slate/… → neutrals. The shade picks soft fill / solid fill / text /
 * border. Entries are written out literally because Tailwind only generates
 * classes it can find in the source.
 *
 * Run after migrating a screen that uses new legacy classes:
 *   node scripts/generate-ds-class-map.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'src');
const OUT = path.join(root, 'utils', 'dsClassMap.generated.ts');

const FAMILY = {
  primary: 'accent', teal: 'accent',
  secondary: 'plum', purple: 'plum', pink: 'plum', violet: 'plum', fuchsia: 'plum',
  success: 'success', green: 'success', emerald: 'success', lime: 'success',
  warning: 'warning', orange: 'warning', amber: 'warning', yellow: 'warning',
  danger: 'critical', red: 'critical', rose: 'critical',
  blue: 'info', indigo: 'info', cyan: 'info', sky: 'info',
  gray: 'neutral', slate: 'neutral', zinc: 'neutral', neutral: 'neutral', stone: 'neutral',
};

// soft fill, solid fill, text, light border, strong border
const ROLE = {
  accent: { soft: 'accent-soft', fill: 'accent', text: 'accent-text', borderL: 'accent/30', borderS: 'accent' },
  plum: { soft: 'subtle', fill: 'brand-plum', text: 'brand-plum', borderL: 'border', borderS: 'brand-plum' },
  success: { soft: 'success-soft', fill: 'success', text: 'success-text', borderL: 'success/30', borderS: 'success' },
  warning: { soft: 'warning-soft', fill: 'warning', text: 'warning-text', borderL: 'warning-border', borderS: 'warning' },
  critical: { soft: 'critical-soft', fill: 'critical', text: 'critical-text', borderL: 'critical-border', borderS: 'critical' },
  info: { soft: 'info-soft', fill: 'info', text: 'info-text', borderL: 'info/30', borderS: 'info' },
};

const neutral = (util, shade) => {
  if (util === 'bg' || util === 'from' || util === 'to' || util === 'via') {
    if (shade <= 100) return 'subtle';
    if (shade <= 200) return 'border';
    if (shade <= 400) return 'border-control';
    if (shade <= 600) return 'text-muted';
    return 'text';
  }
  if (util === 'text' || util === 'placeholder') {
    if (shade <= 200) return 'canvas';
    if (shade <= 500) return 'text-muted';
    if (shade <= 700) return 'text-secondary';
    return 'text';
  }
  // border / divide / ring / outline
  return shade <= 200 ? 'border' : 'border-control';
};

const target = (cls) => {
  const m = cls.match(/^((?:[a-z-]+:)*)(bg|text|border(?:-[lrtbxy])?|ring|from|to|via|divide|outline|placeholder)-([a-z]+)-(\d+)(\/\d+)?$/);
  if (!m) return null;
  const [, prefix, util, fam, shadeStr, opacity = ''] = m;
  const role = FAMILY[fam];
  if (!role) return null;
  const shade = Number(shadeStr);
  const hover = /(^|:)hover:$/.test(prefix) || prefix.endsWith('hover:');
  const disabled = prefix.includes('disabled:');
  let token;
  if (role === 'neutral') {
    token = neutral(util.startsWith('border') ? 'border' : util, shade);
  } else {
    const r = ROLE[role];
    if (util === 'bg' || util === 'from' || util === 'to' || util === 'via') {
      token = shade <= 200 ? r.soft : r.fill;
      if (util === 'bg' && hover && shade >= 300) token = `${r.fill}/90`;
      if (util === 'bg' && disabled && shade >= 300) token = `${r.fill}/50`;
    } else if (util === 'text' || util === 'placeholder') {
      // Very light text sits on a solid fill.
      // Very light text sits on a solid fill. Critical stays a dark fill in
      // dark mode, so white is right there; other fills turn light.
      if (shade <= 200 && role === 'critical') return `${prefix}${util}-white`;
      token = shade <= 200 ? (role === 'accent' ? 'on-accent' : 'surface') : r.text;
    } else if (util === 'ring' || util === 'outline') {
      token = shade <= 300 ? `${r.fill}/30` : r.fill;
      if (role === 'accent') token = shade <= 300 ? 'focus-ring/30' : 'focus-ring';
    } else {
      token = shade <= 300 ? r.borderL : r.borderS;
    }
  }
  const out = `${prefix}${util}-ds-${token}`;
  return opacity && !token.includes('/') ? `${out}${opacity}` : out;
};

const files = [];
const walk = (dir) => {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p);
    else if (/\.(tsx|ts)$/.test(e.name) && !p.endsWith('.generated.ts')) files.push(p);
  }
};
walk(root);

const families = Object.keys(FAMILY).join('|');
const re = new RegExp(`(?<![\\w-])((?:[a-z-]+:)*(?:bg|text|border(?:-[lrtbxy])?|ring|from|to|via|divide|outline|placeholder)-(?:${families})-\\d{2,3}(?:\\/\\d+)?)(?![\\w/-])`, 'g');
const found = new Set();
for (const f of files) for (const m of fs.readFileSync(f, 'utf8').matchAll(re)) found.add(m[1]);

const entries = [...found].sort().map((c) => [c, target(c)]).filter(([, t]) => t);
fs.writeFileSync(OUT, `// GENERATED by scripts/generate-ds-class-map.mjs — do not edit by hand.
// Legacy colour class → "Care" token, for every legacy colour class used in
// client/src. Hand-written entries in utils/dsClass.ts take precedence.
export const GENERATED_DS_CLASS_MAP: Record<string, string> = {
${entries.map(([k, v]) => `  '${k}': '${v}',`).join('\n')}
};
`);
console.log(`Wrote ${entries.length} entries to ${path.relative(process.cwd(), OUT)}`);
