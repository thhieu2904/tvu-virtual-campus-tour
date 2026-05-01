"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useTourStore } from "@/features/tour/store";
import VideoPlayer from "./media/VideoPlayer";
import ImageGallery from "./media/ImageGallery";

type PanelMode = "video" | "info";

export default function InfoPanel() {
  const [mode, setMode] = useState<PanelMode>("video");
  const [isExpanded, setIsExpanded] = useState(false);

  const activeOverlay = useTourStore((s) => s.activeOverlay);
  const setActiveOverlay = useTourStore((s) => s.setActiveOverlay);
  const isFullscreen = activeOverlay === "info";
  const setIsFullscreen = (val: boolean) => setActiveOverlay(val ? "info" : "none");

  const location = useTourStore((s) => s.currentLocation());
  const mediaItems = useTourStore((s) => s.mediaItems);

  if (!location) return null;

  // Split media by type
  const videos = mediaItems.filter((m) => m.type === "video");
  const images = mediaItems.filter((m) => m.type === "image" || m.type === "gif");
  const hasMedia = mediaItems.length > 0;

  // Auto-expand when AI pushes media via tool_call
  const shouldAutoExpand = isFullscreen && !isExpanded;
  if (shouldAutoExpand) {
    // Side-effect: auto-expand when overlay is triggered by AI
    setTimeout(() => setIsExpanded(true), 0);
  }

  return (
    <motion.div
      layout
      className={`absolute z-50 flex flex-col bg-black/50 backdrop-blur-3xl border border-white/20 rounded-3xl shadow-[0_30px_60px_rgba(0,0,0,0.5)] overflow-hidden transition-all duration-500 ease-in-out ${
        isFullscreen
          ? "top-1/2 -translate-y-1/2 right-[3%] left-[calc(5%+min(30vw,450px)+2vw)] max-w-5xl h-[82vh]"
          : "top-6 right-6 w-[360px]"
      }`}
      initial={{ opacity: 0, x: 40 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ type: "spring", damping: 25, stiffness: 300 }}
    >
      {/* Header */}
      <div className={`flex items-center justify-between px-5 py-4 bg-white/5 transition-colors ${isExpanded ? 'border-b border-white/10' : ''}`}>
        <div className="flex items-center gap-2">
          <span className="text-base">📍</span>
          <h3 className="text-sm font-bold text-white truncate max-w-[150px]">{location.name}</h3>
          {/* Media count badge */}
          {hasMedia && (
            <span className="text-[10px] px-1.5 py-0.5 bg-blue-500/20 text-blue-300 rounded-full font-medium">
              {mediaItems.length}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          {/* Mode tabs */}
          {(["video", "info"] as PanelMode[]).map((m) => (
            <button
              key={m}
              onClick={() => {
                setMode(m);
                setIsExpanded(true);
              }}
              className={`w-9 h-9 flex items-center justify-center rounded-xl text-base transition-all cursor-pointer border ${
                isExpanded && mode === m
                  ? "bg-white/20 text-white border-white/30 shadow-md"
                  : "bg-transparent text-white/50 border-transparent hover:bg-white/10 hover:text-white"
              }`}
            >
              {m === "video" ? "🎬" : "🖼️"}
            </button>
          ))}
          {/* Maximize */}
          {isExpanded && (
            <button
              onClick={() => setIsFullscreen(!isFullscreen)}
              className="ml-1 w-9 h-9 flex items-center justify-center rounded-xl bg-transparent hover:bg-white/10 border border-transparent transition-all text-white/70 hover:text-white cursor-pointer"
              title={isFullscreen ? "Thu nhỏ" : "Phóng to"}
            >
              {isFullscreen ? (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M8 3v3a2 2 0 0 0 2 2h3m8-8v3a2 2 0 0 1-2 2h-3m0 18v-3a2 2 0 0 1 2-2h3M3 16v-3a2 2 0 0 1 2-2h3"></path></svg>
              ) : (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"></path></svg>
              )}
            </button>
          )}
          {/* Collapse */}
          {isExpanded && (
            <button
              onClick={() => {
                setIsExpanded(false);
                setIsFullscreen(false);
              }}
              className="w-9 h-9 flex items-center justify-center rounded-xl bg-transparent hover:bg-white/10 border border-transparent transition-all text-white/70 hover:text-white text-sm cursor-pointer"
            >
              ✕
            </button>
          )}
        </div>
      </div>

      {/* Content */}
      <AnimatePresence initial={false}>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ type: "spring", bounce: 0, duration: 0.3 }}
            className="overflow-hidden"
          >
            <div className={`p-5 overflow-y-auto custom-scrollbar transition-all duration-500 ${isFullscreen ? 'h-[calc(80vh-70px)]' : 'max-h-[calc(100vh-200px)]'}`}>
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
                      videos.map((v) => (
                        <VideoPlayer
                          key={v.id}
                          url={v.url}
                          caption={v.caption}
                          isFullscreen={isFullscreen}
                        />
                      ))
                    ) : (
                      /* Empty state — no videos available */
                      <div className="relative w-full aspect-video rounded-2xl overflow-hidden group border border-white/10 bg-black/40">
                        <div className="absolute inset-0 bg-gradient-to-br from-blue-500/10 to-purple-500/10" />
                        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
                          <div className="w-14 h-14 rounded-full bg-white/10 backdrop-blur-md flex items-center justify-center border border-white/20">
                            <svg className="w-6 h-6 text-white/40" fill="currentColor" viewBox="0 0 24 24">
                              <path d="M8 5v14l11-7z" />
                            </svg>
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
                    {/* Location description */}
                    <div>
                      <h4 className="text-[11px] uppercase tracking-widest text-white/50 font-bold mb-2">Thông tin địa điểm</h4>
                      <p className="text-[14px] text-white/80 leading-relaxed font-light">
                        {location.description || "Đang cập nhật nội dung giới thiệu chi tiết về khu vực này..."}
                      </p>
                    </div>

                    {/* Image Gallery — real data or empty state */}
                    <div>
                      <h4 className="text-[11px] uppercase tracking-widest text-white/50 font-bold mb-2">Thư viện ảnh</h4>
                      <ImageGallery images={images} isFullscreen={isFullscreen} />
                    </div>

                    {/* Source badge */}
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
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
