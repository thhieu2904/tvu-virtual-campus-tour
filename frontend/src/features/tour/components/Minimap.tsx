"use client";

import { useState, useMemo, useEffect, useCallback, useRef, lazy, Suspense, type ReactNode } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useTourStore } from "@/features/tour/store";
import Image from "next/image";
import { Info, Map as MapIcon, Navigation, Route, X } from "lucide-react";

import CampusMap, {
  getCoordsBySlug,
  getPathPoints,
} from "./CampusMap";

const AStarExplainer = lazy(() => import("./AStarExplainer"));

export default function Minimap() {
  const activeOverlay = useTourStore((s) => s.activeOverlay);
  const setActiveOverlay = useTourStore((s) => s.setActiveOverlay);
  const expanded = activeOverlay === "map";
  const setExpanded = (val: boolean) => setActiveOverlay(val ? "map" : "none");

  const locations = useTourStore((s) => s.locations);
  const currentSlug = useTourStore((s) => s.currentLocationSlug);
  const isTransitioning = useTourStore((s) => s.isTransitioning);
  const navigateTo = useTourStore((s) => s.navigateTo);
  const fetchPath = useTourStore((s) => s.fetchPath);
  const pathCache = useTourStore((s) => s.pathCache);
  const navNodes = useTourStore((s) => s.navNodes);
  const pendingNavigation = useTourStore((s) => s.pendingNavigation);
  const pendingMapAnimationSlug = useTourStore(
    (s) => s.pendingMapAnimationSlug,
  );
  const pendingMediaFocus = useTourStore((s) => s.pendingMediaFocus);
  const clearPendingNavigation = useTourStore((s) => s.clearPendingNavigation);
  const setPendingMapAnimationSlug = useTourStore(
    (s) => s.setPendingMapAnimationSlug,
  );
  const fetchLocationMedia = useTourStore((s) => s.fetchLocationMedia);
  const setFocusedMedia = useTourStore((s) => s.setFocusedMedia);
  const setActiveOverlay2 = useTourStore((s) => s.setActiveOverlay);
  const isPanoramaReady = useTourStore((s) => s.isPanoramaReady);

  const currentLocation = locations.find((l) => l.slug === currentSlug);

  // ── Navigation animation state ──
  const [navTarget, setNavTarget] = useState<string | null>(null);
  const [isPathResolving, setIsPathResolving] = useState(false);
  const [animProgress, setAnimProgress] = useState(0);
  const animRef = useRef<number | null>(null);
  const pendingNavTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isAgentNavRef = useRef(false); // Tracks if current navigation was AI-triggered
  const [showAStarExplainer, setShowAStarExplainer] = useState(false);
  const targetLocation = navTarget
    ? locations.find((l) => l.slug === navTarget)
    : null;

  // Active path key for CampusMap
  const activePathKey = useMemo(() => {
    if (!navTarget || !currentSlug) return null;
    const key = `${currentSlug}_to_${navTarget}`;
    return pathCache[key]?.found || getPathPoints(currentSlug, navTarget)
      ? key
      : null;
  }, [navTarget, currentSlug, pathCache]);

  // ── Handle destination click ──
  const handleNavigate = useCallback(
    async (targetSlug: string) => {
      if (
        !currentSlug ||
        targetSlug === currentSlug ||
        navTarget ||
        isPathResolving
      ) {
        return;
      }

      const startSlug = currentSlug;
      const source = isAgentNavRef.current ? "agent" : "user";
      const fallbackPath = getPathPoints(startSlug, targetSlug);

      setIsPathResolving(true);
      const apiPath = await fetchPath(startSlug, targetSlug);
      setIsPathResolving(false);

      const currentState = useTourStore.getState();
      if (currentState.currentLocationSlug !== startSlug) {
        isAgentNavRef.current = false;
        return;
      }

      if (!apiPath?.found && !fallbackPath) {
        console.warn(
          `[Minimap] No path found from ${startSlug} to ${targetSlug}`,
        );
        isAgentNavRef.current = false;
        return;
      }

      setNavTarget(targetSlug);
      setAnimProgress(0);

      if (animRef.current) cancelAnimationFrame(animRef.current);
      const start = performance.now();
      const duration = 2500;

      const tick = (now: number) => {
        const progress = Math.min((now - start) / duration, 1);
        setAnimProgress(progress);
        if (progress < 1) {
          animRef.current = requestAnimationFrame(tick);
        } else {
          // Pass "agent" source if triggered by AI, so ChatOverlay won't add duplicate intro
          navigateTo(targetSlug, source);
          isAgentNavRef.current = false;
        }
      };
      animRef.current = requestAnimationFrame(tick);
    },
    [currentSlug, fetchPath, isPathResolving, navigateTo, navTarget],
  );

  // ── Auto-close after navigation completes AND panorama is ready ──
  useEffect(() => {
    if (navTarget && !isTransitioning && animProgress >= 1 && isPanoramaReady) {
      const timer = setTimeout(() => {
        setExpanded(false);
        // Apply deferred media focus if AI requested it
        if (pendingMediaFocus) {
          setTimeout(() => {
            setFocusedMedia(pendingMediaFocus.mediaId, pendingMediaFocus.tab);
            setActiveOverlay2("info");
            useTourStore.getState().setPendingMediaFocus(null);
          }, 800); // Wait for 360 scene to settle
        }
        setNavTarget(null);
        setIsPathResolving(false);
        setAnimProgress(0);
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [
    navTarget,
    isTransitioning,
    animProgress,
    isPanoramaReady,
    pendingMediaFocus,
  ]);

  // ── Safety: force close map if panorama doesn't load after 6s ──
  useEffect(() => {
    if (
      navTarget &&
      !isTransitioning &&
      animProgress >= 1 &&
      !isPanoramaReady
    ) {
      const safety = setTimeout(() => {
        console.warn(
          "[Minimap] Safety timeout — closing map without panorama ready",
        );
        setExpanded(false);
        setNavTarget(null);
        setIsPathResolving(false);
        setAnimProgress(0);
      }, 6000);
      return () => clearTimeout(safety);
    }
  }, [navTarget, isTransitioning, animProgress, isPanoramaReady]);

  useEffect(() => {
    return () => {
      if (animRef.current) cancelAnimationFrame(animRef.current);
      if (pendingNavTimerRef.current) clearTimeout(pendingNavTimerRef.current);
    };
  }, []);

  // ── AI Agent triggers navigation via pendingNavigation ──
  useEffect(() => {
    if (!pendingNavigation || pendingNavigation === currentSlug) return;

    // Capture target slug before clearing state
    const targetSlug = pendingNavigation;

    // Clear immediately so effect doesn't re-trigger
    clearPendingNavigation();

    // 1. Open the map fullscreen
    setExpanded(true);

    // 2. Start prefetching media for target location (parallel with animation)
    fetchLocationMedia(targetSlug);

    // 3. Small delay to let map open animation finish, then start path drawing
    // Use ref for timer so React cleanup doesn't cancel it
    pendingNavTimerRef.current = setTimeout(() => {
      isAgentNavRef.current = true; // Mark as AI-triggered
      handleNavigate(targetSlug);
      pendingNavTimerRef.current = null;
    }, 400);
  }, [pendingNavigation]);

  // ── User manual navigation triggers map animation ──
  useEffect(() => {
    if (pendingMapAnimationSlug && pendingMapAnimationSlug !== currentSlug) {
      const targetSlug = pendingMapAnimationSlug;
      setPendingMapAnimationSlug(null);
      setExpanded(true); // Open map fullscreen

      // Delay to let map open, then start drawing
      pendingNavTimerRef.current = setTimeout(() => {
        isAgentNavRef.current = false; // Mark as USER-triggered so Intro plays!
        handleNavigate(targetSlug);
        pendingNavTimerRef.current = null;
      }, 400);
    }
  }, [pendingMapAnimationSlug, currentSlug]);

  // ── Node list for CampusMap ──
  const dynamicCoordSlugs = useMemo(() => {
    const slugs = new Set<string>();
    for (const node of navNodes) {
      if (node.slug) slugs.add(node.slug);
    }
    return slugs;
  }, [navNodes]);

  const visibleMapNodes = useMemo(
    () =>
      locations
        .filter(
          (l) =>
            (l.status === "active" || l.slug === currentSlug) &&
            (dynamicCoordSlugs.has(l.slug) || getCoordsBySlug(l.slug)),
        )
        .map((l) => ({ slug: l.slug, name: l.name, status: l.status })),
    [locations, currentSlug, dynamicCoordSlugs],
  );

  return (
    <>
      {/* === COLLAPSED: Small thumbnail === */}
      {!expanded && (
        <motion.button
          onClick={() => setExpanded(true)}
          aria-label="Mở sơ đồ Khu 1"
          title="Mở sơ đồ Khu 1"
          className="absolute top-5 right-5 z-30 w-[148px] rounded-2xl bg-[#111512]/45 backdrop-blur-2xl border border-white/20 p-1.5 shadow-[0_14px_38px_rgba(0,0,0,0.3)] overflow-hidden cursor-pointer hover:shadow-[0_18px_48px_rgba(0,0,0,0.38)] hover:border-white/40 transition-all flex flex-col"
          whileHover={{ scale: 1.025 }}
          whileTap={{ scale: 0.97 }}
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.3 }}
        >
          <div className="w-full aspect-square bg-gray-100 relative overflow-hidden shrink-0 rounded-xl ring-1 ring-white/80 shadow-[inset_0_0_0_1px_rgba(0,0,0,0.08)]">
            {/* Dynamic panning container: centers on current location */}
            {(() => {
              const SCALE = 2.2; // 220% zoom
              const currentCoords = currentSlug
                ? getCoordsBySlug(currentSlug)
                : null;
              const cx = currentCoords ? currentCoords.x : 50;
              const cy = currentCoords ? currentCoords.y : 50;

              let left = 50 - cx * SCALE;
              let top = 50 - cy * SCALE; // Properly centered now since label doesn't cover it

              // Clamp so we don't pan past the map edges
              left = Math.max(100 - SCALE * 100, Math.min(0, left));
              top = Math.max(100 - SCALE * 100, Math.min(0, top));

              return (
                <div
                  className="absolute transition-all duration-1000 ease-in-out"
                  style={{
                    width: `${SCALE * 100}%`,
                    height: `${SCALE * 100}%`,
                    top: `${top}%`,
                    left: `${left}%`,
                  }}
                >
                  <Image
                    src="/map_v3.png"
                    alt="Mini TVU Map"
                    fill
                    sizes="200px"
                    priority
                    className="object-cover"
                  />
                  {visibleMapNodes.map((loc) => {
                    const coords = getCoordsBySlug(loc.slug);
                    if (!coords) return null;
                    return (
                      <div
                        key={loc.slug}
                        className={`absolute w-3.5 h-3.5 rounded-full -translate-x-1/2 -translate-y-1/2 ${
                          loc.slug === currentSlug
                            ? "bg-[#053384]"
                            : "bg-[#f5c518] shadow-sm"
                        } ${loc.status === "inactive" ? "opacity-40" : ""}`}
                        style={{ left: `${coords.x}%`, top: `${coords.y}%` }}
                      >
                        {loc.slug === currentSlug && (
                          <span className="absolute inset-0 rounded-full bg-[#053384] animate-ping opacity-40" />
                        )}
                      </div>
                    );
                  })}
                </div>
              );
            })()}
          </div>
        </motion.button>
      )}

      {/* === EXPANDED: Fullscreen overlay === */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            className="absolute inset-0 z-50 flex items-center justify-center"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
          >
            {/* Backdrop */}
            <div
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
              onClick={() => {
                if (!navTarget && !isPathResolving) setExpanded(false);
              }}
            />

            {/* Modal */}
            <motion.div
              className="relative flex flex-col overflow-hidden rounded-2xl border border-white/15 bg-[#0a1628]/75 text-white shadow-[0_28px_90px_rgba(0,0,0,0.48)] backdrop-blur-2xl"
              style={{ width: "min(96vw, 1200px)", height: "min(92vh, 900px)" }}
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              transition={{ type: "spring", damping: 25, stiffness: 300 }}
            >
              {/* Header */}
              <div className="relative flex min-h-[52px] shrink-0 items-center justify-center border-b border-white/10 bg-white/[0.06] px-5 py-3">
                {/* Title + current location (Centered) */}
                <div className="flex min-w-0 items-center justify-center gap-3 px-12">
                  <h2 className="flex items-center gap-2 whitespace-nowrap text-sm font-bold text-white">
                    <MapIcon className="h-4 w-4 text-[#8eb2f0]" />
                    Sơ đồ Khu 1
                  </h2>
                  <span className="hidden text-white/20 sm:inline">|</span>
                  <div className="hidden min-w-0 items-center gap-1.5 sm:flex">
                    <span className="relative flex h-2.5 w-2.5 shrink-0">
                      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#8eb2f0] opacity-40" />
                      <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-[#8eb2f0]" />
                    </span>
                    <span className="truncate text-xs text-white/60">
                      {currentLocation?.name || "Đang tải..."}
                    </span>
                  </div>
                </div>

                <button
                  onClick={() => setExpanded(false)}
                  disabled={!!navTarget || isPathResolving}
                  className="absolute right-4 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full border border-white/15 bg-white/10 text-white/70 transition-all hover:border-red-400/80 hover:bg-red-500/90 hover:text-white disabled:cursor-not-allowed disabled:opacity-30"
                  aria-label="Đóng bản đồ"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              {/* Content: balanced panels with map centered */}
              <div className="flex min-h-0 flex-1 bg-[#07111f]/35">
                <MapLegendPanel
                  currentName={currentLocation?.name || "Đang tải..."}
                  targetName={targetLocation?.name || null}
                  isNavigating={!!navTarget}
                  isPathResolving={isPathResolving}
                />

                {/* Map — must stay aspect-square for SVG paths */}
                <div className="relative flex min-w-0 flex-1 items-center justify-center p-3 sm:p-4">
                  <div className="pointer-events-none absolute left-3 top-3 z-10 flex max-w-[calc(100%-1.5rem)] flex-col gap-2 lg:hidden">
                    <div className="inline-flex max-w-full items-center gap-2 rounded-full border border-white/15 bg-[#0a1628]/75 px-3 py-2 text-xs font-medium text-white shadow-lg backdrop-blur-xl">
                      <span className="relative flex h-2.5 w-2.5 shrink-0">
                        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#8eb2f0] opacity-40" />
                        <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-[#8eb2f0]" />
                      </span>
                      <span className="truncate">
                        {currentLocation?.name || "Đang tải..."}
                      </span>
                    </div>
                    {(navTarget || isPathResolving) && (
                      <MapStatusBadge
                        isPathResolving={isPathResolving}
                        isNavigating={!!navTarget}
                      />
                    )}
                  </div>

                  <div
                    className="relative aspect-square overflow-hidden rounded-xl border border-white/15 bg-white shadow-[0_22px_65px_rgba(0,0,0,0.35)]"
                    style={{
                      width: "min(100%, calc(min(92vh, 900px) - 96px))",
                    }}
                  >
                    <CampusMap
                      className="h-full w-full"
                      currentSlug={currentSlug}
                      activePathKey={activePathKey}
                      animProgress={animProgress}
                      showAvailablePaths={!navTarget && !isPathResolving}
                      nodes={visibleMapNodes}
                      navTargetSlug={navTarget}
                      onNodeClick={handleNavigate}
                      disabled={!!navTarget || isPathResolving}
                    />
                  </div>

                  <div className="pointer-events-none absolute bottom-3 left-3 right-3 z-10 flex items-end justify-between gap-2 lg:hidden">
                    <div className="rounded-full border border-white/15 bg-[#0a1628]/75 px-3 py-2 text-[11px] font-medium text-white/80 shadow-lg backdrop-blur-xl">
                      Chạm tên tòa nhà để xem đường đi
                    </div>
                    <button
                      onClick={() => setShowAStarExplainer(true)}
                      className="pointer-events-auto rounded-full border border-white/15 bg-[#0a1628]/75 px-3 py-2 text-[11px] font-semibold text-[#b8d1ff] shadow-lg backdrop-blur-xl transition-all hover:bg-white/10 hover:text-white"
                    >
                      A*
                    </button>
                  </div>

                  {(navTarget || isPathResolving) && (
                    <div className="absolute left-1/2 top-4 z-10 hidden -translate-x-1/2 rounded-full border border-white/15 bg-[#0a1628]/75 px-5 py-2 shadow-lg backdrop-blur-xl lg:flex">
                      <MapStatusBadge
                        isPathResolving={isPathResolving}
                        isNavigating={!!navTarget}
                      />
                    </div>
                  )}
                </div>

                <MapGuidePanel onShowAStar={() => setShowAStarExplainer(true)} />
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* A* Explainer Overlay */}
      <AnimatePresence>
        {showAStarExplainer && (
          <Suspense fallback={null}>
            <AStarExplainer onClose={() => setShowAStarExplainer(false)} />
          </Suspense>
        )}
      </AnimatePresence>
    </>
  );
}

function MapLegendPanel({
  currentName,
  targetName,
  isNavigating,
  isPathResolving,
}: {
  currentName: string;
  targetName: string | null;
  isNavigating: boolean;
  isPathResolving: boolean;
}) {
  return (
    <aside className="hidden w-[220px] shrink-0 flex-col gap-4 border-r border-white/10 bg-white/[0.04] p-4 lg:flex">
      <section>
        <p className="mb-3 text-[10px] font-bold uppercase tracking-[0.18em] text-white/40">
          Chú giải
        </p>
        <div className="space-y-2.5">
          <LegendItem color="#053384" label="Vị trí hiện tại của bạn" pulse />
          <LegendItem color="#f5c518" label="Điểm có thể đến" />
          <LegendItem color="#ec4899" label="Giảng đường D5" />
          <LegendItem color="#22c55e" label="Cổng chính TVU" />
          <LegendItem color="#3b82f6" label="Thư viện TVU" />
          <LegendItem color="#f59e0b" label="Khoa CNTT" />
          <LineLegendItem dashed label="Tuyến đường có thể đi" />
          <LineLegendItem label="Đường đang dẫn" />
        </div>
      </section>

      <section className="rounded-xl border border-white/10 bg-black/20 p-3">
        <p className="mb-1 text-[10px] font-bold uppercase tracking-[0.16em] text-white/40">
          Vị trí
        </p>
        <p className="text-sm font-semibold leading-snug text-white">
          {currentName}
        </p>
        {targetName && (
          <p className="mt-2 text-xs leading-relaxed text-white/60">
            Điểm đến:{" "}
            <span className="font-semibold text-white/80">{targetName}</span>
          </p>
        )}
      </section>

      <section className="mt-auto rounded-xl border border-white/10 bg-black/20 p-3">
        <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.16em] text-white/40">
          Trạng thái
        </p>
        <MapStatusBadge
          isPathResolving={isPathResolving}
          isNavigating={isNavigating}
        />
      </section>
    </aside>
  );
}

function MapGuidePanel({ onShowAStar }: { onShowAStar: () => void }) {
  return (
    <aside className="hidden w-[220px] shrink-0 flex-col border-l border-white/10 bg-white/[0.04] p-4 lg:flex">
      <section>
        <div className="mb-3 flex items-center gap-2">
          <Info className="h-4 w-4 text-[#8eb2f0]" />
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/40">
            Hướng dẫn
          </p>
        </div>
        <div className="space-y-3">
          <GuideStep index={1}>
            Nhấn vào tên tòa nhà trên bản đồ để xem đường đi.
          </GuideStep>
          <GuideStep index={2}>
            Đường đi được vẽ tự động từ vị trí hiện tại.
          </GuideStep>
          <GuideStep index={3}>
            Chấm nhấp nháy là vị trí của bạn trên sơ đồ.
          </GuideStep>
        </div>
      </section>

      <button
        onClick={onShowAStar}
        className="mt-auto rounded-xl border border-white/10 bg-black/20 p-3 text-left transition-all hover:border-[#8eb2f0]/50 hover:bg-[#8eb2f0]/10"
      >
        <div className="mb-1 flex items-center gap-2 text-xs font-semibold text-[#b8d1ff]">
          <Route className="h-3.5 w-3.5" />
          Cách hệ thống tìm đường
        </div>
        <p className="text-[11px] leading-relaxed text-white/50">
          Xem mô phỏng A* khi hệ thống chọn tuyến ngắn nhất.
        </p>
      </button>
    </aside>
  );
}

function GuideStep({
  index,
  children,
}: {
  index: number;
  children: ReactNode;
}) {
  return (
    <div className="flex gap-2.5 text-xs leading-relaxed text-white/70">
      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/10 text-[10px] font-bold text-white/70">
        {index}
      </span>
      <span>{children}</span>
    </div>
  );
}

function MapStatusBadge({
  isPathResolving,
  isNavigating,
}: {
  isPathResolving: boolean;
  isNavigating: boolean;
}) {
  const label = isPathResolving
    ? "Đang tính đường bằng A*"
    : isNavigating
      ? "Đang dẫn đường"
      : "Sẵn sàng chọn điểm đến";

  return (
    <div className="inline-flex items-center gap-2 text-xs font-semibold text-white/80">
      <Navigation
        className={`h-3.5 w-3.5 text-[#8eb2f0] ${
          isPathResolving || isNavigating ? "animate-pulse" : ""
        }`}
      />
      <span>{label}</span>
    </div>
  );
}

// ── Legend item ──
function LegendItem({
  color,
  label,
  pulse,
}: {
  color: string;
  label: string;
  pulse?: boolean;
}) {
  return (
    <div className="flex items-center gap-2">
      <div
        className="relative h-2.5 w-2.5 shrink-0 rounded-full ring-1 ring-white/40"
        style={{ backgroundColor: color }}
      >
        {pulse && (
          <span
            className="absolute inset-0 animate-ping rounded-full opacity-40"
            style={{ backgroundColor: color }}
          />
        )}
      </div>
      <span className="text-[11px] leading-snug text-white/60">{label}</span>
    </div>
  );
}

function LineLegendItem({
  label,
  dashed,
}: {
  label: string;
  dashed?: boolean;
}) {
  return (
    <div className="flex items-center gap-2">
      <span
        className={`h-0 w-7 shrink-0 border-t-2 ${
          dashed ? "border-dashed border-[#8eb2f0]/70" : "border-[#8eb2f0]"
        }`}
      />
      <span className="text-[11px] leading-snug text-white/60">{label}</span>
    </div>
  );
}
