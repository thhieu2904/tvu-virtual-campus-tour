/* eslint-disable react-hooks/set-state-in-effect */
"use client";

import { useState, useCallback, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";

interface ImageGalleryProps {
  images: { id: string; url: string; caption: string }[];
  isFullscreen?: boolean;
  focusedIndex?: number | null;
  onFocusedIndexConsumed?: () => void;
}

/**
 * ImageGallery — responsive grid with click-to-expand lightbox.
 * - Collapsed panel: 2 columns
 * - Fullscreen panel: 3-4 columns
 * - Click on image → fullscreen lightbox with backdrop blur
 */
export default function ImageGallery({
  images,
  isFullscreen = false,
  focusedIndex = null,
  onFocusedIndexConsumed,
}: ImageGalleryProps) {
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  const openLightbox = useCallback((index: number) => setLightboxIndex(index), []);
  const closeLightbox = useCallback(() => setLightboxIndex(null), []);

  const goNext = useCallback(() => {
    setLightboxIndex((prev) =>
      prev !== null ? (prev + 1) % images.length : null
    );
  }, [images.length]);

  const goPrev = useCallback(() => {
    setLightboxIndex((prev) =>
      prev !== null ? (prev - 1 + images.length) % images.length : null
    );
  }, [images.length]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (lightboxIndex === null) return;
      if (e.key === "Escape") closeLightbox();
      if (e.key === "ArrowRight") goNext();
      if (e.key === "ArrowLeft") goPrev();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [lightboxIndex, closeLightbox, goNext, goPrev]);

  useEffect(() => {
    if (
      focusedIndex !== null &&
      focusedIndex >= 0 &&
      focusedIndex < images.length
    ) {
      openLightbox(focusedIndex);
      onFocusedIndexConsumed?.();
    }
  }, [focusedIndex, images.length, onFocusedIndexConsumed, openLightbox]);

  if (images.length === 0) {
    return (
      <div className="flex items-center justify-center py-8 text-white/40 text-sm">
        Chưa có hình ảnh cho khu vực này
      </div>
    );
  }

  return (
    <>
      {/* Grid */}
      <div className={`grid ${isFullscreen ? "gap-4 grid-cols-[repeat(auto-fill,minmax(200px,1fr))]" : "gap-2.5 grid-cols-2"}`}>
        {images.map((img, index) => (
          <motion.div
            key={img.id}
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: index * 0.05 }}
            className="relative aspect-[4/3] rounded-xl overflow-hidden group cursor-pointer border border-white/10 bg-white/5"
            onClick={() => openLightbox(index)}
          >
            <img
              src={img.url}
              alt={img.caption}
              className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500"
              loading="lazy"
            />
          </motion.div>
        ))}
      </div>

      {/* Lightbox */}
      <AnimatePresence>
        {lightboxIndex !== null && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[200] flex items-center justify-center bg-black/80 backdrop-blur-xl"
            onClick={closeLightbox}
          >
            {/* Image */}
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              transition={{ type: "spring", damping: 25 }}
              className="relative max-w-[80vw] max-h-[80vh]"
              onClick={(e) => e.stopPropagation()}
            >
              <img
                src={images[lightboxIndex].url}
                alt={images[lightboxIndex].caption}
                className="max-w-full max-h-[80vh] rounded-2xl shadow-2xl object-contain"
              />
              {images.length > 1 && (
                <div className="absolute bottom-4 left-1/2 -translate-x-1/2 px-3 py-1.5 rounded-full bg-black/60 backdrop-blur-md text-white/90 text-xs font-medium border border-white/10">
                  {lightboxIndex + 1} / {images.length}
                </div>
              )}
            </motion.div>

            {/* Nav buttons */}
            {images.length > 1 && (
              <>
                <button
                  onClick={(e) => { e.stopPropagation(); goPrev(); }}
                  className="absolute left-4 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-white/10 backdrop-blur-md border border-white/20 flex items-center justify-center text-white hover:bg-white/20 transition-colors cursor-pointer"
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M15 18l-6-6 6-6" />
                  </svg>
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); goNext(); }}
                  className="absolute right-4 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-white/10 backdrop-blur-md border border-white/20 flex items-center justify-center text-white hover:bg-white/20 transition-colors cursor-pointer"
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M9 18l6-6-6-6" />
                  </svg>
                </button>
              </>
            )}

            {/* Close button */}
            <button
              onClick={closeLightbox}
              className="absolute top-4 right-4 w-10 h-10 rounded-full bg-white/10 backdrop-blur-md border border-white/20 flex items-center justify-center text-white hover:bg-white/20 transition-colors cursor-pointer text-lg"
            >
              ✕
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
