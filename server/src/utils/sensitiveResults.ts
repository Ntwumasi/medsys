/**
 * Tests and diagnoses that carry stigma (HIV, hepatitis B/C, sexually
 * transmitted infections, pregnancy). Phones are often shared, so the patient
 * portal never shows these by name, and a sensitive result is only released
 * once a doctor has reviewed it — never automatically after the 3-day delay.
 *
 * Calibrated on real prod test names (e.g. "Retroscreen", "hbsAg", "Hep BsAg",
 * "VDRL", "RPR + TPHA SCREEN", "HVS C/S", "B-HCG", "upt"). Word boundaries
 * matter: "sti" must not match "fasting".
 */
const SENSITIVE = new RegExp(
  [
    'hiv', 'aids', 'retro\\w*', 'cd4',
    'h?b\\s?s\\s?ag', 'hep(?:atitis)?\\s?[bc]', 'hcv', 'hbv',
    'vdrl', 'rpr', 'syphil\\w*', 'tpha',
    'gonor\\w*', 'chlamyd\\w*', 'herpes', 'hsv', 'hpv', 'trichomon\\w*',
    'sti', 'std', 'hvs', 'high vaginal', 'urethral', 'pap smear', 'semen',
    'pregnan\\w*', '\\w*-?hcg', 'upt',
    'abortion', 'miscarriage',
  ].map((p) => `\\b${p}\\b`).join('|'),
  'i'
);

export const isSensitiveClinical = (text: string | null | undefined): boolean =>
  !!text && SENSITIVE.test(text);

/** How a sensitive test is named in the portal until (and after) release. */
export const CONFIDENTIAL_TEST_LABEL = 'Confidential test';
export const CONFIDENTIAL_DIAGNOSIS_LABEL = 'Confidential — your doctor will discuss this with you';
export const CONFIDENTIAL_BILL_LINE = 'Laboratory test';
