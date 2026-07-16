"use client";

import { motion } from "framer-motion";
import { RotateCcw } from "lucide-react";
import { useMobileLandscape } from "@/hooks/useMobileLandscape";

/**
 * RotateDeviceOverlay — Shown when a phone is held in portrait mode.
 * Prompts the user to rotate their device to landscape for the best experience.
 *
 * Only appears on small portrait viewports (phones).
 * Tablet portrait and desktop are unaffected.
 */
export default function RotateDeviceOverlay() {
  const { isPortrait } = useMobileLandscape();

  if (!isPortrait) return null;

  return (
    <motion.div
      className="fixed inset-0 z-[999] flex flex-col items-center justify-center bg-[#08142b] text-white"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      {/* Rotating phone icon */}
      <motion.div
        className="mb-6"
        animate={{ rotate: [0, -90, -90, 0] }}
        transition={{
          repeat: Infinity,
          duration: 3,
          ease: "easeInOut",
          times: [0, 0.3, 0.7, 1],
        }}
      >
        <div className="w-16 h-24 border-3 border-white/60 rounded-xl flex items-center justify-center">
          <div className="w-8 h-1 bg-white/40 rounded-full" />
        </div>
      </motion.div>

      <h2 className="text-xl font-bold mb-2 text-center px-6">
        Vui lòng xoay ngang thiết bị
      </h2>
      <p className="text-white/60 text-sm text-center max-w-[280px] leading-relaxed">
        Trải nghiệm tham quan ảo được tối ưu cho chế độ xoay ngang.
      </p>

      <div className="mt-8 flex items-center gap-2 text-white/40 text-xs">
        <RotateCcw className="h-4 w-4" />
        <span>Xoay ngang để tiếp tục</span>
      </div>
    </motion.div>
  );
}
