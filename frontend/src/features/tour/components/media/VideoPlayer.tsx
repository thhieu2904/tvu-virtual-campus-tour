"use client";

import { useRef, useState, useCallback } from "react";
import { motion } from "framer-motion";

interface VideoPlayerProps {
  url: string;
  caption?: string;
  isFullscreen?: boolean;
}

/**
 * Smart VideoPlayer — auto-detects portrait (9:16) vs landscape (16:9)
 * via HTML5 loadedmetadata event. No DB config needed.
 *
 * Portrait videos get a constrained height + centered layout.
 * Landscape videos fill the available width normally.
 */
export default function VideoPlayer({ url, caption, isFullscreen = false }: VideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isPortrait, setIsPortrait] = useState(false);
  const [hasLoaded, setHasLoaded] = useState(false);

  const handleMetadataLoaded = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    // Detect orientation from actual video dimensions
    setIsPortrait(video.videoHeight > video.videoWidth);
    setHasLoaded(true);
  }, []);

  const togglePlay = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) {
      video.play();
      setIsPlaying(true);
    } else {
      video.pause();
      setIsPlaying(false);
    }
  }, []);

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex flex-col gap-2"
    >
      {/* Video Container — adapts to orientation */}
      <div
        className={`relative rounded-2xl overflow-hidden group cursor-pointer border border-white/10 bg-black/60 shadow-inner mx-auto ${
          isPortrait
            ? isFullscreen
              ? "w-auto max-h-[65vh] aspect-[9/16]"
              : "w-[70%] aspect-[9/16]"
            : "w-full aspect-video"
        }`}
        onClick={togglePlay}
      >
        <video
          ref={videoRef}
          src={url}
          onLoadedMetadata={handleMetadataLoaded}
          onEnded={() => setIsPlaying(false)}
          className="w-full h-full object-contain"
          playsInline
          preload="metadata"
        />

        {/* Play/Pause overlay */}
        {!isPlaying && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/20 group-hover:bg-black/10 transition-colors">
            <div className="w-14 h-14 rounded-full bg-white/10 backdrop-blur-md flex items-center justify-center border border-white/20 group-hover:scale-110 group-hover:bg-blue-600/90 transition-all duration-300 shadow-[0_0_20px_rgba(0,0,0,0.3)]">
              <svg className="w-6 h-6 text-white ml-1" fill="currentColor" viewBox="0 0 24 24">
                <path d="M8 5v14l11-7z" />
              </svg>
            </div>
          </div>
        )}

        {/* Portrait badge */}
        {hasLoaded && isPortrait && (
          <div className="absolute top-2 left-2 px-2 py-0.5 rounded-full bg-black/50 backdrop-blur-sm text-[10px] text-white/70 font-medium">
            Short
          </div>
        )}
      </div>

      {/* Caption */}
      {caption && (
        <div className="flex items-center justify-between px-2">
          <p className="text-[13px] font-medium text-white/80 tracking-wide">{caption}</p>
          {hasLoaded && (
            <span className="text-[10px] px-2 py-0.5 bg-white/10 rounded-full text-white/60 font-medium shrink-0">
              {isPortrait ? "9:16" : "16:9"}
            </span>
          )}
        </div>
      )}
    </motion.div>
  );
}
