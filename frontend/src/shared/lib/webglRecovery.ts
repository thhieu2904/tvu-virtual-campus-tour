const WEBGL_RECOVERY_SESSION_KEY = "tvu:webgl-context-recovery:lastReloadAt";
const WEBGL_RECOVERY_COOLDOWN_MS = 60_000;
const WEBGL_RECOVERY_RELOAD_DELAY_MS = 1000;

function isKioskMode() {
  return process.env.NEXT_PUBLIC_KIOSK_MODE === "true";
}

function getLastReloadAt() {
  try {
    return Number(window.sessionStorage.getItem(WEBGL_RECOVERY_SESSION_KEY) || "0");
  } catch {
    return 0;
  }
}

function setLastReloadAt(value: number) {
  try {
    window.sessionStorage.setItem(WEBGL_RECOVERY_SESSION_KEY, String(value));
  } catch {
    // Storage can be unavailable in locked-down kiosk browsers.
  }
}

function recoverFromWebGLContextLoss(source: string, event: Event) {
  event.preventDefault();

  const now = Date.now();
  const lastReloadAt = getLastReloadAt();

  if (!isKioskMode()) {
    console.warn(`[WebGL] Context lost in ${source}. Kiosk recovery is disabled.`);
    return;
  }

  if (now - lastReloadAt < WEBGL_RECOVERY_COOLDOWN_MS) {
    console.error(
      `[WebGL] Context lost again in ${source}; skipping reload to avoid a recovery loop.`,
    );
    return;
  }

  setLastReloadAt(now);
  console.warn(`[WebGL] Context lost in ${source}. Reloading kiosk in 1s.`);
  window.setTimeout(() => {
    window.location.reload();
  }, WEBGL_RECOVERY_RELOAD_DELAY_MS);
}

export function attachWebGLContextRecovery(
  target: HTMLCanvasElement | HTMLElement,
  source: string,
) {
  const canvases =
    target instanceof HTMLCanvasElement
      ? [target]
      : Array.from(target.querySelectorAll("canvas"));

  const handleContextLost = (event: Event) => {
    recoverFromWebGLContextLoss(source, event);
  };

  for (const canvas of canvases) {
    canvas.addEventListener("webglcontextlost", handleContextLost, false);
  }

  return () => {
    for (const canvas of canvases) {
      canvas.removeEventListener("webglcontextlost", handleContextLost);
    }
  };
}
