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
import { ChevronDown, Crosshair, Minus, Navigation, Plus } from "lucide-react";
import { useTourStore } from "@/features/tour/store";
import { useMobileVisibility } from "@/hooks/useMobileVisibility";
import { attachWebGLContextRecovery } from "@/shared/lib/webglRecovery";

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
  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false);

  const locations = useTourStore((s) => s.locations);
  const { isMobileLandscape, canShowNavLinks, canShowCollapsedPanels } = useMobileVisibility();

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

  // ── Init Pannellum viewer ──
  useEffect(() => {
    if (!containerRef.current || !imageUrl) return;

    setIsLoaded(false);
    setHasError(false);

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
  }, [imageUrl, initialHfov, initialPitch, initialYaw]);

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

      {isLoaded &&
        !hasError &&
        links &&
        links.length > 0 &&
        onNavigate &&
        canShowNavLinks &&
        isMobileLandscape && (
          <div
            className={`absolute z-20 flex flex-col gap-2 pointer-events-auto ${
              isMobileNavOpen ? "w-[184px]" : "w-11"
            }`}
            style={{
              top: "var(--mt-edge)",
              left: "calc(var(--ml-edge) + 198px)",
            }}
          >
            <button
              type="button"
              onClick={() => setIsMobileNavOpen((open) => !open)}
              className={`flex h-11 items-center rounded-xl border border-white/12 bg-[#0b1220]/68 text-white shadow-[0_10px_26px_rgba(0,0,0,0.24)] backdrop-blur-2xl outline-none focus-visible:ring-2 focus-visible:ring-[#8eb2f0]/80 ${
                isMobileNavOpen ? "gap-2 px-3" : "justify-center px-0"
              }`}
              aria-expanded={isMobileNavOpen}
              aria-label="Mở danh sách điểm đến"
            >
              <Navigation className="h-4 w-4 text-[#a9c7ff]" />
              {isMobileNavOpen && (
                <>
                  <span className="flex-1 text-left text-[12px] font-semibold">Điểm đến</span>
                  <span className="rounded-full bg-white/10 px-1.5 py-0.5 text-[10px] text-white/65">
                    {links.length}
                  </span>
                  <ChevronDown className="h-4 w-4 rotate-180 text-white/55" />
                </>
              )}
            </button>

            <AnimatePresence initial={false}>
              {isMobileNavOpen && (
                <motion.div
                  className="flex flex-col gap-1.5"
                  initial={{ opacity: 0, y: -6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                >
                  {links.slice(0, 4).map((link) => {
                    const targetLoc = locations.find(
                      (item) => item.slug === link.toSlug,
                    );
                    const displayName = targetLoc?.name || link.label;

                    return (
                      <motion.button
                        key={link.toSlug}
                        onClick={() => {
                          setIsMobileNavOpen(false);
                          onNavigate(link.toSlug);
                        }}
                        className="group flex min-h-10 items-center gap-2 rounded-2xl border border-white/10 bg-[#0b1220]/68 px-3 text-left text-white shadow-[0_8px_22px_rgba(0,0,0,0.2)] backdrop-blur-2xl transition-colors hover:bg-[#0b1220]/84"
                        whileTap={{ scale: 0.97 }}
                      >
                        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-white/10 text-sm text-white/70">
                          →
                        </span>
                        <span className="min-w-0 max-w-[126px] truncate text-[11px] font-semibold text-white/90">
                          {displayName}
                        </span>
                      </motion.button>
                    );
                  })}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}

      {isLoaded && !hasError && links && links.length > 0 && onNavigate && canShowNavLinks && !isMobileLandscape && (
        <div className={`absolute -translate-y-1/2 z-20 flex flex-col gap-1.5 pointer-events-auto ${
          isMobileLandscape ? "top-[38%] w-[140px]" : "top-[57%] left-5 w-[190px]"
        }`}
          style={isMobileLandscape ? { left: 'var(--ml-edge)' } : undefined}
        >
          {(isMobileLandscape ? links.slice(0, 3) : links).map((link) => {
            const targetLoc = locations.find((l) => l.slug === link.toSlug);
            const displayName = targetLoc ? targetLoc.name : link.label;

            return (
              <motion.button
                key={link.toSlug}
                onClick={() => onNavigate(link.toSlug)}
                className={`flex items-center gap-2 rounded-full bg-[#121511]/34 py-1.5 text-white shadow-[0_8px_20px_rgba(0,0,0,0.18)] backdrop-blur-xl transition-colors hover:bg-[#121511]/54 group cursor-pointer ${
                  isMobileLandscape ? "min-h-10 px-2" : "min-h-10 px-3.5"
                }`}
                whileHover={{ scale: 1.015, x: 3 }}
                whileTap={{ scale: 0.95 }}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
              >
                <span className="text-base leading-none text-white/75 transition-colors group-hover:text-white">
                  →
                </span>
                <span className={`min-w-0 truncate font-bold leading-tight text-white/90 ${
                  isMobileLandscape ? "max-w-[100px] text-[11px]" : "max-w-[145px] text-[13px]"
                }`}>
                  {displayName}
                </span>
              </motion.button>
            );
          })}
        </div>
      )}

      {/* Compact panorama controls */}
      {isLoaded && !hasError && canShowCollapsedPanels && (
        <div className={`absolute z-20 flex items-center rounded-2xl border border-white/15 bg-[#0b1220]/72 text-white shadow-[0_10px_30px_rgba(0,0,0,0.28)] backdrop-blur-2xl pointer-events-auto ${
          isMobileLandscape ? "gap-0 p-1" : "bottom-6 left-6 gap-1 p-1.5"
        }`}
          style={isMobileLandscape ? { bottom: "var(--mb-edge)", left: "var(--ml-edge)" } : undefined}
        >
          <button
            type="button"
            onClick={() => adjustZoom(-12)}
            className={`rounded-full text-white/85 hover:text-white hover:bg-white/10 active:scale-95 transition-all flex items-center justify-center ${
              isMobileLandscape ? "w-9 h-9" : "w-9 h-9"
            }`}
            title="Phóng to"
            aria-label="Phóng to"
          >
            <Plus className="h-[18px] w-[18px]" strokeWidth={2.3} />
          </button>
          <button
            type="button"
            onClick={() => adjustZoom(12)}
            className={`rounded-full text-white/85 hover:text-white hover:bg-white/10 active:scale-95 transition-all flex items-center justify-center ${
              isMobileLandscape ? "w-9 h-9" : "w-9 h-9"
            }`}
            title="Thu nhỏ"
            aria-label="Thu nhỏ"
          >
            <Minus className="h-[18px] w-[18px]" strokeWidth={2.3} />
          </button>
          <div className="w-px h-5 bg-white/12" />
          <button
            type="button"
            onClick={resetView}
            className={`rounded-full text-white/85 hover:text-white hover:bg-white/10 active:scale-95 transition-all flex items-center justify-center ${
              isMobileLandscape ? "w-9 h-9" : "w-9 h-9"
            }`}
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
