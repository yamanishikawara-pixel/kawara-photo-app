import { describe, it, expect } from 'vitest';
import {
  storagePathFromUrl,
  isStorageUrl,
  canUpload,
  formatBytes,
  STORAGE_LIMIT_BYTES,
} from './storageUtils';

// ── storagePathFromUrl ───────────────────────────────────────
describe('storagePathFromUrl', () => {
  it('extracts path from standard Firebase Storage URL', () => {
    const url = 'https://firebasestorage.googleapis.com/v0/b/kawara-photo-app.appspot.com/o/photos%2Fabc%2Fimage.jpg?alt=media&token=xxx';
    expect(storagePathFromUrl(url)).toBe('photos/abc/image.jpg');
  });

  it('returns null for non-storage URL', () => {
    expect(storagePathFromUrl('https://example.com/image.jpg')).toBeNull();
  });

  it('returns null for empty string', () => {
    expect(storagePathFromUrl('')).toBeNull();
  });

  it('decodes URL-encoded characters', () => {
    const url = 'https://firebasestorage.googleapis.com/v0/b/bucket/o/users%2Fuid%2Ffile.pdf?alt=media';
    expect(storagePathFromUrl(url)).toBe('users/uid/file.pdf');
  });
});

// ── isStorageUrl ─────────────────────────────────────────────
describe('isStorageUrl', () => {
  it('returns true for valid Firebase Storage URL', () => {
    const url = 'https://firebasestorage.googleapis.com/v0/b/bucket/o/path%2Ffile.jpg?alt=media&token=x';
    expect(isStorageUrl(url)).toBe(true);
  });

  it('returns false for non-storage URL', () => {
    expect(isStorageUrl('https://example.com/img.png')).toBe(false);
  });

  it('returns false for empty string', () => {
    expect(isStorageUrl('')).toBe(false);
  });

  it('returns false for non-http string', () => {
    expect(isStorageUrl('data:image/png;base64,abc')).toBe(false);
  });
});

// ── canUpload ────────────────────────────────────────────────
describe('canUpload', () => {
  it('returns true when well within limit', () => {
    expect(canUpload(0, 1024)).toBe(true);
  });

  it('returns true when exactly at limit', () => {
    expect(canUpload(0, STORAGE_LIMIT_BYTES)).toBe(true);
  });

  it('returns false when exceeding limit', () => {
    expect(canUpload(STORAGE_LIMIT_BYTES, 1)).toBe(false);
  });

  it('returns false when combined exceeds limit', () => {
    expect(canUpload(STORAGE_LIMIT_BYTES - 100, 200)).toBe(false);
  });
});

// ── formatBytes ──────────────────────────────────────────────
describe('formatBytes', () => {
  it('formats 0 as 0 KB', () => {
    expect(formatBytes(0)).toBe('0 KB');
  });

  it('formats KB range', () => {
    expect(formatBytes(500 * 1024)).toMatch(/KB/);
  });

  it('formats MB range', () => {
    expect(formatBytes(5 * 1024 * 1024)).toMatch(/MB/);
  });

  it('formats GB range', () => {
    expect(formatBytes(2 * 1024 * 1024 * 1024)).toMatch(/GB/);
  });
});
