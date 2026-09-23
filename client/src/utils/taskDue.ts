export type DueLevel = 'none' | 'overdue' | 'soon' | 'later';

export interface TaskDueMeta {
  level: DueLevel;
  dd: string;
  daysUntil: number | null;
  /** border + text classes for the date control */
  inputCls: string;
  /** short label to show beside the date, or null */
  badge: string | null;
}

/**
 * Colour a task's deadline by how close it is (feature: "colour-code by what's
 * getting close to the due date"). Overdue → red, within 3 days → amber, else
 * neutral. Completed tasks are never flagged. `todayIso` is the caller's
 * YYYY-MM-DD "today" so the util stays pure/testable.
 */
export function taskDueMeta(
  dueDate: string | null | undefined,
  done: boolean,
  todayIso: string
): TaskDueMeta {
  const dd = dueDate ? dueDate.slice(0, 10) : '';
  if (!dd || done) {
    return { level: 'none', dd, daysUntil: null, inputCls: 'border-gray-300 text-gray-700', badge: null };
  }
  const days = Math.round((Date.parse(`${dd}T00:00:00`) - Date.parse(`${todayIso}T00:00:00`)) / 86400000);
  if (days < 0) {
    return { level: 'overdue', dd, daysUntil: days, inputCls: 'border-danger-400 text-danger-700 font-semibold', badge: 'Overdue' };
  }
  if (days <= 3) {
    return {
      level: 'soon',
      dd,
      daysUntil: days,
      inputCls: 'border-amber-400 text-amber-700 font-semibold',
      badge: days === 0 ? 'Due today' : days === 1 ? 'Due tomorrow' : 'Due soon',
    };
  }
  return { level: 'later', dd, daysUntil: days, inputCls: 'border-gray-300 text-gray-700', badge: null };
}
