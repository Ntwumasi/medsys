import type { PresenceStatus, KudosTag } from '../types';

// Presence display metadata. Kept out of the component file so the components
// module only exports components (react-refresh rule).
export const PRESENCE_META: Record<PresenceStatus, { label: string; dot: string; text: string }> = {
  online: { label: 'Online', dot: 'bg-emerald-500', text: 'text-emerald-700' },
  on_call: { label: 'On call', dot: 'bg-amber-500', text: 'text-amber-700' },
  away: { label: 'Away', dot: 'bg-gray-400', text: 'text-gray-500' },
};

export const PRESENCE_OPTIONS: PresenceStatus[] = ['online', 'on_call', 'away'];
export const presenceLabel = (s: PresenceStatus) => PRESENCE_META[s]?.label ?? s;

export const KUDOS_TAGS: KudosTag[] = ['Teamwork', 'Lifesaver', 'Mentor', 'Kindness', 'Reliability'];

export const TAG_STYLE: Record<KudosTag, string> = {
  Teamwork: 'bg-primary-50 text-primary-700',
  Lifesaver: 'bg-red-50 text-red-700',
  Mentor: 'bg-secondary-50 text-secondary-700',
  Kindness: 'bg-pink-50 text-pink-700',
  Reliability: 'bg-emerald-50 text-emerald-700',
};
