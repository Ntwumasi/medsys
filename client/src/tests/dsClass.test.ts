import { describe, it, expect, afterEach } from 'vitest';
import { toDsClasses, dsClass } from '../utils/dsClass';

describe('legacy → design-system class bridge', () => {
  afterEach(() => { delete document.documentElement.dataset.ds; });

  it('maps legacy colours to tokens and keeps everything else', () => {
    expect(toDsClasses('px-4 py-2 bg-white text-gray-900 border border-gray-200 rounded-lg'))
      .toBe('px-4 py-2 bg-ds-surface text-ds-text border border-ds-border rounded-lg');
  });

  it('keeps text readable on fills that turn light in dark mode', () => {
    expect(toDsClasses('bg-primary-600 hover:bg-primary-700 text-white')).toBe('bg-ds-accent hover:bg-ds-accent-hover text-ds-on-accent');
    expect(toDsClasses('text-white bg-warning-600')).toBe('text-white dark:text-ds-canvas bg-ds-warning');
    expect(toDsClasses('bg-danger-600 text-white')).toBe('bg-ds-critical text-white');
  });

  it('only translates while a migrated screen is open', () => {
    expect(dsClass('bg-white')).toBe('bg-white');
    document.documentElement.dataset.ds = 'on';
    expect(dsClass('bg-white')).toBe('bg-ds-surface');
  });
});
