"use client";

import { useRef, useState, useCallback, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";

interface VideoPlayerProps {
  url: string;
  caption?: string;
  isFullscreen?: boolean;
  autoPlay?: boolean;
}

function formatTime(seconds: number) {
  if (isNaN(seconds)) return "00:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}

export default function VideoPlayer({ url, caption, isFullscreen = false, autoPlay = false }: VideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  
  const [isPlaying, setIsPlaying] = useState(false);
  const [isPortrait, setIsPortrait] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [hasLoaded, setHasLoaded] = useState(false);
  
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isMuted, setIsMuted] = useState(false);
  const [showControls, setShowControls] = useState(false);
  const controlsTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const handleMetadataLoaded = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    setIsPortrait(video.videoHeight > video.videoWidth);
    setDuration(video.duration);
    setHasLoaded(true);
    setIsLoading(false);
  }, []);

  const handleTimeUpdate = useCallback(() => {
    if (videoRef.current) {
      setCurrentTime(videoRef.current.currentTime);
    }
  }, []);

  const togglePlay = useCallback((e?: React.MouseEvent) => {
    e?.stopPropagation();
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

  const skipBackward = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    if (videoRef.current) {
      const newTime = Math.max(0, videoRef.current.currentTime - 10);
      videoRef.current.currentTime = newTime;
      setCurrentTime(newTime);
    }
  }, []);

  const skipForward = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    if (videoRef.current) {
      const newTime = Math.min(duration, videoRef.current.currentTime + 10);
      videoRef.current.currentTime = newTime;
      setCurrentTime(newTime);
    }
  }, [duration]);

  const handleSeek = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const time = Number(e.target.value);
    if (videoRef.current) {
      videoRef.current.currentTime = time;
      setCurrentTime(time);
    }
  }, []);

  const toggleMute = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    const video = videoRef.current;
    if (!video) return;
    video.muted = !video.muted;
    setIsMuted(video.muted);
  }, []);

  // Show/hide controls on mouse move
  const handleMouseMove = useCallback(() => {
    setShowControls(true);
    if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
    if (isPlaying) {
      controlsTimeoutRef.current = setTimeout(() => {
        setShowControls(false);
      }, 2500);
    }
  }, [isPlaying]);

  const handleMouseLeave = useCallback(() => {
    if (isPlaying) setShowControls(false);
  }, [isPlaying]);

  // Autoplay
  useEffect(() => {
    if (autoPlay && hasLoaded && videoRef.current) {
      const video = videoRef.current;
      video.muted = false;
      setIsMuted(false);

      video.play().then(() => {
        setIsPlaying(true);
      }).catch(() => {
        video.muted = true;
        setIsMuted(true);
        video.play().then(() => {
          setIsPlaying(true);
        }).catch(() => {
          setIsPlaying(false);
        });
      });
    }
  }, [autoPlay, hasLoaded]);

  // Always show controls when paused
  useEffect(() => {
    if (!isPlaying) setShowControls(true);
  }, [isPlaying]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex flex-col gap-2 w-full h-full"
    >
      <div
        ref={containerRef}
        className={`relative rounded-2xl overflow-hidden group cursor-pointer border border-white/10 bg-black shadow-inner mx-auto flex items-center justify-center ${
          isFullscreen
            ? "w-full h-full"
            : isPortrait
              ? "h-[min(52vh,430px)] w-auto max-w-full aspect-[9/16]"
              : "w-full aspect-video"
        }`}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        onClick={togglePlay}
      >
        {/* Loading skeleton */}
        {isLoading && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/40 z-10">
            <div className="flex items-center gap-3">
              <motion.div
                className="w-8 h-8 border-2 border-white/30 border-t-white rounded-full"
                animate={{ rotate: 360 }}
                transition={{ repeat: Infinity, duration: 1, ease: "linear" }}
              />
              <span className="text-xs text-white/50">Đang tải video...</span>
            </div>
          </div>
        )}

        <video
          ref={videoRef}
          src={url}
          onLoadedMetadata={handleMetadataLoaded}
          onTimeUpdate={handleTimeUpdate}
          onPlay={() => setIsPlaying(true)}
          onPause={() => setIsPlaying(false)}
          onEnded={() => setIsPlaying(false)}
          className={`w-full h-full ${isFullscreen && !isPortrait ? "object-cover" : "object-contain"}`}
          muted={isMuted}
          playsInline
          preload="metadata"
        />

        {/* Big Play Button Overlay (when paused) */}
        <AnimatePresence>
          {!isPlaying && hasLoaded && (
            <motion.div
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.8 }}
              className="absolute inset-0 flex items-center justify-center bg-black/20 pointer-events-none z-20"
            >
              <div className="w-16 h-16 rounded-full bg-white/10 backdrop-blur-md flex items-center justify-center border border-white/20 shadow-[0_0_30px_rgba(0,0,0,0.5)]">
                <svg className="w-7 h-7 text-white ml-1" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M8 5v14l11-7z" />
                </svg>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Custom Glassmorphism Controls */}
        <AnimatePresence>
          {showControls && hasLoaded && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 10 }}
              transition={{ duration: 0.2 }}
              className={`absolute bottom-0 left-0 right-0 ${isFullscreen ? "p-3" : "p-4"} bg-gradient-to-t from-black/80 via-black/40 to-transparent z-30`}
              onClick={(e) => e.stopPropagation()} // Prevent video toggle when clicking controls
            >
              <div className="flex flex-col gap-2">
                {/* Progress Bar */}
                <div className="flex items-center gap-3">
                  <span className="text-[10px] font-medium text-white/80 w-8 text-right font-mono">
                    {formatTime(currentTime)}
                  </span>
                  <input
                    type="range"
                    min="0"
                    max={duration || 100}
                    value={currentTime}
                    onChange={handleSeek}
                    className="flex-1 h-1.5 appearance-none bg-white/20 rounded-full outline-none [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:rounded-full cursor-pointer hover:[&::-webkit-slider-thumb]:scale-125 transition-all"
                    style={{
                      background: `linear-gradient(to right, #3b82f6 ${(currentTime / duration) * 100}%, rgba(255,255,255,0.2) ${(currentTime / duration) * 100}%)`
                    }}
                  />
                  <span className="text-[10px] font-medium text-white/50 w-8 font-mono">
                    {formatTime(duration)}
                  </span>
                </div>

                {/* Bottom Controls */}
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-1.5 shrink-0 rounded-full bg-black/20 px-1.5 py-1 backdrop-blur-sm">
                    {/* Skip Backward */}
                    <button onClick={skipBackward} className="text-white/80 hover:text-blue-400 transition-colors p-1" title="Lùi 10 giây">
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M11 17l-5-5 5-5M18 17l-5-5 5-5" />
                      </svg>
                    </button>
                    
                    {/* Play/Pause */}
                    <button onClick={togglePlay} className="text-white hover:text-blue-400 transition-colors p-1" title={isPlaying ? "Tạm dừng" : "Phát"}>
                      {isPlaying ? (
                        <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>
                      ) : (
                        <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
                      )}
                    </button>

                    {/* Skip Forward */}
                    <button onClick={skipForward} className="text-white/80 hover:text-blue-400 transition-colors p-1" title="Tiến 10 giây">
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M13 17l5-5-5-5M6 17l5-5-5-5" />
                      </svg>
                    </button>

                    <div className="w-px h-4 bg-white/20 mx-1.5"></div>

                    {/* Mute/Unmute */}
                    <button onClick={toggleMute} className="text-white/80 hover:text-blue-400 transition-colors p-1" title={isMuted ? "Bật âm thanh" : "Tắt âm thanh"}>
                      {isMuted ? (
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 5L6 9H2v6h4l5 4V5z"></path><line x1="23" y1="9" x2="17" y2="15"></line><line x1="17" y1="9" x2="23" y2="15"></line></svg>
                      ) : (
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 5L6 9H2v6h4l5 4V5z"></path><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"></path></svg>
                      )}
                    </button>
                  </div>

                  {/* Caption embedded in control bar */}
                  {caption && isFullscreen && (
                    <div className="hidden sm:block min-w-0 flex-1 text-center text-xs font-medium text-white/80 truncate px-3">
                      {caption}
                    </div>
                  )}

                  {caption && !isFullscreen && (
                    <div className="min-w-0 flex-1 text-right text-xs font-medium text-white/75 truncate">
                      {caption}
                    </div>
                  )}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Portrait badge */}
        {hasLoaded && isPortrait && !showControls && (
          <div className="absolute top-2 left-2 px-2 py-0.5 rounded-full bg-black/50 backdrop-blur-sm text-[10px] text-white/70 font-medium z-10 pointer-events-none">
            Short
          </div>
        )}
      </div>
    </motion.div>
  );
}
