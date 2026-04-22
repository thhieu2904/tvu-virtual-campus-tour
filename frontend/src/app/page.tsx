"use client";

import { useTourStore } from "@/features/tour/store";
import PanoramaViewer from "@/features/tour/components/PanoramaViewer";
import Minimap from "@/features/tour/components/Minimap";
import InfoPanel from "@/features/tour/components/InfoPanel";
import ChatOverlay from "@/features/chat/components/ChatOverlay";

export default function TourPage() {
  const location = useTourStore((s) => s.currentLocation());
  const isTransitioning = useTourStore((s) => s.isTransitioning);

  if (!location) return null;

  return (
    <main className="relative w-screen h-screen overflow-hidden bg-[#1a1a2e]">
      {/* === Layer 0: 360° Panorama Background === */}
      <PanoramaViewer
        imageUrl={location.backgroundUrl}
        isTransitioning={isTransitioning}
      />

      {/* === Layer 1: Avatar 3D Placeholder === */}
      <div className="absolute bottom-28 left-8 z-10 select-none">
        <div className="w-[180px] h-[260px] rounded-3xl bg-black/20 backdrop-blur-md border border-white/10 shadow-2xl flex flex-col items-center justify-center relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-t from-[#053384]/60 to-transparent" />
          <div className="text-center text-white/90 z-10">
            <p className="text-8xl mb-2 drop-shadow-lg">🤖</p>
            <p className="text-sm font-bold tracking-wide">Mascot AI</p>
            <p className="text-[10px] uppercase tracking-wider text-white/60 mt-1">
              (Khu vực R3F)
            </p>
          </div>
        </div>
      </div>

      {/* === Layer 2: Minimap (top-left) === */}
      <Minimap />

      {/* === Layer 2: Info Panel (top-right) === */}
      <InfoPanel />

      {/* === Layer 3: Chat Overlay (bottom-center) === */}
      <ChatOverlay />

      {/* === Layer 4: Location badge (top-center) === */}
      <div className="absolute top-6 left-1/2 -translate-x-1/2 z-20">
        <div className="px-5 py-2 bg-white rounded-full shadow-[0_4px_16px_rgba(0,0,0,0.08)] flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full bg-[#007500]" />
          <span className="text-sm font-bold text-[#053384]">
            📍 {location.name}
          </span>
        </div>
      </div>
    </main>
  );
}
