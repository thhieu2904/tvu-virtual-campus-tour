import { useEffect, useRef, useCallback, useState } from "react";

interface UseKioskIdleWatcherOptions {
  idleTimeoutMs?: number;
  warningDurationMs?: number;
  onWarning?: () => void;
  onReset?: () => void;
  onDismiss?: () => void;
  enabled?: boolean;
  paused?: boolean;
}

// Default: 10 minutes idle, 60 seconds warning
const DEFAULT_IDLE_TIMEOUT = 10 * 60 * 1000;
const DEFAULT_WARNING_DURATION = 60 * 1000;
const DEBUG = false; // Set to true to enable logs

export function useKioskIdleWatcher({
  idleTimeoutMs = DEFAULT_IDLE_TIMEOUT,
  warningDurationMs = DEFAULT_WARNING_DURATION,
  onWarning,
  onReset,
  onDismiss,
  enabled = true,
  paused = false,
}: UseKioskIdleWatcherOptions = {}) {
  const [isWarning, setIsWarning] = useState(false);
  const [warningSecondsLeft, setWarningSecondsLeft] = useState(0);

  // Use refs to avoid stale closures and dependency loops
  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isWarningRef = useRef(false);
  const onResetRef = useRef(onReset);
  const onWarningRef = useRef(onWarning);
  const onDismissRef = useRef(onDismiss);

  // Keep refs in sync
  onResetRef.current = onReset;
  onWarningRef.current = onWarning;
  onDismissRef.current = onDismiss;

  const clearAllTimers = useCallback(() => {
    if (idleTimerRef.current) {
      clearTimeout(idleTimerRef.current);
      idleTimerRef.current = null;
    }
    if (countdownRef.current) {
      clearInterval(countdownRef.current);
      countdownRef.current = null;
    }
  }, []);

  const startCountdown = useCallback(() => {
    // Clear any existing countdown
    if (countdownRef.current) clearInterval(countdownRef.current);

    const totalSeconds = Math.floor(warningDurationMs / 1000);
    setWarningSecondsLeft(totalSeconds);

    let remaining = totalSeconds;
    countdownRef.current = setInterval(() => {
      remaining -= 1;
      if (remaining <= 0) {
        // Countdown finished — trigger reset
        clearAllTimers();
        isWarningRef.current = false;
        setIsWarning(false);
        onResetRef.current?.();
      } else {
        setWarningSecondsLeft(remaining);
      }
    }, 1000);
  }, [warningDurationMs, clearAllTimers]);

  const startIdleTimer = useCallback(() => {
    // Clear existing idle timer only (keep countdown if active)
    if (idleTimerRef.current) {
      clearTimeout(idleTimerRef.current);
      idleTimerRef.current = null;
    }

    if (DEBUG) console.log(`[IdleWatcher] Idle timer started (${idleTimeoutMs / 1000}s)`);
    idleTimerRef.current = setTimeout(() => {
      // Idle timeout reached → show warning
      if (DEBUG) console.log("[IdleWatcher] Idle timeout! Showing warning...");
      isWarningRef.current = true;
      setIsWarning(true);
      onWarningRef.current?.();
      startCountdown();
    }, idleTimeoutMs);
  }, [idleTimeoutMs, startCountdown]);

  // Dismiss warning (user clicked "Continue" or touched screen)
  const dismissWarning = useCallback(() => {
    clearAllTimers();
    isWarningRef.current = false;
    setIsWarning(false);
    onDismissRef.current?.();
    startIdleTimer(); // Restart idle timer from scratch
  }, [clearAllTimers, startIdleTimer]);

  // Main effect: manage event listeners and idle timer
  useEffect(() => {
    if (!enabled) {
      if (DEBUG) console.log("[IdleWatcher] Disabled — clearing timers");
      clearAllTimers();
      isWarningRef.current = false;
      setIsWarning(false);
      return;
    }

    if (paused) {
      if (DEBUG) console.log("[IdleWatcher] Paused (AI speaking) — stopping idle timer");
      // Pause: stop idle timer but DON'T clear warning if it's showing
      if (idleTimerRef.current) {
        clearTimeout(idleTimerRef.current);
        idleTimerRef.current = null;
      }
      return;
    }

    if (DEBUG) console.log(`[IdleWatcher] Active! enabled=${enabled}, paused=${paused}`);

    const handleActivity = () => {
      if (isWarningRef.current) {
        // User is active during warning → dismiss it
        dismissWarning();
      } else {
        // User is active normally → reset idle timer
        startIdleTimer();
      }
    };

    // Start the idle timer
    startIdleTimer();

    // Listen for user activity
    window.addEventListener("touchstart", handleActivity, { passive: true });
    window.addEventListener("mousedown", handleActivity, { passive: true });
    window.addEventListener("keydown", handleActivity, { passive: true });
    window.addEventListener("scroll", handleActivity, { passive: true });

    return () => {
      window.removeEventListener("touchstart", handleActivity);
      window.removeEventListener("mousedown", handleActivity);
      window.removeEventListener("keydown", handleActivity);
      window.removeEventListener("scroll", handleActivity);
      clearAllTimers();
    };
    // Only re-run when enabled/paused changes, NOT when isWarning changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, paused]);

  return {
    isWarning,
    warningSecondsLeft,
    dismissWarning,
  };
}
