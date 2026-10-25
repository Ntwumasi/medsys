// Generates src/styles/tokens.css from src/styles/design-tokens.json.
// Run: npm run tokens   (re-run after editing the JSON; commit both files)
import { readFileSync, writeFileSync } from 'node:fs';

const t = JSON.parse(readFileSync(new URL('../src/styles/design-tokens.json', import.meta.url), 'utf8'));
const rgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)).join(' ');
const kebab = (k) => k.replace(/[A-Z]/g, (c) => '-' + c.toLowerCase());
const block = (mode) =>
  Object.entries(t.color[mode]).map(([k, v]) => `  --ds-${kebab(k)}: ${rgb(v.value)};`).join('\n');

const css = `/*
 * MedSys design tokens — direction C · Care.
 * GENERATED from design-tokens.json by scripts/generate-tokens.mjs — edit the JSON, not this file.
 * Colours are space-separated RGB channels so Tailwind can apply opacity:
 *   bg-ds-surface, text-ds-text-muted, border-ds-border-control, bg-ds-critical/10 …
 * Light is the default; dark applies under the \`.dark\` class (tailwind darkMode: 'class').
 * Tenant (white-label) colours — every token marked "tenant" in the JSON — may be
 * overridden at runtime by applyTenantAccent(); semantic colours never are.
 */
:root {
${block('light')}
  --ds-font-sans: ${t.font.sans};
  --ds-font-mono: ${t.font.mono};
  --ds-shadow-card: ${t.shadow.card};
  --ds-shadow-overlay: ${t.shadow.overlay};
  --ds-motion-fast: ${t.motion.fast};
  --ds-motion-base: ${t.motion.base};
  --ds-motion-slow: ${t.motion.slow};
  --ds-ease: ${t.motion.easing};
  --ds-ease-exit: ${t.motion.exitEasing};
}

.dark {
${block('dark')}
  --ds-shadow-card: ${t.shadow.cardDark};
  --ds-shadow-overlay: ${t.shadow.overlayDark};
}

@media (prefers-reduced-motion: reduce) {
  :root {
    --ds-motion-fast: 1ms;
    --ds-motion-base: 1ms;
    --ds-motion-slow: 1ms;
  }
}
`;
writeFileSync(new URL('../src/styles/tokens.css', import.meta.url), css);
console.log('tokens.css written');
