"use client";

import { useEffect } from "react";
import { useTourStore } from "@/features/tour/store";
import PanoramaViewer from "@/features/tour/components/PanoramaViewer";
import Minimap from "@/features/tour/components/Minimap";
import InfoPanel from "@/features/tour/components/InfoPanel";
import ChatOverlay from "@/features/chat/components/ChatOverlay";
import Avatar3D from "@/features/tour/components/Avatar3D";

export default function TourPage() {
  const fetchLocations = useTourStore((s) => s.fetchLocations);
  const location = useTourStore((s) => s.currentLocation());
  const isTransitioning = useTourStore((s) => s.isTransitioning);
  const isLoading = useTourStore((s) => s.isLoading);
  const isAppReady = useTourStore((s) => s.isAppReady);
  const setAppReady = useTourStore((s) => s.setAppReady);
  const navigateTo = useTourStore((s) => s.navigateTo);
  const avatarState = useTourStore((s) => s.avatarState);
  const activeOverlay = useTourStore((s) => s.activeOverlay);

  useEffect(() => {
    fetchLocations();
  }, [fetchLocations]);

  // Sequential startup: wait 2.5s after data loads for 3D/panorama to settle
  useEffect(() => {
    if (!isLoading && location && !isAppReady) {
      const timer = setTimeout(() => setAppReady(true), 2500);
      return () => clearTimeout(timer);
    }
  }, [isLoading, location, isAppReady, setAppReady]);

  // Map AI chat state to 3D Mascot animations
  const getAvatarAnimation = () => {
    switch (avatarState) {
      case "thinking": return "Texting"; // AI is loading/thinking
      case "speaking": return "HeadNod"; // AI is streaming text
      case "idle": 
      default: 
        return "Thankful"; // AI is done (bows/smiles once, then auto-returns to HeadNod)
    }
  };

  // Avatar dims when map/info overlays are active
  const isOverlayActive = activeOverlay !== "none";

  return (
    <main className="relative w-screen h-screen overflow-hidden bg-[#1a1a2e]">
      {/* === Loading Overlay === */}
      {isLoading && (
        <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-[#1a1a2e]">
          <div className="w-12 h-12 border-4 border-white/20 border-t-[#053384] rounded-full animate-spin mb-4" />
          <p className="text-white/60 text-sm font-medium">Đang tải dữ liệu bản đồ...</p>
        </div>
      )}

      {/* === Layer 0: 360° Panorama Background === */}
      {location && (
        <PanoramaViewer
          imageUrl={location.backgroundUrl}
          isTransitioning={isTransitioning}
          links={location.links}
          onNavigate={navigateTo}
        />
      )}

      {/* === Layer 1: Mascot 3D === */}
      {/* Luôn render để tránh lỗi WebGL Context Lost khi unmount */}
      <div 
        className={`absolute left-[5%] bottom-[5%] top-[10%] w-[30%] max-w-[450px] z-10 pointer-events-none transition-all duration-700 ${
          location && !isLoading ? 'opacity-100' : 'opacity-0'
        } ${
          isOverlayActive ? 'opacity-40 scale-95 blur-[1px]' : 'scale-100'
        }`}
      >
        <Avatar3D animation={getAvatarAnimation() as any} />
      </div>

      {/* === UI Overlays (staggered entrance after isAppReady) === */}
      {location && isAppReady && (
        <>
          {/* Layer 2: Minimap (top-left) — enters first */}
          <Minimap />

          {/* Layer 2: Info Panel (top-right) — enters second */}
          <InfoPanel />

          {/* Layer 3: Chat Overlay (bottom-center) — enters last */}
          <ChatOverlay />
        </>
      )}
    </main>
  );
}
