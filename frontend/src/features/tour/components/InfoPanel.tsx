"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useTourStore } from "@/features/tour/store";

interface MediaAsset {
  id: string;
  type: "image" | "video";
  url: string;
  caption: string;
}

// Demo data
const DEMO_INTRO_VIDEO: MediaAsset = {
  id: "intro-1",
  type: "video",
  url: "",
  caption: "Video giới thiệu không gian",
};

type PanelMode = "video" | "info";

export default function InfoPanel() {
  const [mode, setMode] = useState<PanelMode>("video");
  const [isExpanded, setIsExpanded] = useState(false);
  const location = useTourStore((s) => s.currentLocation());

  if (!location) return null;

  return (
    <motion.div
      className="absolute top-6 right-6 z-20 w-[360px] flex flex-col bg-black/50 backdrop-blur-3xl border border-white/20 rounded-3xl shadow-2xl overflow-hidden"
      initial={{ opacity: 0, x: 40 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ type: "spring", damping: 25, stiffness: 300 }}
    >
      {/* Header */}
      <div className={`flex items-center justify-between px-5 py-4 bg-white/5 transition-colors ${isExpanded ? 'border-b border-white/10' : ''}`}>
        <div className="flex items-center gap-2">
          <span className="text-base">📍</span>
          <h3 className="text-sm font-bold text-white truncate max-w-[150px]">{location.name}</h3>
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
          {/* Collapse */}
          {isExpanded && (
            <button
              onClick={() => setIsExpanded(false)}
              className="ml-1 w-9 h-9 flex items-center justify-center rounded-xl bg-transparent hover:bg-white/10 border border-transparent transition-all text-white/70 hover:text-white text-sm cursor-pointer"
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
            <div className="p-5 max-h-[calc(100vh-200px)] overflow-y-auto custom-scrollbar">
        <AnimatePresence mode="wait">
          {mode === "video" && (
            <motion.div
              key="video"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="flex flex-col gap-3"
            >
              {/* Premium Video Placeholder */}
              <div className="relative w-full aspect-video rounded-2xl overflow-hidden group cursor-pointer border border-white/10 bg-black/40 shadow-inner">
                <div className="absolute inset-0 bg-gradient-to-br from-blue-500/10 to-purple-500/10 group-hover:scale-105 transition-transform duration-700" />
                <div className="absolute inset-0 bg-black/20 group-hover:bg-black/0 transition-colors duration-300" />
                
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="w-14 h-14 rounded-full bg-white/10 backdrop-blur-md flex items-center justify-center border border-white/20 group-hover:scale-110 group-hover:bg-blue-600/90 transition-all duration-300 shadow-[0_0_20px_rgba(0,0,0,0.3)]">
                    <svg className="w-6 h-6 text-white ml-1" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M8 5v14l11-7z" />
                    </svg>
                  </div>
                </div>
              </div>
              
              <div className="flex items-center justify-between px-2 mt-1">
                 <p className="text-[14px] font-medium text-white/90 tracking-wide">Video Không gian 360</p>
                 <span className="text-[11px] px-2.5 py-1 bg-white/10 rounded-full text-white/70 font-medium">02:15</span>
              </div>
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
              {/* Giới thiệu block */}
              <div>
                <h4 className="text-[11px] uppercase tracking-widest text-white/50 font-bold mb-2">Thông tin địa điểm</h4>
                <p className="text-[14px] text-white/80 leading-relaxed font-light">
                  {location.description || "Đang cập nhật nội dung giới thiệu chi tiết về khu vực này..."}
                </p>
              </div>

              {/* Image Gallery placeholder */}
              <div>
                <h4 className="text-[11px] uppercase tracking-widest text-white/50 font-bold mb-2">Thư viện ảnh</h4>
                <div className="grid grid-cols-2 gap-3">
                  {[1, 2, 3, 4].map((i) => (
                    <div
                      key={i}
                      className="relative aspect-[4/3] rounded-xl overflow-hidden group cursor-pointer border border-white/10 bg-white/5 shadow-sm"
                    >
                      <div className="absolute inset-0 bg-gradient-to-tr from-white/5 to-white/10 group-hover:scale-110 transition-transform duration-500" />
                      <div className="absolute inset-0 flex items-center justify-center opacity-40 group-hover:opacity-100 transition-opacity">
                        <svg className="w-7 h-7 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                        </svg>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Sources */}
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
