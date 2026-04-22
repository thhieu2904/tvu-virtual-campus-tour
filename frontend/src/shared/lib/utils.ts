/**
 * Shared utility functions.
 */

/**
 * Preload an image by URL — returns a promise that resolves when loaded.
 */
export function preloadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = url;
  });
}

/**
 * Format milliseconds to human-readable string.
 */
export function formatMs(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

/**
 * Generate a simple UUID v4 (for session IDs on client).
 */
export function generateId(): string {
  return crypto.randomUUID();
}

/**
 * Clamp a number between min and max.
 */
export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
