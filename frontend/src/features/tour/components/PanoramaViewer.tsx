/* eslint-disable react-hooks/set-state-in-effect */
"use client";

/**
 * PanoramaViewer — Reusable 360° viewer component.
 *
 * Wraps Pannellum in a React component.
 * Just pass `imageUrl` prop → it renders the 360° scene.
 * When imageUrl changes (user navigates) → viewer reloads seamlessly.
 *
 * Reference: src-tham-khao/vercel-360-gallery/index.html
 */

import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Crosshair, Minus, Plus } from "lucide-react";
import { useTourStore } from "@/features/tour/store";
import { attachWebGLContextRecovery } from "@/shared/lib/webglRecovery";
import { preloadPanorama, isPanoramaCached } from "@/shared/lib/imageCache";

const PANNELLUM_CSS_URL = "/lib/pannellum/pannellum.css";
const PANNELLUM_SCRIPT_URL = "/lib/pannellum/pannellum.js";
let pannellumLoadPromise: Promise<void> | null = null;

type PannellumViewerInstance = {
  destroy?: () => void;
  getHfov?: () => number;
  lookAt?: (pitch: number, yaw: number, hfov: number, duration?: number) => void;
  on: (event: "load" | "error", handler: () => void) => void;
  setHfov?: (hfov: number, duration?: number) => void;
  setPitch?: (pitch: number, duration?: number) => void;
  setYaw?: (yaw: number, duration?: number) => void;
};

type PannellumGlobal = {
  viewer: (
    container: HTMLElement,
    config: Record<string, unknown>,
  ) => PannellumViewerInstance;
};

declare global {
  interface Window {
    pannellum?: PannellumGlobal;
  }
}

function loadPannellumScript() {
  if (window.pannellum) return Promise.resolve();
  if (pannellumLoadPromise) return pannellumLoadPromise;

  pannellumLoadPromise = new Promise<void>((resolve, reject) => {
    const existingScript = document.querySelector<HTMLScriptElement>(
      `script[src$="${PANNELLUM_SCRIPT_URL}"]`,
    );

    const handleError = () => {
      pannellumLoadPromise = null;
      reject(new Error("Failed to load Pannellum"));
    };

    if (existingScript) {
      existingScript.addEventListener("load", () => resolve(), { once: true });
      existingScript.addEventListener("error", handleError, { once: true });
      return;
    }

    const script = document.createElement("script");
    script.src = PANNELLUM_SCRIPT_URL;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = handleError;
    document.head.appendChild(script);
  });

  return pannellumLoadPromise;
}

interface PanoramaViewerProps {
  imageUrl: string;
  initialHfov?: number;
  initialPitch?: number;
  initialYaw?: number;
  isTransitioning?: boolean;
  links?: { toSlug: string; label: string }[];
  onNavigate?: (slug: string) => void;
  onLoad?: () => void;
}

