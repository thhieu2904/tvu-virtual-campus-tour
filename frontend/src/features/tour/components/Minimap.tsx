"use client";

import { useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useTourStore } from "@/features/tour/store";
import Image from "next/image";

export default function Minimap() {
  const [expanded, setExpanded] = useState(false);
  const locations = useTourStore((s) => s.locations);
  const currentSlug = useTourStore((s) => s.currentLocationSlug);
  const navigateTo = useTourStore((s) => s.navigateTo);

  const currentLocation = locations.find((l) => l.slug === currentSlug);

  // Compute all edges for the SVG overlay
  const allEdges = useMemo(() => {
    const edges: { x1: number; y1: number; x2: number; y2: number; key: string }[] = [];
    locations.forEach((fromLoc) => {
      fromLoc.links.forEach((link) => {
        const toLoc = locations.find((l) => l.slug === link.toSlug);
        if (toLoc) {
          edges.push({
            x1: fromLoc.mapX || 0,
            y1: fromLoc.mapY || 0,
            x2: toLoc.mapX || 0,
            y2: toLoc.mapY || 0,
            key: `${fromLoc.slug}-${toLoc.slug}`,
          });
        }
      });
    });
    return edges;
  }, [locations]);

  // Dev Tool: Click on map to get X, Y
  const handleMapClick = (e: React.MouseEvent<HTMLDivElement>) => {
    // Chỉ chạy dev log nếu cố tình click vào nền
    if ((e.target as HTMLElement).tagName !== 'DIV' && (e.target as HTMLElement).tagName !== 'IMG') return;
    
    const rect = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    console.log(`📍 Tọa độ Click để thêm vào Database: map_x=${x.toFixed(2)}, map_y=${y.toFixed(2)}`);
  };

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
          <div className="w-full h-full bg-gray-100 relative">
            <Image
              src="/map.png"
              alt="Mini TVU Map"
              fill
              className="object-cover opacity-60"
            />
            {/* Show all location dots */}
            {locations.map((loc) => (
              <div
                key={loc.slug}
                className={`absolute w-3 h-3 rounded-full -translate-x-1/2 -translate-y-1/2 ${
                  loc.slug === currentSlug ? "bg-[#053384]" : "bg-[#f5c518] shadow-sm"
                } ${loc.status === "inactive" ? "opacity-40" : ""}`}
                style={{ left: `${loc.mapX || 0}%`, top: `${loc.mapY || 0}%` }}
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
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
              onClick={() => setExpanded(false)}
            />

            <motion.div
              className="relative w-[90vw] max-w-[1200px] aspect-[16/10] bg-white rounded-3xl shadow-[0_24px_80px_rgba(0,0,0,0.3)] overflow-hidden flex flex-col"
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              transition={{ type: "spring", damping: 25, stiffness: 300 }}
            >
              {/* Header */}
              <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 shrink-0">
                <div className="flex flex-col">
                  <h2 className="text-lg font-bold text-[#053384]">
                    🗺️ Sơ đồ Khu 1 - Đại học Trà Vinh
                  </h2>
                  <p className="text-xs text-gray-500">Mẹo: Bấm F12 mở Console và click lên bản đồ để lấy toạ độ vị trí mới.</p>
                </div>
                <button
                  onClick={() => setExpanded(false)}
                  className="w-10 h-10 flex items-center justify-center rounded-full bg-gray-100 hover:bg-gray-200 transition-colors text-gray-600 text-xl cursor-pointer"
                >
                  ✕
                </button>
              </div>

              {/* Map area */}
              <div className="relative w-full flex-1 bg-[#e8eef8] overflow-hidden">
                <div 
                  className="absolute inset-0 w-full h-full cursor-crosshair"
                  onClick={handleMapClick}
                >
                  {/* Real Map Image */}
                  <Image
                    src="/map.png"
                    alt="TVU Campus Map"
                    fill
                    className="object-contain"
                    priority
                  />

                  {/* SVG Overlay for Paths */}
                  <svg className="absolute inset-0 w-full h-full pointer-events-none">
                    {/* Vẽ đường nối */}
                    {allEdges.map((edge) => (
                      <line
                        key={edge.key}
                        x1={`${edge.x1}%`}
                        y1={`${edge.y1}%`}
                        x2={`${edge.x2}%`}
                        y2={`${edge.y2}%`}
                        stroke="#053384"
                        strokeWidth="4"
                        strokeOpacity="0.4"
                        strokeDasharray="8,6"
                      />
                    ))}
                  </svg>

                  {/* Location nodes */}
                  {locations.map((node) => (
                    <button
                      key={node.slug}
                      className={`absolute flex flex-col items-center gap-1 cursor-pointer group -translate-x-1/2 -translate-y-1/2 ${
                        node.status === "inactive" ? "opacity-50" : ""
                      }`}
                      style={{ left: `${node.mapX || 0}%`, top: `${node.mapY || 0}%` }}
                      onClick={(e) => {
                        e.stopPropagation();
                        if (node.status === "active") {
                          navigateTo(node.slug);
                          setExpanded(false);
                        }
                      }}
                    >
                      <div
                        className={`relative w-6 h-6 rounded-full transition-transform border-2 border-white group-hover:scale-125 shadow-lg ${
                          node.slug === currentSlug
                            ? "bg-[#053384]"
                            : node.status === "active"
                              ? "bg-[#f5c518]"
                              : "bg-gray-400"
                        }`}
                      >
                        {node.slug === currentSlug && (
                          <span className="absolute inset-0 rounded-full bg-[#053384] animate-ping opacity-40" />
                        )}
                        {node.status === "inactive" && (
                          <span className="absolute -top-2 -right-2 text-xs">
                            🔒
                          </span>
                        )}
                      </div>

                      <span
                        className={`text-sm font-bold px-3 py-1 rounded-lg whitespace-nowrap border ${
                          node.slug === currentSlug
                            ? "bg-[#053384] text-white border-transparent shadow-xl"
                            : node.status === "active"
                              ? "bg-white/95 text-[#053384] border-[#053384]/20 shadow-md backdrop-blur-sm"
                              : "bg-gray-200 text-gray-500 border-transparent"
                        }`}
                      >
                        {node.name}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
