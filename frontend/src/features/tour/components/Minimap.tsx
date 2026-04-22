"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useTourStore } from "@/features/tour/store";

export default function Minimap() {
  const [expanded, setExpanded] = useState(false);
  const locations = useTourStore((s) => s.locations);
  const currentSlug = useTourStore((s) => s.currentLocationSlug);
  const navigateTo = useTourStore((s) => s.navigateTo);

  const currentLocation = locations.find((l) => l.slug === currentSlug);

  return (
    <>
      {/* === COLLAPSED: Small button top-left === */}
      {!expanded && (
        <motion.button
          onClick={() => setExpanded(true)}
          className="absolute top-6 left-6 z-30 w-[120px] h-[120px] rounded-2xl bg-white shadow-[0_8px_32px_rgba(0,0,0,0.12)] overflow-hidden cursor-pointer hover:shadow-[0_12px_40px_rgba(0,0,0,0.18)] transition-shadow"
          whileHover={{ scale: 1.04 }}
          whileTap={{ scale: 0.97 }}
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.3 }}
        >
          <div className="w-full h-full bg-gradient-to-br from-[#e8eef8] to-[#d0ddf0] relative">
            {/* Show all location dots */}
            {locations.map((loc) => (
              <div
                key={loc.slug}
                className={`absolute w-2.5 h-2.5 rounded-full ${
                  loc.slug === currentSlug ? "bg-[#053384]" : "bg-[#f5c518]"
                } ${loc.status === "inactive" ? "opacity-40" : ""}`}
                style={{ left: `${loc.mapX}%`, top: `${loc.mapY}%` }}
              >
                {loc.slug === currentSlug && (
                  <span className="absolute inset-0 rounded-full bg-[#053384] animate-ping opacity-40" />
                )}
              </div>
            ))}
            <div className="absolute bottom-0 left-0 right-0 bg-white/90 px-2 py-1.5 text-center">
              <span className="text-[10px] font-medium text-[#053384]">
                🗺️ Bản đồ
              </span>
            </div>
          </div>
        </motion.button>
      )}

      {/* === EXPANDED: Fullscreen map overlay === */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            className="absolute inset-0 z-50 flex items-center justify-center"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
          >
            <div
              className="absolute inset-0 bg-black/40"
              onClick={() => setExpanded(false)}
            />

            <motion.div
              className="relative w-[85vw] max-w-[900px] aspect-[4/3] bg-white rounded-3xl shadow-[0_24px_80px_rgba(0,0,0,0.2)] overflow-hidden"
              initial={{ scale: 0.3, opacity: 0, x: "-40vw", y: "-35vh" }}
              animate={{ scale: 1, opacity: 1, x: 0, y: 0 }}
              exit={{ scale: 0.3, opacity: 0, x: "-40vw", y: "-35vh" }}
              transition={{ type: "spring", damping: 25, stiffness: 300 }}
            >
              {/* Header */}
              <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
                <h2 className="text-lg font-bold text-[#053384]">
                  🗺️ Bản đồ Đại học Trà Vinh
                </h2>
                <button
                  onClick={() => setExpanded(false)}
                  className="w-9 h-9 flex items-center justify-center rounded-full bg-gray-100 hover:bg-gray-200 transition-colors text-gray-600 text-lg cursor-pointer"
                >
                  ✕
                </button>
              </div>

              {/* Map area */}
              <div className="relative w-full h-[calc(100%-60px)] bg-gradient-to-br from-[#e8eef8] to-[#d0ddf0]">
                <div className="absolute inset-0 flex items-center justify-center text-[#053384]/20 text-2xl font-bold">
                  Bản đồ TVU Khu 1
                </div>

                {/* Location nodes — driven by store data */}
                {locations.map((node) => (
                  <button
                    key={node.slug}
                    className={`absolute flex flex-col items-center gap-1 cursor-pointer group -translate-x-1/2 -translate-y-1/2 ${
                      node.status === "inactive" ? "opacity-50" : ""
                    }`}
                    style={{ left: `${node.mapX}%`, top: `${node.mapY}%` }}
                    onClick={() => {
                      if (node.status === "active") {
                        navigateTo(node.slug);
                        setExpanded(false);
                      }
                    }}
                  >
                    <div
                      className={`relative w-5 h-5 rounded-full transition-transform group-hover:scale-125 ${
                        node.slug === currentSlug
                          ? "bg-[#053384]"
                          : node.status === "active"
                            ? "bg-[#f5c518]"
                            : "bg-gray-400"
                      }`}
                    >
                      {node.slug === currentSlug && (
                        <span className="absolute inset-0 rounded-full bg-[#053384] animate-ping opacity-30" />
                      )}
                      {node.status === "inactive" && (
                        <span className="absolute -top-1 -right-1 text-[10px]">
                          🔒
                        </span>
                      )}
                    </div>

                    <span
                      className={`text-xs font-medium px-2 py-0.5 rounded-full whitespace-nowrap ${
                        node.slug === currentSlug
                          ? "bg-[#053384] text-white shadow-md"
                          : node.status === "active"
                            ? "bg-white/90 text-[#053384] shadow-sm"
                            : "bg-gray-200/70 text-gray-500"
                      }`}
                    >
                      {node.name}
                    </span>
                  </button>
                ))}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
