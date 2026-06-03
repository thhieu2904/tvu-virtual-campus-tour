"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";

const MAP_IMAGE_SRC = "/map_v3.png";
const MAX_RETRIES = 3;

type MapImageProps = {
  alt: string;
  className?: string;
  style?: CSSProperties;
  draggable?: boolean;
  showFallback?: boolean;
  fallbackClassName?: string;
};

export default function MapImage({
  alt,
  className,
  style,
  draggable = false,
  showFallback = true,
  fallbackClassName = "",
}: MapImageProps) {
  const [attempt, setAttempt] = useState(0);
  const [isRetrying, setIsRetrying] = useState(false);
  const [hasFailed, setHasFailed] = useState(false);
  const retryTimerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (retryTimerRef.current) {
        window.clearTimeout(retryTimerRef.current);
      }
    };
  }, []);

  const src = attempt === 0 ? MAP_IMAGE_SRC : `${MAP_IMAGE_SRC}?retry=${attempt}`;

  return (
    <>
      <img
        src={src}
        alt={alt}
        draggable={draggable}
        className={className}
        style={style}
        onLoad={() => {
          setIsRetrying(false);
          setHasFailed(false);
        }}
        onError={() => {
          if (attempt >= MAX_RETRIES) {
            setIsRetrying(false);
            setHasFailed(true);
            return;
          }

          setIsRetrying(true);
          if (retryTimerRef.current) {
            window.clearTimeout(retryTimerRef.current);
          }
          retryTimerRef.current = window.setTimeout(
            () => setAttempt((current) => current + 1),
            250 * (attempt + 1),
          );
        }}
      />

      {showFallback && (isRetrying || hasFailed) && (
        <div
          className={`pointer-events-none absolute inset-0 flex items-center justify-center bg-white/92 text-center text-xs font-semibold text-slate-500 ${fallbackClassName}`}
        >
          {hasFailed ? "Không tải được bản đồ" : "Đang tải lại bản đồ..."}
        </div>
      )}
    </>
  );
}