export default function PanoramaViewer({
  imageUrl,
  initialHfov = 100,
  initialPitch = 0,
  initialYaw = 0,
  isTransitioning = false,
  links = [],
  onNavigate,
  onLoad,
}: PanoramaViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<PannellumViewerInstance | null>(null);
  const webglRecoveryCleanupRef = useRef<(() => void) | null>(null);
  const onLoadRef = useRef(onLoad);
  const [isLoaded, setIsLoaded] = useState(false);
  const [hasError, setHasError] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState<string | null>(null);
  // Track if the image has been pre-downloaded into browser cache
  const [isImageCached, setIsImageCached] = useState(false);
  
  const locations = useTourStore((s) => s.locations);

  useEffect(() => {
    onLoadRef.current = onLoad;
  }, [onLoad]);

  const adjustZoom = (delta: number) => {
    const viewer = viewerRef.current;
    if (!viewer) return;

    const currentHfov =
      typeof viewer.getHfov === "function" ? viewer.getHfov() : initialHfov;
    const nextHfov = Math.max(45, Math.min(120, currentHfov + delta));
    viewer.setHfov?.(nextHfov, 500);
  };

  const resetView = () => {
    const viewer = viewerRef.current;
    if (!viewer) return;

    if (typeof viewer.lookAt === "function") {
      viewer.lookAt(initialPitch, initialYaw, initialHfov, 800);
      return;
    }

    viewer.setPitch?.(initialPitch, 800);
    viewer.setYaw?.(initialYaw, 800);
    viewer.setHfov?.(initialHfov, 800);
  };

  // ── Phase 1: Pre-download image into browser cache (via centralized imageCache) ──
  useEffect(() => {
    if (!imageUrl) return;

    // If already cached (preloaded by adjacent-location system), skip download entirely
    if (isPanoramaCached(imageUrl)) {
      setIsImageCached(true);
      setIsLoaded(false);
      setHasError(false);
      setDownloadProgress(null);
      return;
    }

    const abortController = new AbortController();
    setIsImageCached(false);
    setIsLoaded(false);
    setHasError(false);
    setDownloadProgress(null);

    preloadPanorama(
      imageUrl,
      (receivedMB, totalMB) => setDownloadProgress(`${receivedMB} / ${totalMB} MB`),
      abortController.signal,
    )
      .then(() => {
        setDownloadProgress(null);
        setIsImageCached(true);
      })
      .catch((err) => {
        if (err instanceof DOMException && err.name === "AbortError") return;
        console.error("[PanoramaViewer] Image pre-download failed:", err);
        // Still allow Pannellum to try loading directly
        setIsImageCached(true);
      });

    return () => abortController.abort();
  }, [imageUrl]);

  // ── Phase 2: Init Pannellum only AFTER image is cached ──
  useEffect(() => {
    if (!containerRef.current || !imageUrl || !isImageCached) return;

    const loadPannellum = async () => {
      // Import CSS
      if (!document.querySelector('link[href*="pannellum"]')) {
        const link = document.createElement("link");
        link.rel = "stylesheet";
        link.href = PANNELLUM_CSS_URL;
        document.head.appendChild(link);
      }

      // Import JS
      await loadPannellumScript();

      initViewer();
    };

    const initViewer = () => {
      // Destroy previous viewer
      if (viewerRef.current) {
        try {
          webglRecoveryCleanupRef.current?.();
          webglRecoveryCleanupRef.current = null;
          viewerRef.current.destroy?.();
        } catch {
          // ignore
        }
        viewerRef.current = null;
      }

      // Create new viewer — image is already in browser cache,
      // so Pannellum will load from cache almost instantly.
      const pannellum = window.pannellum;
      if (!pannellum || !containerRef.current) return;

      viewerRef.current = pannellum.viewer(containerRef.current, {
        type: "equirectangular",
        panorama: imageUrl,
        autoLoad: true,
        showControls: false, // We use our own UI controls
        compass: false,
        hfov: initialHfov,
        pitch: initialPitch,
        yaw: initialYaw,
        keyboardZoom: true,
        mouseZoom: true,
        draggable: true,
        disableKeyboardCtrl: false,
      });

      viewerRef.current.on("load", () => {
        setIsLoaded(true);
        onLoadRef.current?.();
      });

      viewerRef.current.on("error", () => {
        setHasError(true);
        setIsLoaded(true);
        onLoadRef.current?.();
      });

      webglRecoveryCleanupRef.current?.();
      webglRecoveryCleanupRef.current = attachWebGLContextRecovery(
        containerRef.current,
        "panorama viewer",
      );
    };

    loadPannellum().catch((error) => {
      console.error(error);
      setHasError(true);
      setIsLoaded(true);
      onLoadRef.current?.();
    });

    return () => {
      webglRecoveryCleanupRef.current?.();
      webglRecoveryCleanupRef.current = null;

      if (viewerRef.current) {
        try {
          viewerRef.current.destroy?.();
        } catch {
          // ignore
        }
        viewerRef.current = null;
      }
    };
  }, [imageUrl, isImageCached, initialHfov, initialPitch, initialYaw]);

  return (
    <div className="absolute inset-0 z-0">
      {/* Pannellum container — hide built-in loading UI since we handle it ourselves */}
      <div ref={containerRef} className="w-full h-full [&_.pnlm-load-box]:!hidden [&_.pnlm-lbar]:!hidden [&_.pnlm-lbar-fill]:!hidden [&_.pnlm-lmsg]:!hidden" />

      <div className="pointer-events-none absolute inset-0 z-[5] bg-[linear-gradient(180deg,rgba(0,0,0,0.08)_0%,rgba(0,0,0,0)_35%,rgba(0,0,0,0)_58%,rgba(0,0,0,0.24)_100%)]" />

      {/* Loading overlay — shows our own progress instead of Pannellum's */}
      <AnimatePresence>
        {(!isLoaded || isTransitioning) && (
          <motion.div
            className="absolute inset-0 z-10 flex items-center justify-center bg-[#1a1a2e]"
            initial={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.5 }}
          >
            <div className="text-center">
              <div className="w-10 h-10 border-3 border-white/10 border-t-[#053384] rounded-full animate-spin mx-auto mb-3" />
              <p className="text-white/50 text-sm">Đang tải ảnh 360°...</p>
              {downloadProgress && (
                <p className="text-white/30 text-xs mt-1">{downloadProgress}</p>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Error state */}
      {hasError && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-gradient-to-br from-[#1a3a5c] via-[#2a5a8c] to-[#0a2a4c]">
          <div className="text-center text-white/40">
            <p className="text-5xl mb-3">🏛️</p>
            <p className="text-sm">Không thể tải ảnh 360°</p>
            <p className="text-xs mt-1 text-white/25">
              Vui lòng kiểm tra kết nối mạng
            </p>
          </div>
        </div>
      )}

      {/* Center Swipe Hint Tooltip */}
      {isLoaded && !hasError && (
        <motion.div
          className="absolute inset-0 z-10 flex items-center justify-center pointer-events-none"
          initial={{ opacity: 0 }}
          animate={{ opacity: [0, 1, 1, 0] }}
          transition={{ delay: 1, duration: 4, ease: "easeInOut" }}
        >
          <div className="flex items-center gap-4 bg-black/40 backdrop-blur-sm px-6 py-3 rounded-full text-white/90">
            <span className="animate-pulse">←</span>
            <span className="text-sm font-medium">Vuốt để xoay góc nhìn</span>
            <span className="animate-pulse">→</span>
          </div>
        </motion.div>
      )}

      {/* Navigation Links Overlay */}
      {isLoaded && !hasError && links && links.length > 0 && onNavigate && (
        <div className="absolute top-[57%] left-5 -translate-y-1/2 z-20 flex w-[190px] flex-col gap-2 pointer-events-auto">
          {links.map((link) => {
            const targetLoc = locations.find((l) => l.slug === link.toSlug);
            const displayName = targetLoc ? targetLoc.name : link.label;

            return (
              <motion.button
                key={link.toSlug}
                onClick={() => onNavigate(link.toSlug)}
                className="flex min-h-10 items-center gap-2 rounded-full bg-[#121511]/34 px-3.5 py-2 text-white shadow-[0_8px_20px_rgba(0,0,0,0.18)] backdrop-blur-xl transition-colors hover:bg-[#121511]/54 group cursor-pointer"
                whileHover={{ scale: 1.015, x: 3 }}
                whileTap={{ scale: 0.95 }}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
              >
                <span className="text-base leading-none text-white/75 transition-colors group-hover:text-white">
                  →
                </span>
                <span className="min-w-0 max-w-[145px] truncate text-[13px] font-bold leading-tight text-white/90">
                  {displayName}
                </span>
              </motion.button>
            );
          })}
        </div>
      )}

      {/* Compact panorama controls */}
      {isLoaded && !hasError && (
        <div className="absolute bottom-6 left-6 z-20 flex items-center gap-1 rounded-full border border-white/25 bg-black/45 p-1.5 text-white shadow-[0_10px_30px_rgba(0,0,0,0.28)] backdrop-blur-2xl pointer-events-auto">
          <button
            type="button"
            onClick={() => adjustZoom(-12)}
            className="w-9 h-9 rounded-full text-white/85 hover:text-white hover:bg-white/10 active:scale-95 transition-all flex items-center justify-center"
            title="Phóng to"
            aria-label="Phóng to"
          >
            <Plus className="h-[18px] w-[18px]" strokeWidth={2.3} />
          </button>
          <button
            type="button"
            onClick={() => adjustZoom(12)}
            className="w-9 h-9 rounded-full text-white/85 hover:text-white hover:bg-white/10 active:scale-95 transition-all flex items-center justify-center"
            title="Thu nhỏ"
            aria-label="Thu nhỏ"
          >
            <Minus className="h-[18px] w-[18px]" strokeWidth={2.3} />
          </button>
          <div className="w-px h-5 bg-white/12" />
          <button
            type="button"
            onClick={resetView}
            className="w-9 h-9 rounded-full text-white/85 hover:text-white hover:bg-white/10 active:scale-95 transition-all flex items-center justify-center"
            title="Về góc nhìn ban đầu"
            aria-label="Về góc nhìn ban đầu"
          >
            <Crosshair className="h-[18px] w-[18px]" strokeWidth={2.3} />
          </button>
        </div>
      )}
    </div>
  );
}
