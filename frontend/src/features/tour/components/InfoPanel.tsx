"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Film, ImageIcon, MapPin, Maximize2, X } from "lucide-react";
import { useTourStore } from "@/features/tour/store";
import { useMobileVisibility } from "@/hooks/useMobileVisibility";
import ImageGallery from "./media/ImageGallery";
import VideoPlayer from "./media/VideoPlayer";

type PanelMode = "video" | "info";

export default function InfoPanel() {
  const [mode, setMode] = useState<PanelMode>("video");
  const [miniSlideIndex, setMiniSlideIndex] = useState(0);
  const { isMobileLandscape, canShowCollapsedPanels } = useMobileVisibility();

  const activeOverlay = useTourStore((s) => s.activeOverlay);
  const setActiveOverlay = useTourStore((s) => s.setActiveOverlay);
  const isOverlayOpen = activeOverlay === "info";

  const location = useTourStore((s) => s.currentLocation());
  const locationMedia = useTourStore((s) => s.locationMedia);
  const isMediaLoading = useTourStore((s) => s.isMediaLoading);
  const focusedMediaId = useTourStore((s) => s.focusedMediaId);
  const preferredMediaTab = useTourStore((s) => s.preferredMediaTab);

  // Split media by type
  const videos = useMemo(
    () => locationMedia.filter((m) => m.type === "video"),
    [locationMedia],
  );
  const images = useMemo(
    () => locationMedia.filter((m) => m.type === "image" || m.type === "gif"),
    [locationMedia],
  );
  const hasMedia = locationMedia.length > 0;

  // Expanded video state (for carousel in expanded mode)
  const [expandedVideoIdx, setExpandedVideoIdx] = useState(0);
  const [focusedImageIndex, setFocusedImageIndex] = useState<number | null>(null);

  // ── AI Focus: auto-expand + select tab when AI focuses an item ──
  useEffect(() => {
    if (focusedMediaId) {
      const videoIdx = videos.findIndex((item) => item.id === focusedMediaId);
      const imageIdx = images.findIndex((item) => item.id === focusedMediaId);

      queueMicrotask(() => {
        if (videoIdx >= 0) {
          setMode("video");
          setExpandedVideoIdx(videoIdx);
          setFocusedImageIndex(null);
        } else if (imageIdx >= 0) {
          setMode("info");
          setFocusedImageIndex(imageIdx);
        } else {
          setMode(preferredMediaTab);
          setFocusedImageIndex(null);
        }

        setActiveOverlay("info");
      });
    }
  }, [focusedMediaId, preferredMediaTab, setActiveOverlay, videos, images]);

  // ── Mini Slideshow: video plays to end, images cycle 5s ──
  const miniVideoRef = useRef<HTMLVideoElement>(null);
  const currentMiniItem = hasMedia ? locationMedia[miniSlideIndex % locationMedia.length] : null;

  const advanceMiniSlide = useCallback(() => {
    setMiniSlideIndex((prev) => (prev + 1) % locationMedia.length);
  }, [locationMedia.length]);

  useEffect(() => {
    if (isOverlayOpen || !hasMedia) return;

    // If current item is image → advance after 5s
    if (currentMiniItem?.type !== "video") {
      const timer = setTimeout(advanceMiniSlide, 5000);
      return () => clearTimeout(timer);
    }
    // If video → wait for onEnded (handled in JSX)
  }, [isOverlayOpen, hasMedia, miniSlideIndex, currentMiniItem?.type, advanceMiniSlide]);

  // Reset mini index when location changes
  useEffect(() => {
    queueMicrotask(() => {
      setMiniSlideIndex(0);
      setExpandedVideoIdx(0);
      setFocusedImageIndex(null);
    });
  }, [location?.slug]);

  if (!location) return null;

  const handleClose = () => {
    setActiveOverlay("none");
  };

  if (isMobileLandscape && !isOverlayOpen) {
    if (!canShowCollapsedPanels) return null;

    return (
      <motion.button
        type="button"
        onClick={() => setActiveOverlay("info")}
        className="fixed z-30 flex h-11 w-[190px] max-w-[calc(100vw-var(--ml-edge)-var(--mr-edge)-154px)] items-center gap-2 rounded-xl border border-white/12 bg-[#0b1220]/68 px-2.5 text-left text-white shadow-[0_10px_26px_rgba(0,0,0,0.24)] backdrop-blur-2xl"
        style={{ top: "var(--mt-edge)", left: "var(--ml-edge)" }}
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        whileTap={{ scale: 0.98 }}
        aria-label={`Mở thông tin và media của ${location.name}`}
      >
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-white/10">
          <MapPin className="h-4 w-4 text-rose-300" strokeWidth={2.3} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[12px] font-semibold">
            {location.name}
          </span>
          <span className="block text-[9px] text-white/45">Thông tin địa điểm</span>
        </span>
        <span className="rounded-full bg-white/10 px-1.5 py-0.5 text-[9px] text-white/60">{locationMedia.length}</span>
      </motion.button>
    );
  }

  return (
    <>
      {/* Backdrop — only when expanded */}
      {isOverlayOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 bg-black/30 z-40"
          onClick={handleClose}
        />
      )}

      <motion.div
        layout
        className={`${isMobileLandscape ? "fixed" : "absolute"} flex flex-col bg-[#101412]/60 backdrop-blur-2xl border border-white/[0.14] rounded-2xl shadow-[0_18px_45px_rgba(0,0,0,0.34)] overflow-hidden transition-all duration-500 ease-in-out ${
          isOverlayOpen ? "z-[60]" : "z-30"
        } ${
          isOverlayOpen
            ? isMobileLandscape
              ? "inset-0 m-[var(--mb-edge)] h-auto"
              : "top-1/2 -translate-y-1/2 left-[3%] right-[calc(5%+min(30vw,450px)+2vw)] h-[82vh]"
            : "top-5 left-5 w-[320px]"
        }`}
        initial={{ opacity: 0, x: -40 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ type: "spring", damping: 25, stiffness: 300 }}
      >
        {/* ── Header ── */}
        <div className={`flex items-center justify-between bg-white/[0.06] transition-colors ${
          isOverlayOpen ? 'px-3 py-2 border-b border-white/10' : 'px-3 py-2'
        }`}>
          <div className="flex items-center gap-2 min-w-0 cursor-pointer" onClick={() => !isOverlayOpen ? setActiveOverlay("info") : handleClose()}>
            <MapPin className="h-3.5 w-3.5 shrink-0 text-rose-300" strokeWidth={2.4} />
            <h3 className="text-[13px] font-bold text-white truncate max-w-[150px]">{location.name}</h3>
            {hasMedia && (
              <span className="text-[10px] px-1.5 py-0.5 bg-white/10 text-white/70 rounded-full font-semibold shrink-0">
                {locationMedia.length}
              </span>
            )}
          </div>
          <div className="flex items-center gap-1.5">
            {/* Tab buttons: hide on mobile collapsed to keep pill compact */}
            {(!isMobileLandscape || isOverlayOpen) && ([
              { key: "video" as PanelMode, icon: Film, count: videos.length, label: "Video" },
              { key: "info" as PanelMode, icon: ImageIcon, count: images.length, label: "Hình ảnh" },
            ]).map((tab) => (
              <button
                key={tab.key}
                onClick={() => { setMode(tab.key); setActiveOverlay("info"); }}
                title={tab.label}
                aria-label={tab.label}
                className={`relative flex items-center justify-center rounded-lg transition-all cursor-pointer border ${
                  isMobileLandscape ? "w-10 h-10" : "w-7 h-7"
                } ${
                  isOverlayOpen && mode === tab.key
                    ? "bg-white/[0.18] text-white border-white/25 shadow-sm"
                    : "bg-transparent text-white/55 border-transparent hover:bg-white/10 hover:text-white"
                }`}
              >
                <tab.icon className="h-3.5 w-3.5" strokeWidth={2.4} />
                {tab.count > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 w-4 h-4 flex items-center justify-center bg-[#2f6edb] text-white text-[8px] font-bold rounded-full">
                    {tab.count}
                  </span>
                )}
              </button>
            ))}
            <button
              onClick={() => isOverlayOpen ? handleClose() : setActiveOverlay("info")}
              className={`flex items-center justify-center rounded-lg bg-transparent hover:bg-white/10 border border-transparent transition-all text-white/70 hover:text-white cursor-pointer ${
                isMobileLandscape ? "ml-1 w-10 h-10" : "ml-1 w-7 h-7"
              }`}
              title={isOverlayOpen ? "Thu nhỏ" : "Phóng to"}
            >
              {isOverlayOpen ? (
                <X className="h-4 w-4" strokeWidth={2.2} />
              ) : (
                <Maximize2 className="h-4 w-4" strokeWidth={2.2} />
              )}
            </button>
          </div>
        </div>

        {/* ── Mini Slideshow (collapsed state) — skip on mobile (pill only) ── */}
        {!isOverlayOpen && !isMobileLandscape && (
          <div className="px-2.5 pb-2.5 pt-1">
            {isMediaLoading ? (
              <div className="flex items-center justify-center py-6">
                <motion.div
                  className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full"
                  animate={{ rotate: 360 }}
                  transition={{ repeat: Infinity, duration: 1, ease: "linear" }}
                />
                <span className="ml-2 text-xs text-white/50">Đang tải...</span>
              </div>
            ) : currentMiniItem ? (
              <div className="cursor-pointer" onClick={() => setActiveOverlay("info")}>
                <AnimatePresence mode="wait">
                  <motion.div
                    key={currentMiniItem.id}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.5 }}
                    className="relative rounded-xl overflow-hidden border border-white/10"
                  >
                    {currentMiniItem.type === "video" ? (
                      <video
                        ref={miniVideoRef}
                        src={currentMiniItem.url}
                        className="w-full aspect-video object-cover"
                        muted
                        autoPlay
                        playsInline
                        preload="metadata"
                        onEnded={advanceMiniSlide}
                      />
                    ) : (
                      <img
                        src={currentMiniItem.url}
                        alt={currentMiniItem.caption}
                        className="w-full aspect-video object-cover"
                        loading="lazy"
                      />
                    )}
                    <div className="absolute top-2 right-2 px-1.5 py-0.5 rounded-full bg-black/50 text-[9px] text-white/70 font-medium">
                      {(miniSlideIndex % locationMedia.length) + 1}/{locationMedia.length}
                    </div>
                  </motion.div>
                </AnimatePresence>
              </div>
            ) : (
              <div className="py-4 text-center text-xs text-white/40">Chưa có media</div>
            )}
          </div>
        )}

        {/* ── Expanded Content ── */}
        <AnimatePresence initial={false}>
          {isOverlayOpen && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ type: "spring", bounce: 0, duration: 0.3 }}
              className="overflow-hidden flex-1 min-h-0"
            >
              <div className={`transition-all duration-500 h-full overflow-y-auto custom-scrollbar flex flex-col ${
                isMobileLandscape ? "p-2.5" : "p-4"
              }`}>
                {isMediaLoading ? (
                  <div className="flex items-center justify-center py-12">
                    <motion.div
                      className="w-8 h-8 border-2 border-white/30 border-t-white rounded-full"
                      animate={{ rotate: 360 }}
                      transition={{ repeat: Infinity, duration: 1, ease: "linear" }}
                    />
                    <span className="ml-3 text-sm text-white/50">Đang tải nội dung...</span>
                  </div>
                ) : (
                  <AnimatePresence mode="wait">
                    {mode === "video" && (
                      <motion.div
                        key="video"
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                        className={`flex flex-col h-full min-h-0 ${isMobileLandscape ? "gap-2" : "gap-4"}`}
                      >
                        {videos.length > 0 ? (
                          <>
                            {/* Current video */}
                            <div className={`relative flex-1 min-h-0 mx-auto w-full ${
                              isMobileLandscape ? "max-w-[min(82vw,720px)]" : ""
                            }`}>
                              <VideoPlayer
                                key={videos[expandedVideoIdx]?.id}
                                url={videos[expandedVideoIdx]?.url}
                                caption={videos[expandedVideoIdx]?.caption}
                                isFullscreen={true}
                                autoPlay={true}
                                fit={isMobileLandscape ? "contain" : "cover"}
                              />
                            </div>
                            {/* Caption + nav */}
                            <div className={`flex items-center justify-between px-1 shrink-0 ${isMobileLandscape ? "h-7" : "h-8"}`}>
                              <p className="text-[13px] font-medium text-white/80 truncate">{videos[expandedVideoIdx]?.caption}</p>
                              {videos.length > 1 && (
                                <div className="flex items-center gap-2">
                                  <button
                                    onClick={() => setExpandedVideoIdx((prev) => (prev - 1 + videos.length) % videos.length)}
                                    className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition-colors"
                                  >
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M15 18l-6-6 6-6" /></svg>
                                  </button>
                                  <span className="text-xs text-white/50">{expandedVideoIdx + 1}/{videos.length}</span>
                                  <button
                                    onClick={() => setExpandedVideoIdx((prev) => (prev + 1) % videos.length)}
                                    className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition-colors"
                                  >
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 18l6-6-6-6" /></svg>
                                  </button>
                                </div>
                              )}
                            </div>
                          </>
                        ) : (
                          <div className="relative w-full aspect-video rounded-2xl overflow-hidden border border-white/10 bg-black/40">
                            <div className="absolute inset-0 bg-gradient-to-br from-blue-500/10 to-purple-500/10" />
                            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
                              <div className="w-14 h-14 rounded-full bg-white/10 backdrop-blur-md flex items-center justify-center border border-white/20">
                                <svg className="w-6 h-6 text-white/40" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>
                              </div>
                              <p className="text-xs text-white/40">Chưa có video cho khu vực này</p>
                            </div>
                          </div>
                        )}
                      </motion.div>
                    )}

                    {mode === "info" && (
                      <motion.div
                        key="info"
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                        className="flex flex-col gap-6"
                      >
                        <div>
                          <h4 className="text-[12px] uppercase tracking-widest text-white/50 font-bold mb-3">Thông tin địa điểm</h4>
                          <p className="text-[15px] text-white/90 leading-relaxed font-light">
                            {location.description || "Đang cập nhật nội dung giới thiệu chi tiết về khu vực này..."}
                          </p>
                        </div>

                        <div>
                          <h4 className="text-[12px] uppercase tracking-widest text-white/50 font-bold mb-3">Thư viện ảnh</h4>
                          <ImageGallery
                            images={images}
                            isFullscreen={true}
                            focusedIndex={focusedImageIndex}
                            onFocusedIndexConsumed={() => setFocusedImageIndex(null)}
                          />
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </>
  );
}
