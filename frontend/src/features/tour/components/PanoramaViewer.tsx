"use client";

/**
 * PanoramaViewer — Reusable 360° viewer component.
 *
 * Wraps Pannellum in a React component.
 * Just pass `imageUrl` prop → it renders the 360° scene.
 * When imageUrl changes (user navigates) → viewer reloads seamlessly.
 *
 * Reference: src-tham-khao/vercel-360-gallery/index.html
 */

import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

interface PanoramaViewerProps {
  imageUrl: string;
  initialHfov?: number;
  initialPitch?: number;
  initialYaw?: number;
  isTransitioning?: boolean;
}

export default function PanoramaViewer({
  imageUrl,
  initialHfov = 100,
  initialPitch = 0,
  initialYaw = 0,
  isTransitioning = false,
}: PanoramaViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<any>(null);
  const [isLoaded, setIsLoaded] = useState(false);
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    if (!containerRef.current || !imageUrl) return;

    // Dynamic import pannellum (client-side only)
    const loadPannellum = async () => {
      // Import CSS
      if (!document.querySelector('link[href*="pannellum"]')) {
        const link = document.createElement("link");
        link.rel = "stylesheet";
        link.href =
          "https://cdn.jsdelivr.net/npm/pannellum@2.5.6/build/pannellum.css";
        document.head.appendChild(link);
      }

      // Import JS
      if (!(window as any).pannellum) {
        await new Promise<void>((resolve, reject) => {
          const script = document.createElement("script");
          script.src =
            "https://cdn.jsdelivr.net/npm/pannellum@2.5.6/build/pannellum.js";
          script.onload = () => resolve();
          script.onerror = () => reject(new Error("Failed to load Pannellum"));
          document.head.appendChild(script);
        });
      }

      initViewer();
    };

    const initViewer = () => {
      setIsLoaded(false);
      setHasError(false);

      // Destroy previous viewer
      if (viewerRef.current) {
        try {
          viewerRef.current.destroy();
        } catch {
          // ignore
        }
        viewerRef.current = null;
      }

      // Create new viewer (same config as reference project)
      const pannellum = (window as any).pannellum;
      if (!pannellum || !containerRef.current) return;

      viewerRef.current = pannellum.viewer(containerRef.current, {
        type: "equirectangular",
        panorama: imageUrl,
        autoLoad: true,
        showControls: false, // We use our own UI controls
        compass: false,
        hfov: initialHfov,
        pitch: initialPitch,
        yaw: initialYaw,
        keyboardZoom: true,
        mouseZoom: true,
        draggable: true,
        disableKeyboardCtrl: false,
      });

      viewerRef.current.on("load", () => {
        setIsLoaded(true);
      });

      viewerRef.current.on("error", () => {
        setHasError(true);
        setIsLoaded(true);
      });
    };

    loadPannellum();

    return () => {
      if (viewerRef.current) {
        try {
          viewerRef.current.destroy();
        } catch {
          // ignore
        }
        viewerRef.current = null;
      }
    };
  }, [imageUrl, initialHfov, initialPitch, initialYaw]);

  return (
    <div className="absolute inset-0 z-0">
      {/* Pannellum container */}
      <div ref={containerRef} className="w-full h-full" />

      {/* Loading overlay */}
      <AnimatePresence>
        {(!isLoaded || isTransitioning) && (
          <motion.div
            className="absolute inset-0 z-10 flex items-center justify-center bg-[#1a1a2e]"
            initial={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.5 }}
          >
            <div className="text-center">
              <div className="w-10 h-10 border-3 border-white/10 border-t-[#053384] rounded-full animate-spin mx-auto mb-3" />
              <p className="text-white/50 text-sm">Đang tải ảnh 360°...</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Error state */}
      {hasError && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-gradient-to-br from-[#1a3a5c] via-[#2a5a8c] to-[#0a2a4c]">
          <div className="text-center text-white/40">
            <p className="text-5xl mb-3">🏛️</p>
            <p className="text-sm">Không thể tải ảnh 360°</p>
            <p className="text-xs mt-1 text-white/25">
              Vui lòng kiểm tra kết nối mạng
            </p>
          </div>
        </div>
      )}

      {/* Center Swipe Hint Tooltip */}
      {isLoaded && !hasError && (
        <motion.div
          className="absolute inset-0 z-10 flex items-center justify-center pointer-events-none"
          initial={{ opacity: 0 }}
          animate={{ opacity: [0, 1, 1, 0] }}
          transition={{ delay: 1, duration: 4, ease: "easeInOut" }}
        >
          <div className="flex items-center gap-4 bg-black/40 backdrop-blur-sm px-6 py-3 rounded-full text-white/90">
            <span className="animate-pulse">←</span>
            <span className="text-sm font-medium">Vuốt để xoay góc nhìn</span>
            <span className="animate-pulse">→</span>
          </div>
        </motion.div>
      )}
    </div>
  );
}
