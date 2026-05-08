"use client";

import { useEffect, useState } from "react";
import { useTourStore } from "@/features/tour/store";
import PanoramaViewer from "@/features/tour/components/PanoramaViewer";
import Minimap from "@/features/tour/components/Minimap";
import InfoPanel from "@/features/tour/components/InfoPanel";
import ChatOverlay from "@/features/chat/components/ChatOverlay";
import Avatar3D from "@/features/tour/components/Avatar3D";

export default function TourPage() {
  const [hasStarted, setHasStarted] = useState(false);
  const fetchLocations = useTourStore((s) => s.fetchLocations);
  const location = useTourStore((s) => s.currentLocation());
  const isTransitioning = useTourStore((s) => s.isTransitioning);
  const isLoading = useTourStore((s) => s.isLoading);
  const isAppReady = useTourStore((s) => s.isAppReady);
  const setAppReady = useTourStore((s) => s.setAppReady);
  const setPendingMapAnimationSlug = useTourStore((s) => s.setPendingMapAnimationSlug);
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
    if (!hasStarted) return "HeadNod"; // Chờ ở trạng thái gật gù nhẹ khi chưa Start
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
      {/* === Start Overlay (Fix Autoplay Policy) === */}
      {!hasStarted && (
        <div className="absolute inset-0 z-[100] flex flex-col items-center justify-center bg-black/60 backdrop-blur-md text-white">
          <h1 className="text-5xl font-bold mb-4 drop-shadow-lg text-center leading-tight">
            Đại học Trà Vinh<br/>
            <span className="text-[#3b82f6]">Virtual Campus Tour</span>
          </h1>
          <p className="text-lg text-white/80 mb-8 max-w-md text-center">
            Trải nghiệm không gian khuôn viên trường đại học xanh chuẩn quốc tế với sự hướng dẫn của các Đại sứ ảo.
          </p>
          <button 
            onClick={() => setHasStarted(true)}
            className="px-10 py-4 bg-[#053384] hover:bg-[#042263] rounded-full text-xl font-bold transition-all shadow-[0_0_30px_rgba(5,51,132,0.6)] hover:scale-105 active:scale-95"
          >
            Chạm để bắt đầu
          </button>
        </div>
      )}

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
          onNavigate={setPendingMapAnimationSlug}
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

      {/* === UI Overlays (staggered entrance after isAppReady & hasStarted) === */}
      {location && isAppReady && hasStarted && (
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
