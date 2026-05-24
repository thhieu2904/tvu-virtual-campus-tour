"use client";

import { useCallback, useEffect, useState } from "react";
import { motion } from "framer-motion";
import { useTourStore } from "@/features/tour/store";
import { useChatStore, _stopCurrentAudio } from "@/features/chat/store";
import { useKioskIdleWatcher } from "@/hooks/useKioskIdleWatcher";
import PanoramaViewer from "@/features/tour/components/PanoramaViewer";
import Minimap from "@/features/tour/components/Minimap";
import InfoPanel from "@/features/tour/components/InfoPanel";
import ChatOverlay from "@/features/chat/components/ChatOverlay";
import Avatar3D from "@/features/tour/components/Avatar3D";

function resolveAvatarModelUrl(modelUrl?: string | null) {
  if (!modelUrl) return undefined;
  if (modelUrl.startsWith("http://") || modelUrl.startsWith("https://")) {
    return modelUrl;
  }
  if (modelUrl.startsWith("/models/")) {
    return modelUrl;
  }
  if (modelUrl.startsWith("models/")) {
    return `/${modelUrl}`;
  }
  return undefined;
}

function resolveR2Url(url?: string | null) {
  if (!url) return "";
  // Proxy R2 URLs during local dev to bypass CORS issues for WebGL textures (Pannellum)
  if (url.startsWith("https://tvu-tour.site/")) {
    return url.replace("https://tvu-tour.site/", "/r2/");
  }
  return url;
}

