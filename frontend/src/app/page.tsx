"use client";

import { useCallback, useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Volume2, VolumeX } from "lucide-react";
import { useTourStore } from "@/features/tour/store";
import { useChatStore } from "@/features/chat/store";
import { useKioskIdleWatcher } from "@/hooks/useKioskIdleWatcher";
import { useMobileVisibility } from "@/hooks/useMobileVisibility";
import PanoramaViewer from "@/features/tour/components/PanoramaViewer";
import Minimap from "@/features/tour/components/Minimap";
import InfoPanel from "@/features/tour/components/InfoPanel";
import ChatOverlay from "@/features/chat/components/ChatOverlay";
import Avatar3D from "@/features/tour/components/Avatar3D";
import RotateDeviceOverlay from "@/components/RotateDeviceOverlay";
import { useAvatarAnimationController } from "@/features/tour/hooks/useAvatarAnimationController";

const DEFAULT_MASCOT_MODEL_URL = "/mascots/kaito/model.glb";

function resolveAvatarModelUrl(modelUrl?: string | null) {
  if (!modelUrl) return DEFAULT_MASCOT_MODEL_URL;
  const trimmed = modelUrl.trim();
  if (!trimmed) return DEFAULT_MASCOT_MODEL_URL;
  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
    return trimmed;
  }
  if (trimmed.startsWith("/")) {
    return trimmed;
  }
  if (trimmed.includes("..")) {
    return DEFAULT_MASCOT_MODEL_URL;
  }
  return `/${trimmed}`;
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
  const fetchNavGraph = useTourStore((s) => s.fetchNavGraph);
  const location = useTourStore((s) => s.currentLocation());
  const isTransitioning = useTourStore((s) => s.isTransitioning);
  const isLoading = useTourStore((s) => s.isLoading);
  const isAppReady = useTourStore((s) => s.isAppReady);
  const setAppReady = useTourStore((s) => s.setAppReady);
  const isPanoramaReady = useTourStore((s) => s.isPanoramaReady);
  const setPanoramaReady = useTourStore((s) => s.setPanoramaReady);
  const isAvatarReady = useTourStore((s) => s.isAvatarReady);
  const setAvatarReady = useTourStore((s) => s.setAvatarReady);
  const setPendingMapAnimationSlug = useTourStore(
    (s) => s.setPendingMapAnimationSlug,
  );
  const avatarState = useTourStore((s) => s.avatarState);
  const isNetworkError = useTourStore((s) => s.isNetworkError);
  const isFatalError = useTourStore((s) => s.isFatalError);
  const networkRetryCount = useTourStore((s) => s.networkRetryCount);
  const resetNetworkRetry = useTourStore((s) => s.resetNetworkRetry);
  const hasStarted = useTourStore((s) => s.hasStarted);
  const setHasStarted = useTourStore((s) => s.setHasStarted);
  const isTTSEnabled = useChatStore((s) => s.isTTSEnabled);
  const toggleTTS = useChatStore((s) => s.toggleTTS);
  const mascotName = location?.mascotName?.trim() || "Đại sứ ảo";
  const avatarModelUrl = resolveAvatarModelUrl(location?.mascotModelUrl);

  useEffect(() => {
    fetchLocations();
    fetchNavGraph();
  }, [fetchLocations, fetchNavGraph]);

  // Event-based startup: panorama + avatar model must both be ready before the tour starts.
  useEffect(() => {
    if (!isLoading && location && isPanoramaReady && isAvatarReady && !isAppReady) {
      setAppReady(true);
    }
  }, [isLoading, location, isPanoramaReady, isAvatarReady, isAppReady, setAppReady]);

  // Safety timeout: force ready if a third-party asset event never fires.
  // This must run before Start too; otherwise a missed panorama/avatar event can
  // leave the Start button disabled forever.
  useEffect(() => {
    if (!isLoading && location && !isAppReady) {
      const safety = setTimeout(() => {
        if (!useTourStore.getState().isAppReady) {
          const state = useTourStore.getState();
          state.setPanoramaReady(true);
          state.setAvatarReady(true);
          state.setAppReady(true);
        }
      }, 15000);
      return () => clearTimeout(safety);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- hasStarted kept to preserve array size across renders
  }, [isLoading, location, isAppReady, hasStarted]);



  // Callback for PanoramaViewer onLoad event
  const handlePanoramaLoad = useCallback(() => {
    setPanoramaReady(true);
  }, [setPanoramaReady]);

  const handleAvatarModelLoading = useCallback(() => {
    setAvatarReady(false);
  }, [setAvatarReady]);

  const handleAvatarModelLoaded = useCallback(() => {
    setAvatarReady(true);
  }, [setAvatarReady]);

  const {
    animation: avatarAnimation,
    handleAnimationComplete: handleAvatarAnimationComplete,
  } = useAvatarAnimationController({
    hasStarted,
    isReady: isAppReady,
    avatarState,
    isResetting,
    locationSlug: location?.slug || null,
  });

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
      window.location.reload(); // Hard reload — clears all memory (WebGL, Three.js, etc.)
    }, 500);
  }, []);

  const { isWarning, warningSecondsLeft, dismissWarning } = useKioskIdleWatcher(
    {
      onReset: handleKioskReset,
      enabled: hasStarted && !isResetting,
      paused: avatarState === "speaking", // Pause when AI is speaking
    },
  );

  const {
    isMobileLandscape,
    isKeyboardOpen,
    mascotState,
    canShowCollapsedPanels,
    hasFullscreenOverlay,
  } = useMobileVisibility();

  return (
    <main className="relative w-screen h-[100dvh] overflow-hidden bg-[#1a1a2e]">
      {/* Portrait orientation warning */}
      <RotateDeviceOverlay />
      {/* === Start Overlay (Fix Autoplay Policy) === */}
      {!hasStarted && (
        <div className="absolute inset-0 z-[100] flex flex-col items-center justify-center bg-black/60 backdrop-blur-md text-white px-6">
          <h1 className={`font-bold drop-shadow-lg text-center leading-tight ${
            isMobileLandscape ? "text-2xl mb-2" : "text-5xl mb-4"
          }`}>
            Đại học Trà Vinh
            <br />
            <span className="text-[#3b82f6]">Virtual Campus Tour</span>
          </h1>
          <p className={`text-white/80 max-w-md text-center ${
            isMobileLandscape ? "text-sm mb-4 line-clamp-2" : "text-lg mb-8"
          }`}>
            Trải nghiệm không gian khuôn viên trường đại học xanh chuẩn quốc tế
            với sự hướng dẫn của các Đại sứ ảo.
          </p>
          <button
            onClick={() => isAppReady && setHasStarted(true)}
            disabled={!isAppReady}
            className={`rounded-full font-bold transition-all ${
              isMobileLandscape ? "px-8 py-3 text-base" : "px-10 py-4 text-xl"
            } ${
              isAppReady
                ? "bg-[#053384] hover:bg-[#042263] shadow-[0_0_30px_rgba(5,51,132,0.6)] hover:scale-105 active:scale-95 cursor-pointer"
                : "bg-[#053384]/50 cursor-not-allowed"
            }`}
          >
            {isAppReady ? "Chạm để bắt đầu" : (
              <span className="flex items-center gap-3">
                <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Đang tải không gian...
              </span>
            )}
          </button>
          {!isAppReady && !isNetworkError && !isFatalError && location && (
            <p className={`text-white/40 ${
              isMobileLandscape ? "mt-2 text-xs" : "mt-4 text-sm"
            }`}>
              {!isPanoramaReady && !isAvatarReady
                ? "Đang tải ảnh 360° và đại sứ ảo..."
                : !isPanoramaReady
                  ? "Đang tải ảnh 360°..."
                  : "Đang tải đại sứ ảo..."}
            </p>
          )}
        </div>
      )}

      {/* === Network Error Overlay (Retrying) === */}
      {isNetworkError && (
        <div className="absolute inset-0 z-[300] flex items-center justify-center bg-[#08142b]/90 backdrop-blur-md px-6">
          <div className="text-center">
            <div className={`border-4 border-white/20 border-t-[#3b82f6] rounded-full animate-spin mx-auto ${
              isMobileLandscape ? "w-10 h-10 mb-3" : "w-16 h-16 mb-6"
            }`} />
            <h2 className={`font-bold text-white mb-2 ${
              isMobileLandscape ? "text-lg" : "text-2xl"
            }`}>
              Đang kết nối hệ thống
            </h2>
            <p className={`text-white/60 mb-2 ${isMobileLandscape ? "text-sm" : ""}`}>
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
        <div className="absolute inset-0 z-[300] flex items-center justify-center bg-[#08142b]/90 backdrop-blur-md px-6">
          <div className={`text-center bg-[#c14b4b]/20 rounded-2xl border border-[#c14b4b]/50 ${
            isMobileLandscape ? "p-5" : "p-8"
          }`}>
            <div className={isMobileLandscape ? "text-3xl mb-2" : "text-5xl mb-4"}>⚠️</div>
            <h2 className={`font-bold text-white mb-2 ${
              isMobileLandscape ? "text-lg" : "text-2xl"
            }`}>
              Gián đoạn kết nối
            </h2>
            <p className={`text-white/80 max-w-sm mx-auto ${
              isMobileLandscape ? "text-sm mb-4" : "mb-6"
            }`}>
              Rất tiếc, hệ thống hiện không thể kết nối đến máy chủ. Vui lòng
              kiểm tra lại đường truyền hoặc thử lại sau.
            </p>
            <button
              onClick={resetNetworkRetry}
              className={`bg-[#c14b4b] hover:bg-[#a33b3b] text-white rounded-full font-bold transition-all ${
                isMobileLandscape ? "px-6 py-2 text-sm" : "px-8 py-3"
              }`}
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
          <div className={`bg-[#12203a]/90 rounded-3xl shadow-[0_0_50px_rgba(5,51,132,0.3)] border border-[#2f4a78]/50 text-center flex flex-col items-center ${
            isMobileLandscape ? "p-5 max-w-sm" : "p-10 max-w-md"
          }`}>
            <motion.div
              className={isMobileLandscape ? "text-3xl mb-3" : "text-6xl mb-6"}
              animate={{ rotate: [0, -10, 10, -10, 10, 0] }}
              transition={{ repeat: Infinity, duration: 2, repeatDelay: 1 }}
            >
              ⏳
            </motion.div>
            <h2 className={`font-bold text-white ${
              isMobileLandscape ? "text-lg mb-2" : "text-2xl mb-3"
            }`}>
              Bạn vẫn đang trải nghiệm chứ?
            </h2>
            <p className={`text-[#b8c9e8] ${
              isMobileLandscape ? "text-sm mb-3" : "text-lg mb-6"
            }`}>
              Màn hình sẽ tự động làm mới cho người tiếp theo sau:
            </p>
            <div className={`font-bold text-[#8eb2f0] font-mono drop-shadow-[0_0_15px_rgba(142,178,240,0.5)] ${
              isMobileLandscape ? "text-4xl mb-4" : "text-6xl mb-8"
            }`}>
              {warningSecondsLeft}s
            </div>
            <button
              onClick={dismissWarning}
              className={`bg-gradient-to-r from-[#053384] to-[#042263] text-white rounded-full font-bold shadow-[0_0_20px_rgba(5,51,132,0.6)] hover:scale-105 active:scale-95 transition-all w-full ${
                isMobileLandscape ? "px-6 py-3 text-base" : "px-10 py-4 text-lg"
              }`}
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

      {/* === Global Asset Loading Gate === 
       * Now that the Start overlay blocks interaction until isAppReady,
       * this gate only handles edge cases (e.g., kiosk reset mid-session).
       */}
      {hasStarted && location && !isAppReady && !isNetworkError && !isFatalError && (
        <div className="absolute inset-0 z-[90] flex items-center justify-center bg-[#08142b] text-white">
          <div className="flex flex-col items-center text-center">
            <div className="mb-4 h-12 w-12 rounded-full border-4 border-white/15 border-t-[#8eb2f0] animate-spin" />
            <p className="text-base font-semibold">Đang chuẩn bị không gian tham quan</p>
            <p className="mt-1 text-sm text-white/55">
              {isPanoramaReady
                ? "Đang tải đại sứ ảo..."
                : isAvatarReady
                  ? "Đang tải ảnh 360°..."
                  : "Đang tải ảnh 360° và đại sứ ảo..."}
            </p>
          </div>
        </div>
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
        className={`absolute pointer-events-none transition-all duration-700 ${
          isMobileLandscape
            ? "right-[var(--mr-edge)] w-[clamp(130px,18vw,170px)]"
            : "right-[5%] bottom-[5%] top-[10%] w-[30%] max-w-[450px]"
        } ${
          isMobileLandscape ? "top-[calc(var(--mt-edge)+68px)] bottom-[calc(46px+max(4px,env(safe-area-inset-bottom)))]" : ""
        } ${
          location && isAppReady ? "opacity-100" : "opacity-0"
        } ${
          mascotState === "hidden"
            ? "opacity-0 pointer-events-none z-20"
            : mascotState === "dimmed"
              ? "z-20 opacity-20 scale-90 blur-[2px]"
              : "z-30 scale-100"
        }`}
      >
        <Avatar3D
          animation={avatarAnimation}
          modelUrl={avatarModelUrl}
          onModelLoading={handleAvatarModelLoading}
          onModelLoaded={handleAvatarModelLoaded}
          onAnimationComplete={handleAvatarAnimationComplete}
        />
        {location && isAppReady && hasStarted && !isMobileLandscape && !isKeyboardOpen && !hasFullscreenOverlay && (
          <div
            className={`absolute left-1/2 z-10 flex -translate-x-1/2 justify-center pointer-events-auto ${
              !isMobileLandscape ? "bottom-[calc(-5vh+24px)]" : ""
            }`}
            style={isMobileLandscape ? { bottom: 'calc(var(--m-dock-h) + var(--mb-edge) + 4px)' } : undefined}
          >
            <div className={`flex items-center rounded-full border border-white/25 bg-black/45 text-white shadow-[0_10px_30px_rgba(0,0,0,0.28)] backdrop-blur-2xl ${
              isMobileLandscape ? "gap-1.5 py-1 pl-2.5 pr-1" : "gap-2 py-1.5 pl-4 pr-1.5"
            }`}>
              <div className={isMobileLandscape ? "min-w-[60px] text-center" : "min-w-[92px] text-center"}>
                <div className={`truncate font-bold leading-tight ${
                  isMobileLandscape ? "text-[11px]" : "text-sm"
                }`}>
                  {mascotName}
                </div>
                {!isMobileLandscape && (
                  <div className="truncate text-[10px] font-semibold uppercase tracking-[0.08em] text-white/55">
                    Đại sứ ảo
                  </div>
                )}
              </div>
              <button
                onClick={toggleTTS}
                className={`shrink-0 flex items-center justify-center rounded-full border border-white/20 bg-white/10 text-white transition-all hover:bg-white/20 active:scale-95 ${
                  isMobileLandscape ? "h-7 w-7" : "h-9 w-9"
                }`}
                aria-label={isTTSEnabled ? "Tắt tiếng Mascot" : "Bật tiếng Mascot"}
                title={isTTSEnabled ? "Tắt tiếng Mascot" : "Bật tiếng Mascot"}
              >
                {isTTSEnabled ? (
                  <Volume2 className={isMobileLandscape ? "h-3.5 w-3.5" : "h-[18px] w-[18px]"} />
                ) : (
                  <VolumeX className={isMobileLandscape ? "h-3.5 w-3.5" : "h-[18px] w-[18px]"} />
                )}
              </button>
            </div>
          </div>
        )}
      </div>

      {location &&
        isAppReady &&
        hasStarted &&
        isMobileLandscape &&
        canShowCollapsedPanels &&
        mascotState === "visible" && (
          <motion.div
            className="fixed z-40 flex h-11 w-[140px] items-center gap-1 rounded-2xl border border-white/15 bg-[#0b1220]/76 p-1 pl-3 text-white shadow-[0_10px_28px_rgba(0,0,0,0.26)] backdrop-blur-2xl"
            style={{ right: "var(--mr-edge)", bottom: "max(4px, env(safe-area-inset-bottom))" }}
            initial={{ opacity: 0, x: 10 }}
            animate={{ opacity: 1, x: 0 }}
          >
            <span className="min-w-0 flex-1 truncate text-center text-[12px] font-semibold">
              {mascotName}
            </span>
            <button
              onClick={toggleTTS}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/10 text-white/85 transition-colors hover:bg-white/20 hover:text-white active:scale-95"
              aria-label={isTTSEnabled ? "Tắt tiếng Mascot" : "Bật tiếng Mascot"}
              title={isTTSEnabled ? "Tắt tiếng Mascot" : "Bật tiếng Mascot"}
            >
              {isTTSEnabled ? (
                <Volume2 className="h-[17px] w-[17px]" />
              ) : (
                <VolumeX className="h-[17px] w-[17px]" />
              )}
            </button>
          </motion.div>
        )}

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
