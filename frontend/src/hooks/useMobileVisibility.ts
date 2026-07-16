"use client";

import { useTourStore } from "@/features/tour/store";
import { useMobileLandscape } from "./useMobileLandscape";

/**
 * useMobileVisibility — Centralized derived visibility states for mobile landscape.
 *
 * All components use this hook instead of independently checking activeOverlay,
 * isKeyboardOpen, etc. This ensures consistent show/hide behavior and prevents
 * components from competing for the same screen space.
 *
 * Priority (highest → lowest):
 * 1. System overlays (rotate/error/idle)
 * 2. Fullscreen overlays (map/info/transcript)
 * 3. Subtitle AI
 * 4. Chat controls
 * 5. Collapsed panels (minimap, media pill, nav links)
 * 6. Mascot & panorama
 */
export function useMobileVisibility() {
  const activeOverlay = useTourStore((s) => s.activeOverlay);
  const isSubtitleOverlayVisible = useTourStore(
    (s) => s.isSubtitleOverlayVisible,
  );
  const { isMobileLandscape, isKeyboardOpen, isPortrait } =
    useMobileLandscape();

  const hasFullscreenOverlay = activeOverlay !== "none";

  // Subtitle: only when no overlay, no keyboard
  const canShowSubtitle =
    isMobileLandscape ? !hasFullscreenOverlay && !isKeyboardOpen : true;

  // Suggestions: only when no overlay, no keyboard
  // (ChatOverlay additionally checks !isSubtitleVisible)
  const canShowSuggestions =
    isMobileLandscape ? !hasFullscreenOverlay && !isKeyboardOpen : true;

  // Collapsed panels (minimap, media pill): no overlay, no keyboard
  const canShowCollapsedPanels =
    isMobileLandscape
      ? !hasFullscreenOverlay && !isKeyboardOpen && !isSubtitleOverlayVisible
      : true;

  // Navigation links: no overlay, no keyboard
  const canShowNavLinks =
    isMobileLandscape
      ? !hasFullscreenOverlay && !isKeyboardOpen && !isSubtitleOverlayVisible
      : true;

  // Bottom dock (chat input): hidden when fullscreen overlay is open
  const canShowBottomDock =
    isMobileLandscape ? !hasFullscreenOverlay : true;

  // Mascot visibility level
  const mascotState: "visible" | "dimmed" | "hidden" = !isMobileLandscape
    ? activeOverlay === "map"
      ? "dimmed"
      : "visible"
    : isKeyboardOpen ||
        activeOverlay === "info" ||
        activeOverlay === "transcript"
      ? "hidden"
      : activeOverlay === "map"
        ? "dimmed"
        : "visible";

  return {
    isMobileLandscape,
    isKeyboardOpen,
    isPortrait,
    activeOverlay,
    isSubtitleOverlayVisible,
    hasFullscreenOverlay,
    canShowSubtitle,
    canShowSuggestions,
    canShowCollapsedPanels,
    canShowNavLinks,
    canShowBottomDock,
    mascotState,
  };
}
