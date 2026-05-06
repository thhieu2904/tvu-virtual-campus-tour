"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useTourStore, MediaItem } from "@/features/tour/store";
import ImageGallery from "./media/ImageGallery";
import VideoPlayer from "./media/VideoPlayer";

type PanelMode = "video" | "info";

export default function InfoPanel() {
  const [mode, setMode] = useState<PanelMode>("video");
  const [isExpanded, setIsExpanded] = useState(false);
  const [miniSlideIndex, setMiniSlideIndex] = useState(0);

  const activeOverlay = useTourStore((s) => s.activeOverlay);
  const setActiveOverlay = useTourStore((s) => s.setActiveOverlay);
  const isOverlayOpen = activeOverlay === "info";

  const location = useTourStore((s) => s.currentLocation());
  const locationMedia = useTourStore((s) => s.locationMedia);
  const isMediaLoading = useTourStore((s) => s.isMediaLoading);
  const focusedMediaId = useTourStore((s) => s.focusedMediaId);
  const preferredMediaTab = useTourStore((s) => s.preferredMediaTab);

  // Split media by type
  const videos = locationMedia.filter((m) => m.type === "video");
  const images = locationMedia.filter((m) => m.type === "image" || m.type === "gif");
  const hasMedia = locationMedia.length > 0;

  // Expanded video state (for carousel in expanded mode)
  const [expandedVideoIdx, setExpandedVideoIdx] = useState(0);

  // ── AI Focus: auto-expand + select tab when AI focuses an item ──
  const prevFocusRef = useRef<string | null>(null);
  useEffect(() => {
    if (focusedMediaId !== prevFocusRef.current) {
      prevFocusRef.current = focusedMediaId;
      if (focusedMediaId) {
        setMode(preferredMediaTab);
        setIsExpanded(true);
        setActiveOverlay("info");
      }
    }
  }, [focusedMediaId, preferredMediaTab, setActiveOverlay]);

  // Auto-expand when overlay is triggered externally
  useEffect(() => {
    if (isOverlayOpen && !isExpanded) {
      setIsExpanded(true);
    }
  }, [isOverlayOpen, isExpanded]);

  // ── Mini Slideshow: video plays to end, images cycle 5s ──
  const miniVideoRef = useRef<HTMLVideoElement>(null);
  const currentMiniItem = hasMedia ? locationMedia[miniSlideIndex % locationMedia.length] : null;

  const advanceMiniSlide = useCallback(() => {
    setMiniSlideIndex((prev) => (prev + 1) % locationMedia.length);
  }, [locationMedia.length]);

  useEffect(() => {
    if (isExpanded || !hasMedia) return;

    // If current item is image → advance after 5s
    if (currentMiniItem?.type !== "video") {
      const timer = setTimeout(advanceMiniSlide, 5000);
      return () => clearTimeout(timer);
    }
    // If video → wait for onEnded (handled in JSX)
  }, [isExpanded, hasMedia, miniSlideIndex, currentMiniItem?.type, advanceMiniSlide]);

  // Reset mini index when location changes
  useEffect(() => {
    setMiniSlideIndex(0);
    setExpandedVideoIdx(0);
  }, [location?.slug]);

  if (!location) return null;

  const handleClose = () => {
    setIsExpanded(false);
    if (isOverlayOpen) setActiveOverlay("none");
  };

  return (
    <>
      {/* Backdrop — only when expanded */}
      {isExpanded && (
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
        className={`absolute flex flex-col bg-black/50 backdrop-blur-3xl border border-white/20 rounded-3xl shadow-[0_30px_60px_rgba(0,0,0,0.5)] overflow-hidden transition-all duration-500 ease-in-out ${
          isExpanded ? "z-[60]" : "z-30"
        } ${
          isExpanded
            ? isOverlayOpen
              ? "top-1/2 -translate-y-1/2 right-[3%] left-[calc(5%+min(30vw,450px)+2vw)] max-w-5xl h-[82vh]"
              : "top-6 right-6 w-[440px] max-h-[80vh]"
            : "top-6 right-6 w-[360px]"
        }`}
        initial={{ opacity: 0, x: 40 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ type: "spring", damping: 25, stiffness: 300 }}
      >
        {/* ── Header ── */}
        <div className={`flex items-center justify-between px-5 py-4 bg-white/5 transition-colors ${isExpanded ? 'border-b border-white/10' : ''}`}>
          <div className="flex items-center gap-2 cursor-pointer" onClick={() => !isExpanded ? setIsExpanded(true) : handleClose()}>
            <span className="text-base">📍</span>
            <h3 className="text-sm font-bold text-white truncate max-w-[150px]">{location.name}</h3>
            {hasMedia && (
              <span className="text-[10px] px-1.5 py-0.5 bg-blue-500/20 text-blue-300 rounded-full font-medium">
                {locationMedia.length}
              </span>
            )}
          </div>
          <div className="flex items-center gap-1.5">
            {([
              { key: "video" as PanelMode, icon: "🎬", count: videos.length },
              { key: "info" as PanelMode, icon: "🖼️", count: images.length },
            ]).map((tab) => (
              <button
                key={tab.key}
                onClick={() => { setMode(tab.key); setIsExpanded(true); }}
                className={`relative w-9 h-9 flex items-center justify-center rounded-xl text-base transition-all cursor-pointer border ${
                  isExpanded && mode === tab.key
                    ? "bg-white/20 text-white border-white/30 shadow-md"
                    : "bg-transparent text-white/50 border-transparent hover:bg-white/10 hover:text-white"
                }`}
              >
                {tab.icon}
                {tab.count > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 w-4 h-4 flex items-center justify-center bg-blue-500 text-white text-[8px] font-bold rounded-full">
                    {tab.count}
                  </span>
                )}
              </button>
            ))}
            {isExpanded && (
              <>
                <button
                  onClick={() => setActiveOverlay(isOverlayOpen ? "none" : "info")}
                  className="ml-1 w-9 h-9 flex items-center justify-center rounded-xl bg-transparent hover:bg-white/10 border border-transparent transition-all text-white/70 hover:text-white cursor-pointer"
                  title={isOverlayOpen ? "Thu nhỏ" : "Phóng to"}
                >
                  {isOverlayOpen ? (
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M8 3v3a2 2 0 0 0 2 2h3m8-8v3a2 2 0 0 1-2 2h-3m0 18v-3a2 2 0 0 1 2-2h3M3 16v-3a2 2 0 0 1 2-2h3"></path></svg>
                  ) : (
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"></path></svg>
                  )}
                </button>
                <button
                  onClick={handleClose}
                  className="w-9 h-9 flex items-center justify-center rounded-xl bg-transparent hover:bg-white/10 border border-transparent transition-all text-white/70 hover:text-white text-sm cursor-pointer"
                >
                  ✕
                </button>
              </>
            )}
          </div>
        </div>

        {/* ── Mini Slideshow (collapsed state) ── */}
        {!isExpanded && (
          <div className="px-4 py-3">
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
              <div className="cursor-pointer" onClick={() => setIsExpanded(true)}>
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
                    <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-2.5">
                      <p className="text-[11px] text-white/90 font-medium truncate">{currentMiniItem.caption}</p>
                    </div>
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
          {isExpanded && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ type: "spring", bounce: 0, duration: 0.3 }}
              className="overflow-hidden flex-1"
            >
              <div className={`p-5 overflow-y-auto custom-scrollbar transition-all duration-500 ${
                isOverlayOpen ? 'h-[calc(80vh-70px)]' : 'max-h-[calc(80vh-200px)]'
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
                        className="flex flex-col gap-4"
                      >
                        {videos.length > 0 ? (
                          <>
                            {/* Current video */}
                            <div className="relative">
                              <VideoPlayer
                                key={videos[expandedVideoIdx]?.id}
                                url={videos[expandedVideoIdx]?.url}
                                caption={videos[expandedVideoIdx]?.caption}
                                isFullscreen={isOverlayOpen}
                                autoPlay={false} // VĐ1: Prevent startling sound
                              />
                            </div>
                            {/* Caption + nav */}
                            <div className="flex items-center justify-between px-1">
                              <p className="text-[13px] font-medium text-white/80">{videos[expandedVideoIdx]?.caption}</p>
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
                        className="flex flex-col gap-5"
                      >
                        <div>
                          <h4 className="text-[11px] uppercase tracking-widest text-white/50 font-bold mb-2">Thông tin địa điểm</h4>
                          <p className="text-[14px] text-white/80 leading-relaxed font-light">
                            {location.description || "Đang cập nhật nội dung giới thiệu chi tiết về khu vực này..."}
                          </p>
                        </div>

                        <div>
                          <h4 className="text-[11px] uppercase tracking-widest text-white/50 font-bold mb-2">Thư viện ảnh</h4>
                          <ImageGallery images={images} isFullscreen={isOverlayOpen} />
                        </div>

                        <div className="mt-1 p-3.5 rounded-2xl bg-blue-500/10 border border-blue-500/20 flex items-center gap-3.5">
                          <div className="w-9 h-9 rounded-full bg-blue-500/20 flex items-center justify-center shrink-0">
                            <svg className="w-5 h-5 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                          </div>
                          <div>
                            <p className="text-[10px] text-blue-200/60 uppercase font-bold tracking-wider mb-0.5">Nguồn dữ liệu</p>
                            <p className="text-[13px] text-blue-300 font-semibold tracking-wide">Hệ thống TVU Tour</p>
                          </div>
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