export default function TourPage() {
  const [isResetting, setIsResetting] = useState(false);
  const fetchLocations = useTourStore((s) => s.fetchLocations);
  const location = useTourStore((s) => s.currentLocation());
  const isTransitioning = useTourStore((s) => s.isTransitioning);
  const isLoading = useTourStore((s) => s.isLoading);
  const isAppReady = useTourStore((s) => s.isAppReady);
  const setAppReady = useTourStore((s) => s.setAppReady);
  const isPanoramaReady = useTourStore((s) => s.isPanoramaReady);
  const setPanoramaReady = useTourStore((s) => s.setPanoramaReady);
  const setPendingMapAnimationSlug = useTourStore(
    (s) => s.setPendingMapAnimationSlug,
  );
  const avatarState = useTourStore((s) => s.avatarState);
  const activeOverlay = useTourStore((s) => s.activeOverlay);
  const isNetworkError = useTourStore((s) => s.isNetworkError);
  const isFatalError = useTourStore((s) => s.isFatalError);
  const networkRetryCount = useTourStore((s) => s.networkRetryCount);
  const resetNetworkRetry = useTourStore((s) => s.resetNetworkRetry);
  const hasStarted = useTourStore((s) => s.hasStarted);
  const setHasStarted = useTourStore((s) => s.setHasStarted);

  useEffect(() => {
    fetchLocations();
  }, [fetchLocations]);

  // Event-based startup: panorama fires onLoad → setPanoramaReady → setAppReady
  useEffect(() => {
    if (!isLoading && location && isPanoramaReady && !isAppReady) {
      setAppReady(true);
    }
  }, [isLoading, location, isPanoramaReady, isAppReady, setAppReady]);

  // Safety timeout: force ready if panorama doesn't fire onLoad after 8s
  useEffect(() => {
    if (!isLoading && location && !isAppReady) {
      const safety = setTimeout(() => {
        if (!useTourStore.getState().isAppReady) {
          console.warn("[Page] Safety timeout — forcing app ready");
          useTourStore.getState().setAppReady(true);
        }
      }, 8000);
      return () => clearTimeout(safety);
    }
  }, [isLoading, location, isAppReady]);

  // Callback for PanoramaViewer onLoad event
  const handlePanoramaLoad = useCallback(() => {
    setPanoramaReady(true);
  }, [setPanoramaReady]);

  // Map AI chat state to 3D Mascot animations
  const getAvatarAnimation = () => {
    if (!hasStarted) return "HeadNod"; // Chờ ở trạng thái gật gù nhẹ khi chưa Start
    switch (avatarState) {
      case "thinking":
        return "Texting"; // AI is loading/thinking
      case "speaking":
        return "HeadNod"; // AI is streaming text
      case "idle":
      default:
        return "Thankful"; // AI is done (bows/smiles once, then auto-returns to HeadNod)
    }
  };

  // ── Kiosk Gesture Lock (chỉ bật khi KIOSK_MODE) ──
  useEffect(() => {
    if (process.env.NEXT_PUBLIC_KIOSK_MODE !== "true") return;

    const preventContext = (e: Event) => e.preventDefault();
    const preventShortcuts = (e: KeyboardEvent) => {
      if (e.key === "Escape") return;
      if (e.key === "F5" || (e.ctrlKey && e.key === "r")) e.preventDefault();
      if (e.ctrlKey && e.key === "w") e.preventDefault();
      if (e.altKey && (e.key === "ArrowLeft" || e.key === "ArrowRight"))
        e.preventDefault();
    };
    const preventEdgeSwipe = (e: TouchEvent) => {
      const touch = e.touches[0];
      if (
        touch &&
        (touch.clientX < 30 || touch.clientX > window.innerWidth - 30)
      ) {
        e.preventDefault();
      }
    };

    document.addEventListener("contextmenu", preventContext);
    document.addEventListener("keydown", preventShortcuts);
    document.addEventListener("touchstart", preventEdgeSwipe, {
      passive: false,
    });

    return () => {
      document.removeEventListener("contextmenu", preventContext);
      document.removeEventListener("keydown", preventShortcuts);
      document.removeEventListener("touchstart", preventEdgeSwipe);
    };
  }, []);

  // ── Global Idle Reset ──
  const handleKioskReset = useCallback(() => {
    setIsResetting(true); // Fade-to-black

    setTimeout(() => {
      // 1. Dừng audio & Đặt lại màn hình Start TRƯỚC KHI reset/navigate
      // Điều này ngăn ChatOverlay tự động phát audio intro khi navigate về start node
      _stopCurrentAudio();
      setHasStarted(false);

      // 2. Reset chat
      useChatStore.getState().resetSession();
      // 3. Navigate to start node
      const { locations, navigateTo, setActiveOverlay } =
        useTourStore.getState();
      const startNode = locations.find((l) => l.isStartNode) || locations[0];
      if (startNode) navigateTo(startNode.slug);
      // 4. Close overlays
      setActiveOverlay("none");

      // Fade out black overlay
      setTimeout(() => setIsResetting(false), 500);
    }, 500); // Wait for fade-to-black
  }, []);

  const { isWarning, warningSecondsLeft, dismissWarning } = useKioskIdleWatcher(
    {
      onReset: handleKioskReset,
      enabled: hasStarted && !isResetting,
      paused: avatarState === "speaking", // Pause when AI is speaking
    },
  );

  // Avatar dims when map/info overlays are active
  const isOverlayActive = activeOverlay !== "none";

  return (
    <main className="relative w-screen h-screen overflow-hidden bg-[#1a1a2e]">
      {/* === Start Overlay (Fix Autoplay Policy) === */}
      {!hasStarted && (
        <div className="absolute inset-0 z-[100] flex flex-col items-center justify-center bg-black/60 backdrop-blur-md text-white">
          <h1 className="text-5xl font-bold mb-4 drop-shadow-lg text-center leading-tight">
            Đại học Trà Vinh
            <br />
            <span className="text-[#3b82f6]">Virtual Campus Tour</span>
          </h1>
          <p className="text-lg text-white/80 mb-8 max-w-md text-center">
            Trải nghiệm không gian khuôn viên trường đại học xanh chuẩn quốc tế
            với sự hướng dẫn của các Đại sứ ảo.
          </p>
          <button
            onClick={() => setHasStarted(true)}
            className="px-10 py-4 bg-[#053384] hover:bg-[#042263] rounded-full text-xl font-bold transition-all shadow-[0_0_30px_rgba(5,51,132,0.6)] hover:scale-105 active:scale-95"
          >
            Chạm để bắt đầu
          </button>
        </div>
      )}

      {/* === Network Error Overlay (Retrying) === */}
      {isNetworkError && (
        <div className="absolute inset-0 z-[300] flex items-center justify-center bg-[#08142b]/90 backdrop-blur-md">
          <div className="text-center">
            <div className="w-16 h-16 border-4 border-white/20 border-t-[#3b82f6] rounded-full animate-spin mx-auto mb-6" />
            <h2 className="text-2xl font-bold text-white mb-2">
              Đang kết nối hệ thống
            </h2>
            <p className="text-white/60 mb-2">
              Máy chủ đang khởi động, vui lòng chờ trong giây lát...
            </p>
            <p className="text-[#3b82f6] font-mono text-sm bg-[#3b82f6]/10 py-1 px-3 rounded-full inline-block">
              Đang thử lại (Lần {networkRetryCount}/6)
            </p>
          </div>
        </div>
      )}

      {/* === Fatal Error Overlay (Failed after max retries) === */}
      {isFatalError && (
        <div className="absolute inset-0 z-[300] flex items-center justify-center bg-[#08142b]/90 backdrop-blur-md">
          <div className="text-center bg-[#c14b4b]/20 p-8 rounded-2xl border border-[#c14b4b]/50">
            <div className="text-5xl mb-4">⚠️</div>
            <h2 className="text-2xl font-bold text-white mb-2">
              Gián đoạn kết nối
            </h2>
            <p className="text-white/80 mb-6 max-w-sm mx-auto">
              Rất tiếc, hệ thống hiện không thể kết nối đến máy chủ. Vui lòng
              kiểm tra lại đường truyền hoặc thử lại sau.
            </p>
            <button
              onClick={resetNetworkRetry}
              className="px-8 py-3 bg-[#c14b4b] hover:bg-[#a33b3b] text-white rounded-full font-bold transition-all"
            >
              Thử lại
            </button>
          </div>
        </div>
      )}

      {/* === Idle Reset Overlays === */}
      {isWarning && (
        <motion.div
          className="absolute inset-0 z-[150] flex items-center justify-center bg-[#08142b]/80 backdrop-blur-md"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <div className="bg-[#12203a]/90 rounded-3xl shadow-[0_0_50px_rgba(5,51,132,0.3)] border border-[#2f4a78]/50 p-10 max-w-md text-center flex flex-col items-center">
            <motion.div
              className="text-6xl mb-6"
              animate={{ rotate: [0, -10, 10, -10, 10, 0] }}
              transition={{ repeat: Infinity, duration: 2, repeatDelay: 1 }}
            >
              ⏳
            </motion.div>
            <h2 className="text-2xl font-bold text-white mb-3">
              Bạn vẫn đang trải nghiệm chứ?
            </h2>
            <p className="text-[#b8c9e8] mb-6 text-lg">
              Màn hình sẽ tự động làm mới cho người tiếp theo sau:
            </p>
            <div className="text-6xl font-bold text-[#8eb2f0] mb-8 font-mono drop-shadow-[0_0_15px_rgba(142,178,240,0.5)]">
              {warningSecondsLeft}s
            </div>
            <button
              onClick={dismissWarning}
              className="px-10 py-4 bg-gradient-to-r from-[#053384] to-[#042263] text-white rounded-full text-lg font-bold shadow-[0_0_20px_rgba(5,51,132,0.6)] hover:scale-105 active:scale-95 transition-all w-full"
            >
              Tiếp tục sử dụng
            </button>
          </div>
        </motion.div>
      )}

      {isResetting && (
        <motion.div
          className="absolute inset-0 z-[200] bg-black"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5 }}
        />
      )}

      {/* === Layer 0: 360° Panorama Background === */}
      {location && (
        <PanoramaViewer
          imageUrl={resolveR2Url(location.backgroundUrl)}
          isTransitioning={isTransitioning}
          links={location.links}
          onNavigate={setPendingMapAnimationSlug}
          onLoad={handlePanoramaLoad}
        />
      )}

      {/* === Layer 1: Mascot 3D === */}
      {/* Luôn render để tránh lỗi WebGL Context Lost khi unmount */}
      <div
        className={`absolute left-[5%] bottom-[5%] top-[10%] w-[30%] max-w-[450px] z-10 pointer-events-none transition-all duration-700 ${
          location && !isLoading ? "opacity-100" : "opacity-0"
        } ${isOverlayActive ? "opacity-40 scale-95 blur-[1px]" : "scale-100"}`}
      >
        <Avatar3D
          animation={getAvatarAnimation() as any}
          modelUrl={resolveAvatarModelUrl(location?.mascotModelUrl)}
        />
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
