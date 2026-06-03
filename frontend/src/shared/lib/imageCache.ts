/**
 * Centralized Image Cache — single source of truth for pre-downloaded images.
 *
 * Both the preload system (page.tsx) and PanoramaViewer use this module,
 * ensuring images are never downloaded twice.
 *
 * Flow:
 *   1. preload system calls `preloadPanorama(url)` for adjacent locations
 *   2. PanoramaViewer checks `isPanoramaCached(url)` before downloading
 *   3. If cached → skip download, init Pannellum immediately
 *   4. If not cached → download with progress, then init Pannellum
 */

type CacheEntry = {
  status: "loading" | "ready" | "error";
  promise: Promise<void>;
};

// In-memory map of URL → download status
const cache = new Map<string, CacheEntry>();

/**
 * Check if a panorama image is already downloaded and cached.
 */
export function isPanoramaCached(url: string): boolean {
  return cache.get(url)?.status === "ready";
}

/**
 * Get the in-flight download promise for a URL (if any).
 * Returns undefined if no download is in progress.
 */
export function getPanoramaDownloadPromise(url: string): Promise<void> | undefined {
  const entry = cache.get(url);
  if (entry && entry.status === "loading") return entry.promise;
  return undefined;
}

/**
 * Pre-download a panorama image into browser cache.
 * - If already cached or in-flight, returns the existing promise (no duplicate work).
 * - Uses `fetch()` so the image is cached at the HTTP level for Pannellum to pick up.
 * - Optionally reports download progress via `onProgress` callback.
 *
 * @param url          The image URL to preload
 * @param onProgress   Optional callback: (receivedMB, totalMB) for progress tracking
 * @param signal       Optional AbortSignal to cancel the download
 */
export function preloadPanorama(
  url: string,
  onProgress?: (receivedMB: string, totalMB: string) => void,
  signal?: AbortSignal,
): Promise<void> {
  // Already cached — resolve immediately
  const existing = cache.get(url);
  if (existing?.status === "ready") return Promise.resolve();
  // Already loading — return existing promise (but attach new progress if provided)
  if (existing?.status === "loading" && !onProgress) return existing.promise;

  const promise = (async () => {
    try {
      const response = await fetch(url, { signal });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      const contentLength = response.headers.get("content-length");
      const totalBytes = contentLength ? parseInt(contentLength, 10) : 0;

      if (totalBytes > 0 && response.body && onProgress) {
        // Stream-read with progress tracking
        const reader = response.body.getReader();
        const chunks: Uint8Array[] = [];
        let receivedBytes = 0;

        for (;;) {
          if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
          const { done, value } = await reader.read();
          if (done) break;
          if (value) {
            chunks.push(value);
            receivedBytes += value.length;
            onProgress(
              (receivedBytes / 1024 / 1024).toFixed(2),
              (totalBytes / 1024 / 1024).toFixed(2),
            );
          }
        }

        // Decode blob into browser's image cache
        const blob = new Blob(chunks as BlobPart[], {
          type: response.headers.get("content-type") || "image/jpeg",
        });
        const objectUrl = URL.createObjectURL(blob);
        await new Promise<void>((resolve, reject) => {
          const img = new Image();
          img.onload = () => resolve();
          img.onerror = () => reject(new Error("Image decode failed"));
          img.src = objectUrl;
        });
        URL.revokeObjectURL(objectUrl);
      } else {
        // No progress needed or no content-length — simple fetch to warm cache
        // Read the body to completion so it's cached by the browser
        await response.blob();
      }

      cache.set(url, { status: "ready", promise: Promise.resolve() });
    } catch (err) {
      // Don't cache AbortErrors — allow retry
      if (err instanceof DOMException && err.name === "AbortError") {
        cache.delete(url);
        throw err;
      }
      cache.set(url, { status: "error", promise: Promise.reject(err) });
      throw err;
    }
  })();

  cache.set(url, { status: "loading", promise });
  return promise;
}

/**
 * Clear cache for a specific URL or all URLs.
 */
export function clearPanoramaCache(url?: string): void {
  if (url) {
    cache.delete(url);
  } else {
    cache.clear();
  }
}
