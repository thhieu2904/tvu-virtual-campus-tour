"use client";

import { useState, useMemo, useEffect, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useTourStore } from "@/features/tour/store";
import Image from "next/image";

import CampusMap, { getCoordsBySlug, getPathPoints, getAllPathsFrom } from "./CampusMap";
import { CloseButton } from "@/components/ui/close-button";

export default function Minimap() {
  const [expanded, setExpanded] = useState(false);
  const locations = useTourStore((s) => s.locations);
  const currentSlug = useTourStore((s) => s.currentLocationSlug);
  const isTransitioning = useTourStore((s) => s.isTransitioning);
  const navigateTo = useTourStore((s) => s.navigateTo);

  const currentLocation = locations.find((l) => l.slug === currentSlug);

  // ── Navigation animation state ──
  const [navTarget, setNavTarget] = useState<string | null>(null);
  const [animProgress, setAnimProgress] = useState(0);
  const animRef = useRef<number | null>(null);

  // Active path key for CampusMap
  const activePathKey = useMemo(() => {
    if (!navTarget || !currentSlug) return null;
    const key = `${currentSlug}_to_${navTarget}`;
    return getPathPoints(currentSlug, navTarget) ? key : null;
  }, [navTarget, currentSlug]);

  // ── Handle destination click ──
  const handleNavigate = useCallback(
    (targetSlug: string) => {
      if (targetSlug === currentSlug) return;

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
          navigateTo(targetSlug);
        }
      };
      animRef.current = requestAnimationFrame(tick);
    },
    [currentSlug, navigateTo]
  );

  // ── Auto-close after navigation completes ──
  useEffect(() => {
    if (navTarget && !isTransitioning && animProgress >= 1) {
      const timer = setTimeout(() => {
        setExpanded(false);
        setNavTarget(null);
        setAnimProgress(0);
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [navTarget, isTransitioning, animProgress]);

  useEffect(() => {
    return () => {
      if (animRef.current) cancelAnimationFrame(animRef.current);
    };
  }, []);

  // ── Node list for CampusMap ──
  const mapNodes = useMemo(
    () =>
      locations
        .filter((l) => getCoordsBySlug(l.slug))
        .map((l) => ({ slug: l.slug, name: l.name, status: l.status })),
    [locations]
  );

  return (
    <>
      {/* === COLLAPSED: Small thumbnail === */}
      {!expanded && (
        <motion.button
          onClick={() => setExpanded(true)}
          className="absolute top-6 left-6 z-30 w-[120px] h-[120px] rounded-2xl bg-white border-[3px] border-white shadow-[0_8px_32px_rgba(0,0,0,0.15)] overflow-hidden cursor-pointer hover:shadow-[0_12px_40px_rgba(0,0,0,0.25)] transition-shadow"
          whileHover={{ scale: 1.04 }}
          whileTap={{ scale: 0.97 }}
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.3 }}
        >
          <div className="w-full h-full bg-gray-100 relative overflow-hidden">
            {/* Dynamic panning container: centers on current location */}
            {(() => {
              const SCALE = 2.2; // 220% zoom
              const currentCoords = currentSlug ? getCoordsBySlug(currentSlug) : null;
              const cx = currentCoords ? currentCoords.x : 50;
              const cy = currentCoords ? currentCoords.y : 50;
              
              let left = 50 - cx * SCALE;
              let top = 40 - cy * SCALE; // Center slightly higher to leave room for bottom text
              
              // Clamp so we don't pan past the map edges (allow extra 25% at bottom for text)
              left = Math.max(100 - SCALE * 100, Math.min(0, left));
              top = Math.max(100 - SCALE * 100 - 25, Math.min(0, top));

              return (
                <div 
                  className="absolute transition-all duration-1000 ease-in-out"
                  style={{ 
                    width: `${SCALE * 100}%`, 
                    height: `${SCALE * 100}%`, 
                    top: `${top}%`, 
                    left: `${left}%` 
                  }}
                >
                  <Image
                    src="/map_v3.png"
                    alt="Mini TVU Map"
                    fill
                    className="object-cover opacity-60"
                  />
                  {locations.map((loc) => {
                    const coords = getCoordsBySlug(loc.slug);
                    if (!coords) return null;
                    return (
                      <div
                        key={loc.slug}
                        className={`absolute w-3 h-3 rounded-full -translate-x-1/2 -translate-y-1/2 ${
                          loc.slug === currentSlug ? "bg-[#053384]" : "bg-[#f5c518] shadow-sm"
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
            
            {/* Full-width bottom label */}
            <div className="absolute bottom-0 left-0 right-0 bg-white/95 px-2 py-1.5 text-center border-t border-gray-100 shadow-[0_-4px_12px_rgba(0,0,0,0.05)]">
              <span className="text-[10px] font-bold text-[#053384] flex items-center justify-center gap-1.5">
                <span className="text-[11px]">🗺️</span> Bản đồ
              </span>
            </div>
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
              onClick={() => { if (!navTarget) setExpanded(false); }}
            />

            {/* Modal */}
            <motion.div
              className="relative bg-white rounded-xl shadow-[0_24px_80px_rgba(0,0,0,0.3)] overflow-hidden flex flex-col"
              style={{ width: "min(85vw, 900px)", height: "min(90vh, 850px)" }}
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              transition={{ type: "spring", damping: 25, stiffness: 300 }}
            >
              {/* Header */}
              <div className="flex items-center justify-center relative px-5 py-2.5 bg-[#f0f3f8] border-b border-gray-200 shrink-0 min-h-[44px]">
                {/* Title + current location (Centered) */}
                <div className="flex items-center justify-center gap-3 min-w-0 px-12">
                  <h2 className="text-sm font-bold text-[#053384] whitespace-nowrap">
                    🗺️ Sơ đồ Khu 1
                  </h2>
                  <span className="text-gray-300">|</span>
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className="relative flex h-2 w-2 shrink-0">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#053384] opacity-40" />
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-[#053384]" />
                    </span>
                    <span className="text-xs text-gray-500 truncate">
                      {currentLocation?.name || "Đang tải..."}
                    </span>
                  </div>
                </div>

                {/* Close button (Absolute Right) */}
                <div className="absolute right-5 top-1/2 -translate-y-1/2">
                  <CloseButton
                    onClick={() => setExpanded(false)}
                    disabled={!!navTarget}
                  />
                </div>
              </div>

              {/* Content: Map centered as square */}
              <div className="flex-1 min-h-0 p-2 bg-[#f0f3f8] relative">
                {/* Map — must stay aspect-square for SVG paths */}
                <div className="h-full w-full flex items-center justify-center">
                  <div className="h-full aspect-square rounded-lg overflow-hidden border border-gray-200 bg-white">
                    <CampusMap
                      className="h-full w-full"
                      currentSlug={currentSlug}
                      activePathKey={activePathKey}
                      animProgress={animProgress}
                      showAvailablePaths={!navTarget}
                      nodes={mapNodes}
                      navTargetSlug={navTarget}
                      onNodeClick={handleNavigate}
                      disabled={!!navTarget}
                    />
                  </div>
                </div>

                {/* Help tooltip button — bottom-right */}
                <HelpTooltip />

                {/* Navigation status overlay */}
                {navTarget && (
                  <div className="absolute top-5 left-1/2 -translate-x-1/2 z-10 bg-white/95 backdrop-blur shadow-lg rounded-full px-5 py-2 flex items-center gap-2.5 border border-gray-100">
                    <span className="text-sm">🚶</span>
                    <span className="text-xs font-medium text-[#053384] animate-pulse">Đang dẫn đường...</span>
                  </div>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}


// ── Help tooltip ──
function HelpTooltip() {
  const [show, setShow] = useState(false);

  return (
    <div className="absolute bottom-5 right-5 z-10">
      {/* Tooltip content */}
      <AnimatePresence>
        {show && (
          <motion.div
            initial={{ opacity: 0, y: 8, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.95 }}
            className="absolute bottom-12 right-0 w-[200px] bg-white/95 backdrop-blur shadow-xl rounded-lg border border-gray-100 p-3 mb-1"
          >
            <p className="text-[10px] font-bold text-[#053384] uppercase tracking-wide text-center mb-2">Hướng dẫn</p>
            <div className="flex flex-col gap-2 text-[10px] text-gray-500 leading-relaxed">
              <div className="flex gap-2">
                <span className="shrink-0">👆</span>
                <span>Nhấn <strong className="text-[#053384]">tên tòa nhà</strong> để xem đường đi</span>
              </div>
              <div className="flex gap-2">
                <span className="shrink-0">🚶</span>
                <span>Đường đi được <strong className="text-[#053384]">vẽ tự động</strong> trên bản đồ</span>
              </div>
              <div className="flex gap-2">
                <span className="shrink-0">📍</span>
                <span><strong className="text-[#053384]">Chấm nhấp nháy</strong> là vị trí của bạn</span>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ? button */}
      <button
        onClick={() => setShow(!show)}
        className={`w-9 h-9 flex items-center justify-center rounded-full shadow-lg border border-gray-100 text-sm font-bold transition-all cursor-pointer ${
          show 
            ? "bg-[#053384] text-white" 
            : "bg-white/95 backdrop-blur text-[#053384] hover:bg-[#053384] hover:text-white"
        }`}
      >
        ?
      </button>
    </div>
  );
}

// ── Legend item ──
function LegendItem({ color, label, pulse }: { color: string; label: string; pulse?: boolean }) {
  return (
    <div className="flex items-center gap-2">
      <div className="relative w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: color }}>
        {pulse && <span className="absolute inset-0 rounded-full animate-ping opacity-40" style={{ backgroundColor: color }} />}
      </div>
      <span className="text-[9px] text-gray-500">{label}</span>
    </div>
  );
}
