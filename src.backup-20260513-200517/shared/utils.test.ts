import { describe, it, expect, afterEach } from 'vitest';
import { proxyUrl, getPreviewScale, A4_WIDTH_PX, A4_HEIGHT_PX } from './utils';

describe('proxyUrl', () => {
  it('appends cb param when url has no query', () => {
    expect(proxyUrl('https://example.com/img.png', 1)).toBe(
      'https://example.com/img.png?cb=1'
    );
  });

  it('appends cb param with & when url has query', () => {
    expect(proxyUrl('https://example.com/img.png?w=100', 2)).toBe(
      'https://example.com/img.png?w=100&cb=2'
    );
  });

  it('returns empty string for empty url', () => {
    expect(proxyUrl('', 1)).toBe('');
  });
});

describe('getPreviewScale', () => {
  const originalInnerWidth = window.innerWidth;

  afterEach(() => {
    Object.defineProperty(window, 'innerWidth', {
      value: originalInnerWidth,
      writable: true,
    });
  });

  it('returns 1 when window is wider than A4', () => {
    Object.defineProperty(window, 'innerWidth', {
      value: 1200,
      writable: true,
    });
    expect(getPreviewScale(32)).toBe(1);
  });

  it('returns scale < 1 when window is narrower than A4', () => {
    Object.defineProperty(window, 'innerWidth', {
      value: 400,
      writable: true,
    });
    const scale = getPreviewScale(32);
    expect(scale).toBeLessThan(1);
    expect(scale).toBeGreaterThan(0);
    expect(scale).toBeCloseTo((400 - 32) / A4_WIDTH_PX, 5);
  });

  it('uses custom padding when provided', () => {
    Object.defineProperty(window, 'innerWidth', {
      value: 800,
      writable: true,
    });
    expect(getPreviewScale(0)).toBeGreaterThan(getPreviewScale(32));
  });
});

describe('A4 constants', () => {
  it('A4_WIDTH_PX is 794', () => {
    expect(A4_WIDTH_PX).toBe(794);
  });
  it('A4_HEIGHT_PX is 1123', () => {
    expect(A4_HEIGHT_PX).toBe(1123);
  });
});
