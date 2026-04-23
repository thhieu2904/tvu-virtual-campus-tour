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

type PanelMode = "video" | "info" | "chat";

export default function InfoPanel() {
  const [mode, setMode] = useState<PanelMode>("video");
  const [isCollapsed, setIsCollapsed] = useState(false);
  const location = useTourStore((s) => s.currentLocation());

  if (!location) return null;

  if (isCollapsed) {
    return (
      <motion.button
        onClick={() => setIsCollapsed(false)}
        className="absolute top-6 right-6 z-20 w-12 h-12 flex items-center justify-center rounded-full bg-white shadow-[0_8px_32px_rgba(0,0,0,0.12)] cursor-pointer text-[#053384] hover:bg-[#e8eef8] transition-colors"
        whileHover={{ scale: 1.1 }}
        whileTap={{ scale: 0.9 }}
        initial={{ opacity: 0, scale: 0.5 }}
        animate={{ opacity: 1, scale: 1 }}
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
          <path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z" />
        </svg>
      </motion.button>
    );
  }

  return (
    <motion.div
      className="absolute top-6 right-6 z-20 w-[360px] max-h-[calc(100vh-120px)] flex flex-col bg-white rounded-3xl shadow-[0_8px_32px_rgba(0,0,0,0.12)] overflow-hidden"
      initial={{ opacity: 0, x: 40 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ type: "spring", damping: 25, stiffness: 300 }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-100">
        <div className="flex items-center gap-2">
          <span className="text-base">📍</span>
          <h3 className="text-sm font-bold text-[#053384] truncate max-w-[150px]">{location.name}</h3>
        </div>
        <div className="flex items-center gap-1.5">
          {/* Mode tabs */}
          {(["video", "info", "chat"] as PanelMode[]).map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={`px-3 py-1 rounded-full text-xs font-medium transition-colors cursor-pointer ${
                mode === m
                  ? "bg-[#053384] text-white"
                  : "bg-gray-100 text-gray-500 hover:bg-gray-200"
              }`}
            >
              {m === "video" ? "🎬" : m === "info" ? "📋" : "💬"}
            </button>
          ))}
          {/* Collapse */}
          <button
            onClick={() => setIsCollapsed(true)}
            className="ml-1 w-7 h-7 flex items-center justify-center rounded-full bg-gray-100 hover:bg-gray-200 transition-colors text-gray-500 text-xs cursor-pointer"
          >
            ✕
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-5">
        <AnimatePresence mode="wait">
          {mode === "video" && (
            <motion.div
              key="video"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="space-y-3"
            >
              {/* Video placeholder */}
              <div className="w-full aspect-video bg-gradient-to-br from-[#053384] to-[#1a4fa0] rounded-2xl flex items-center justify-center shadow-inner">
                <div className="text-center text-white/80">
                  <div className="text-4xl mb-2">▶️</div>
                  <p className="text-xs">Video giới thiệu</p>
                </div>
              </div>
              <p className="text-xs text-gray-500 text-center">
                {DEMO_INTRO_VIDEO.caption}
              </p>
            </motion.div>
          )}

          {mode === "info" && (
            <motion.div
              key="info"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="space-y-4"
            >
              <div className="text-sm text-[#333] leading-relaxed">
                <p className="font-bold text-[#053384] mb-2">
                  Giới thiệu
                </p>
                <p>
                  {location.description || "Đang cập nhật nội dung giới thiệu..."}
                </p>
              </div>

              {/* Image Gallery placeholder */}
              <div className="grid grid-cols-2 gap-2">
                {[1, 2, 3, 4].map((i) => (
                  <div
                    key={i}
                    className="aspect-[4/3] bg-gray-100 rounded-xl flex items-center justify-center text-gray-300 text-xs shadow-sm"
                  >
                    🖼️ Ảnh {i}
                  </div>
                ))}
              </div>

              {/* Sources */}
              <div className="pt-2 border-t border-gray-100">
                <p className="text-[10px] text-gray-400 uppercase font-medium mb-1">
                  Thông tin từ
                </p>
                <p className="text-xs text-[#053384]">
                  📄 Dữ liệu khuôn viên TVU
                </p>
              </div>
            </motion.div>
          )}

          {mode === "chat" && (
            <motion.div
              key="chat"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="text-sm text-gray-500 text-center py-8"
            >
              <p>💬 Lịch sử hội thoại sẽ hiện ở đây</p>
              <p className="text-xs mt-1">Kéo lên để xem lại tin nhắn cũ</p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}
