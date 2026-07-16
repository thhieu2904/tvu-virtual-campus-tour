"use client";

import { useState, useEffect, useRef, useCallback } from "react";

/**
 * useMobileLandscape — Detect mobile landscape mode and software keyboard state.
 *
 * Mobile landscape:
 *   - orientation landscape (width > height)
 *   - height <= 500px
 *   - width <= 950px  (prevents desktop-at-low-height false positives)
 *
 * Keyboard detection:
 *   - Stores a "baseline" height on mount and orientation change
 *   - Keyboard is "open" when:
 *     1. An input/textarea is focused (document.activeElement check)
 *     2. VisualViewport height dropped >120px below baseline
 *   - This dual check eliminates false positives from viewport resize
 */

const HEIGHT_THRESHOLD = 500;
const WIDTH_THRESHOLD = 950;
const KEYBOARD_SHRINK_PX = 120;
const PORTRAIT_WIDTH_THRESHOLD = 600;

interface MobileState {
  isMobileLandscape: boolean;
  isKeyboardOpen: boolean;
  isPortrait: boolean;
}

export function useMobileLandscape(): MobileState {
  const baselineHeightRef = useRef<number>(0);
  const [state, setState] = useState<MobileState>({
    isMobileLandscape: false,
    isKeyboardOpen: false,
    isPortrait: false,
  });


  const updateState = useCallback(() => {
    const w = window.innerWidth;
    const h = window.innerHeight;
    const landscape = w > h;
    const isMobileLandscape =
      landscape && h <= HEIGHT_THRESHOLD && w <= WIDTH_THRESHOLD;
    const isPortrait = !landscape && w <= PORTRAIT_WIDTH_THRESHOLD;

    const vv = window.visualViewport;
    const viewportHeight = vv?.height ?? h;
    const activeEl = document.activeElement;
    const isInputFocused =
      activeEl instanceof HTMLInputElement ||
      activeEl instanceof HTMLTextAreaElement;

    if (baselineHeightRef.current === 0) {
      baselineHeightRef.current = Math.max(h, viewportHeight);
    } else if (!isInputFocused) {
      baselineHeightRef.current = Math.max(
        baselineHeightRef.current,
        h,
        viewportHeight,
      );
    }

    const isKeyboardOpen =
      isInputFocused &&
      baselineHeightRef.current - viewportHeight > KEYBOARD_SHRINK_PX;

    setState((current) => {
      const next = { isMobileLandscape, isKeyboardOpen, isPortrait };
      return current.isMobileLandscape === next.isMobileLandscape &&
        current.isKeyboardOpen === next.isKeyboardOpen &&
        current.isPortrait === next.isPortrait
        ? current
        : next;
    });
  }, []);


  // Reset baseline on orientation change (before keyboard could be open)
  const handleOrientationChange = useCallback(() => {
    // Delay to let the browser settle the new dimensions
    setTimeout(() => {
      baselineHeightRef.current = window.innerHeight;
      updateState();
    }, 150);
  }, [updateState]);

  useEffect(() => {
    baselineHeightRef.current = Math.max(
      window.innerHeight,
      window.visualViewport?.height ?? 0,
    );
    const initialFrame = window.requestAnimationFrame(updateState);

    window.addEventListener("resize", updateState);
    window.addEventListener("orientationchange", handleOrientationChange);

    // Focus/blur on inputs for keyboard detection
    document.addEventListener("focusin", updateState);
    document.addEventListener("focusout", updateState);

    const vv = window.visualViewport;
    if (vv) {
      vv.addEventListener("resize", updateState);
    }

    return () => {
      window.cancelAnimationFrame(initialFrame);
      window.removeEventListener("resize", updateState);
      window.removeEventListener("orientationchange", handleOrientationChange);
      document.removeEventListener("focusin", updateState);
      document.removeEventListener("focusout", updateState);
      if (vv) {
        vv.removeEventListener("resize", updateState);
      }
    };
  }, [updateState, handleOrientationChange]);

  return state;
}
