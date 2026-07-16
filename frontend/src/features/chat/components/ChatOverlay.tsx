"use client";

import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown, Sparkles, X } from "lucide-react";
import ReactMarkdown from "react-markdown";
import { useTourStore } from "@/features/tour/store";
import { useChatStore, playPrecachedAudio, _stopCurrentAudio } from "../store";
import { useSpeechRecognition } from "../hooks/useSpeechRecognition";
import { useMobileVisibility } from "@/hooks/useMobileVisibility";
import { isWaitingMessage } from "../messages";

function TypingIndicator() {
  return (
    <span className="inline-flex items-center ml-1.5 gap-1 align-middle">
      <span className="w-1.5 h-1.5 bg-blue-500 rounded-full animate-bounce [animation-delay:-0.3s]"></span>
      <span className="w-1.5 h-1.5 bg-blue-500 rounded-full animate-bounce [animation-delay:-0.15s]"></span>
      <span className="w-1.5 h-1.5 bg-blue-500 rounded-full animate-bounce"></span>
    </span>
  );
}

export default function ChatOverlay() {
  const location = useTourStore((s) => s.currentLocation());
  const isAppReady = useTourStore((s) => s.isAppReady);
  const activeOverlay = useTourStore((s) => s.activeOverlay);
  const setActiveOverlay = useTourStore((s) => s.setActiveOverlay);
  const avatarState = useTourStore((s) => s.avatarState);
  const setSubtitleOverlayVisible = useTourStore((s) => s.setSubtitleOverlayVisible);
  const {
    isMobileLandscape,
    canShowSubtitle, canShowSuggestions, canShowBottomDock,
  } = useMobileVisibility();

  const {
    messages,
    isLoading,
    sendMessage,
    addMessage,
    _setMessages,
    isTTSEnabled,
  } = useChatStore();
  const [input, setInput] = useState("");
  const [dismissedSubtitleId, setDismissedSubtitleId] = useState<string | null>(null);
  const [areSuggestionsExpanded, setAreSuggestionsExpanded] = useState(true);
  const locationId = location?.id;
  const locationSlug = location?.slug;
  const locationName = location?.name;
  const locationIntroMessage = location?.introMessage;
  const locationIntroAudioUrl = location?.intro_audio_url;
  const locationRevisitAudioUrl = location?.revisit_audio_url;

  const handleSend = (text: string) => {
    if (!text.trim() || isLoading) return;
    // All messages go through AI Agent — it decides whether to navigate, show media, etc.
    sendMessage(text, locationId);
    setInput("");
  };

  const handleSpeechResult = (text: string) => {
    handleSend(text);
  };

  const {
    isListening,
    transcript,
    startListening,
    stopListening,
    browserSupportsSpeechRecognition,
  } = useSpeechRecognition(handleSpeechResult);

  const isTranscriptOpen = activeOverlay === "transcript";
  const transcriptEndRef = useRef<HTMLDivElement>(null);
  const prevSlugRef = useRef<string | null>(null);
  const prevIntroSignatureRef = useRef<string | null>(null);

  // Chống Echo: Tự động tắt mic khi Mascot bắt đầu nói
  useEffect(() => {
    if (avatarState === "speaking" && isListening) {
      stopListening();
    }
  }, [avatarState, isListening, stopListening]);

  // Continuous Session: location intro logic
  const isTransitioning = useTourStore((s) => s.isTransitioning);

  useEffect(() => {
    if (!locationSlug || !locationIntroMessage || isLoading || !isAppReady || isTransitioning || activeOverlay === "map") return;

    const isFirstLoad = prevSlugRef.current === null;
    const slugChanged = prevSlugRef.current !== locationSlug;
    const introSignature = `${locationSlug}|${locationIntroMessage}|${locationIntroAudioUrl ?? ""}|${locationRevisitAudioUrl ?? ""}`;
    const introChangedForSameSlug =
      !slugChanged &&
      prevIntroSignatureRef.current !== null &&
      prevIntroSignatureRef.current !== introSignature;

    prevSlugRef.current = locationSlug;
    prevIntroSignatureRef.current = introSignature;

    if (introChangedForSameSlug) {
      const currentMessages = useChatStore.getState().messages;
      _setMessages(
        currentMessages.map((message) => {
          const isLocationIntro =
            message.role === "assistant" &&
            (message.id.startsWith(`intro-${locationSlug}-`) || message.id.startsWith(`nav-${locationSlug}-`));
          return isLocationIntro ? { ...message, content: locationIntroMessage } : message;
        }),
      );
      return;
    }

    if (!slugChanged) return;

    if (isFirstLoad) {
      // Lần đầu tải trang → set intro message
      _setMessages([
        {
          id: `intro-${locationSlug}-${Date.now()}`,
          role: "assistant",
          content: locationIntroMessage,
        },
      ]);
      useTourStore.getState().addVisitedLocation(locationSlug);

      // Phát âm thanh nếu đang bật tiếng và app đã start (tránh phát lén lúc Reset)
      if (
        isTTSEnabled &&
        locationIntroAudioUrl &&
        useTourStore.getState().hasStarted
      ) {
        playPrecachedAudio(locationIntroAudioUrl);
      }
    } else {
      const isRevisit = useTourStore.getState().visitedLocations.has(locationSlug);
      
      // Nếu đã đến rồi -> chào ngắn gọn và phát audio revisit nếu đã cache sẵn.
      if (isRevisit) {
        addMessage({
          id: `nav-${locationSlug}-${Date.now()}`,
          role: "assistant",
          content: `Chào mừng bạn quay lại ${locationName ?? "địa điểm này"}.`,
        });

        if (
          isTTSEnabled &&
          locationRevisitAudioUrl &&
          useTourStore.getState().hasStarted
        ) {
          playPrecachedAudio(locationRevisitAudioUrl);
        }
      } else {
        // User tự bấm map hoặc AI điều hướng → append intro đầy đủ
        addMessage({
          id: `nav-${locationSlug}-${Date.now()}`,
          role: "assistant",
          content: `${locationIntroMessage}`,
        });
        
        useTourStore.getState().addVisitedLocation(locationSlug);
        
        // Phát âm thanh
        if (
          isTTSEnabled &&
          locationIntroAudioUrl &&
          useTourStore.getState().hasStarted
        ) {
          playPrecachedAudio(locationIntroAudioUrl);
        }
      }
    }
  }, [
    locationSlug,
    locationName,
    locationIntroMessage,
    locationIntroAudioUrl,
    locationRevisitAudioUrl,
    isLoading,
    isAppReady,
    isTTSEnabled,
    isTransitioning,
    activeOverlay,
    addMessage,
    _setMessages,
  ]);

  // Tự động cuộn xuống cuối (Transcript)
  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isTranscriptOpen]);

  // KIOSK OPTIMIZATION: keep one assistant subtitle active to prevent stacked bubbles.
  const latestAssistantIndex = messages.findLastIndex((msg) => msg.role === "assistant");
  const latestAssistantMessage =
    latestAssistantIndex >= 0 ? messages[latestAssistantIndex] : null;
  const pairedUserMessage =
    latestAssistantIndex > 0 && messages[latestAssistantIndex - 1]?.role === "user"
      ? messages[latestAssistantIndex - 1]
      : null;
  const displayMessages = [
    ...(pairedUserMessage ? [pairedUserMessage] : []),
    ...(latestAssistantMessage ? [latestAssistantMessage] : []),
  ];
  const activeSubtitleId = latestAssistantMessage?.id ?? pairedUserMessage?.id ?? null;
  const isSubtitleVisible =
    Boolean(activeSubtitleId) && dismissedSubtitleId !== activeSubtitleId;

  // Auto-hide Subtitles
  useEffect(() => {
    if (latestAssistantMessage) {
      const lastMsg = latestAssistantMessage;

      // Bỏ qua việc đặt timer ẩn đi nếu đang hiển thị câu chờ
      if (lastMsg.isStreaming && isWaitingMessage(lastMsg.content)) {
        return;
      }

      // Tính thời gian hiển thị: 8s cơ bản + 50ms cho mỗi ký tự. Max 30s.
      const duration = Math.min(
        30000,
        Math.max(8000, (lastMsg.content?.length || 0) * 50),
      );
      const timer = setTimeout(() => {
        setDismissedSubtitleId(lastMsg.id);
      }, duration);
      return () => clearTimeout(timer);
    }
  }, [latestAssistantMessage]);

  const suggestedQuestions = location?.suggestedQuestions || [];

  // Subtitle + suggestions mutual exclusion (for mobile)
  const showSubtitle = isSubtitleVisible && canShowSubtitle;
  const showSuggestions = canShowSuggestions && !showSubtitle && suggestedQuestions.length > 0;
  const showSuggestionItems = showSuggestions && (!isMobileLandscape || areSuggestionsExpanded);

  useEffect(() => {
    setSubtitleOverlayVisible(isMobileLandscape && showSubtitle);
    return () => setSubtitleOverlayVisible(false);
  }, [isMobileLandscape, setSubtitleOverlayVisible, showSubtitle]);

  const subtitleMessages = isMobileLandscape && latestAssistantMessage
    ? [latestAssistantMessage]
    : displayMessages;

  return (
    <>
      {/* === DYNAMIC SUBTITLES (Speech Bubbles) === */}
      <AnimatePresence>
        {showSubtitle &&
          subtitleMessages.map((msg) => {
            if (msg.role === "assistant") {
              return (
                <motion.div
                  key={msg.id}
                  initial={{ opacity: 0, scale: 0.8, x: -20, y: 20 }}
                  animate={{ opacity: 1, scale: 1, x: 0, y: 0 }}
                  exit={{ opacity: 0, scale: 0.8, y: 10 }}
                  className={`fixed z-50 pointer-events-auto ${
                    isMobileLandscape
                      ? "left-1/2 w-[min(520px,calc(100vw-320px))] min-w-[320px] -translate-x-1/2 origin-bottom"
                      : "right-[30%] top-[15%] w-[420px] max-w-[40vw] origin-bottom-right"
                  }`}
                  style={isMobileLandscape ? { bottom: "calc(var(--m-dock-h) + var(--mb-edge) + 10px)" } : undefined}
                >
                    <div className={`relative flex flex-col overflow-hidden border shadow-[0_18px_55px_rgba(15,23,42,0.24)] backdrop-blur-2xl ${
                      isMobileLandscape
                        ? "max-h-[min(38dvh,156px)] rounded-2xl border-white/15 bg-[#0b1220]/88 text-white"
                        : "max-h-[55vh] rounded-[28px] border-white/75 bg-white/60 text-gray-900"
                    }`}>
                    {/* Row 1: Close button */}
                    <div className={isMobileLandscape
                      ? "absolute right-2 top-2 z-10"
                      : "flex shrink-0 justify-end px-4 pb-0 pt-3"}>
                      <button
                        type="button"
                        onClick={() => {
                          if (activeSubtitleId) setDismissedSubtitleId(activeSubtitleId);
                        }}
                        className={`flex items-center justify-center rounded-full transition-colors ${
                          isMobileLandscape ? "h-9 w-9 bg-white/10 text-white/65 hover:bg-white/20 hover:text-white" : "h-6 w-6 bg-black/8 text-gray-600 hover:bg-black/16 hover:text-gray-900"
                        }`}
                        title="Ẩn phụ đề"
                        aria-label="Ẩn phụ đề"
                      >
                        <X className="h-3.5 w-3.5" strokeWidth={2.5} />
                      </button>
                    </div>
                    {/* Row 2: Content */}
                    <div className={`overflow-y-auto flex-1 whitespace-pre-wrap text-pretty leading-relaxed font-medium [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none] ${
                      isMobileLandscape ? "px-4 pb-4 pt-4 pr-12 text-[14px]" : "px-6 pb-10 text-[16px]"
                    }`}>
                      <ReactMarkdown
                        components={{
                          p: ({ node, ...props }) => {
                            void node;
                            return <p className="mb-2 text-pretty last:mb-0" {...props} />;
                          },
                          strong: ({ node, ...props }) => {
                            void node;
                            return <strong className="font-bold text-blue-600" {...props} />;
                          },
                          ul: ({ node, ...props }) => {
                            void node;
                            return <ul className="list-disc pl-5 mb-2" {...props} />;
                          },
                          ol: ({ node, ...props }) => {
                            void node;
                            return <ol className="list-decimal pl-5 mb-2" {...props} />;
                          },
                          li: ({ node, ...props }) => {
                            void node;
                            return <li className="mb-1" {...props} />;
                          },
                        }}
                      >
                        {msg.content}
                      </ReactMarkdown>
                      {msg.isStreaming && isWaitingMessage(msg.content) && <TypingIndicator />}
                    </div>
                    {/* Edge TTS fallback indicator */}
                    {msg.ttsProvider === "edge-tts" && (
                      <div className="absolute bottom-2 left-4 z-20">
                        <span className="px-2 py-0.5 rounded-full bg-orange-500/20 text-orange-300 text-[10px] font-medium border border-orange-400/20">
                          ⚠ Fallback Voice
                        </span>
                      </div>
                    )}
                    {/* Fade-out Overlay for Kiosk touch scrolling hint */}
                    <div className={`pointer-events-none absolute bottom-0 left-0 right-0 h-8 bg-gradient-to-t to-transparent ${
                      isMobileLandscape ? "from-[#0b1220]/90 rounded-b-2xl" : "from-white/55 rounded-b-[28px]"
                    }`} />
                    {msg.isStreaming && !isWaitingMessage(msg.content) && (
                      <motion.span
                        className="inline-block w-1.5 h-4 ml-1.5 bg-gray-800/70 align-middle"
                        animate={{ opacity: [1, 0] }}
                        transition={{
                          repeat: Infinity,
                          duration: 0.8,
                          ease: "linear",
                        }}
                      />
                    )}

                  </div>
                </motion.div>
              );
            }

            if (msg.role === "user") {
              return (
                <motion.div
                  key={msg.id}
                  initial={{ opacity: 0, y: 20, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -10, scale: 0.95 }}
                  className={`fixed left-1/2 -translate-x-1/2 w-max z-40 pointer-events-auto flex justify-center ${
                    isMobileLandscape ? "max-w-[70vw]" : "bottom-[260px] max-w-[400px]"
                  }`}
                  style={isMobileLandscape ? { bottom: 'calc(var(--m-dock-h) + var(--mb-edge) + 12px)' } : undefined}
                >
                  <div className={`bg-blue-600/90 text-white rounded-full border border-blue-400/30 shadow-xl backdrop-blur-2xl ${
                    isMobileLandscape ? "px-4 py-2 text-[13px]" : "px-6 py-3 text-[15px]"
                  }`}>
                    <span className="whitespace-pre-wrap font-medium">
                      {msg.content}
                    </span>
                  </div>
                </motion.div>
              );
            }
            return null;
          })}
      </AnimatePresence>

      {canShowBottomDock && (
      <div className={`fixed left-1/2 -translate-x-1/2 flex flex-col items-center z-40 pointer-events-none ${
        isMobileLandscape
          ? "w-[min(660px,calc(100vw-180px))] min-w-[320px] gap-2"
          : "bottom-11 gap-4 w-full max-w-3xl"
      }`}
        style={isMobileLandscape ? { bottom: "var(--mb-edge)" } : undefined}
      >
        {/* === QUICK ACTIONS (SUGGESTED QUESTIONS) === */}
        {showSuggestionItems && (
          <div className={`pointer-events-auto ${
            isMobileLandscape
              ? "flex w-full flex-wrap justify-center gap-2 px-2"
              : "flex max-w-[660px] flex-wrap justify-center gap-2 px-4"
          }`}>
            {suggestedQuestions.map((q, idx) => (
              <motion.button
                key={idx}
                onClick={() => handleSend(q)}
                className={`flex items-center justify-center border border-white/[0.12] font-semibold leading-tight shadow-[0_7px_18px_rgba(0,0,0,0.18)] backdrop-blur-xl transition-all hover:-translate-y-0.5 active:scale-95 ${
                  isMobileLandscape
                    ? "min-h-9 max-w-[300px] rounded-full bg-[#0b1220]/68 px-3.5 py-1.5 text-[11px] text-white/82 hover:bg-[#0b1220]/84"
                    : "min-h-9 max-w-[310px] rounded-full bg-[#121511]/34 px-3.5 py-1.5 text-[13px] text-white/82 hover:bg-[#121511]/54"
                }`}
              >
                <span className={isMobileLandscape ? "block whitespace-normal text-center" : ""}>
                  {q}
                </span>
              </motion.button>
            ))}
          </div>
        )}

        <div className={`relative flex items-center overflow-hidden border border-white/[0.14] shadow-[0_14px_38px_rgba(0,0,0,0.32)] backdrop-blur-3xl pointer-events-auto ${
          isMobileLandscape
            ? "h-[var(--m-dock-h)] w-[min(440px,calc(100vw-320px))] min-w-[300px] gap-1 rounded-xl bg-[#0b1220]/78 py-0.5 pl-1.5 pr-0.5"
            : "w-[90%] gap-3 rounded-[3rem] bg-[#121511]/54 py-2 pl-3 pr-2 sm:w-[500px]"
        }`}>
          {/* Subtle glass shimmer */}
          <div className="absolute inset-0 bg-gradient-to-tr from-white/0 via-white/5 to-white/0 skew-x-12 opacity-50 pointer-events-none"></div>

          {isMobileLandscape && showSuggestions && (
            <button
              type="button"
              onClick={() => setAreSuggestionsExpanded((expanded) => !expanded)}
              aria-expanded={areSuggestionsExpanded}
              aria-label={areSuggestionsExpanded ? "Thu g\u1ecdn c\u00e2u h\u1ecfi g\u1ee3i \u00fd" : "Hi\u1ec7n c\u00e2u h\u1ecfi g\u1ee3i \u00fd"}
              className={`relative z-10 ml-0.5 flex h-8 shrink-0 items-center gap-1.5 rounded-lg border px-2 text-[10px] font-semibold transition-all active:scale-95 ${
                areSuggestionsExpanded
                  ? "border-[#8eb2f0]/28 bg-[#8eb2f0]/14 text-[#dce9ff] shadow-[0_4px_14px_rgba(5,51,132,0.18)]"
                  : "border-white/10 bg-white/[0.055] text-white/68 hover:bg-white/10 hover:text-white"
              }`}
              title={areSuggestionsExpanded ? "Thu g\u1ecdn g\u1ee3i \u00fd" : "Hi\u1ec7n c\u00e2u h\u1ecfi g\u1ee3i \u00fd"}
            >
              <Sparkles className={`h-3.5 w-3.5 ${areSuggestionsExpanded ? "text-[#8eb2f0]" : "text-white/55"}`} />
              <span className="max-[700px]:hidden">{"G\u1ee3i \u00fd"}</span>
              <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-black/20 px-1 text-[9px] tabular-nums text-white/65">
                {suggestedQuestions.length}
              </span>
              <motion.span
                animate={{ rotate: areSuggestionsExpanded ? 180 : 0 }}
                transition={{ duration: 0.2 }}
                className="flex"
              >
                <ChevronDown className="h-3 w-3 text-white/45" />
              </motion.span>
            </button>
          )}

          {/* Transcript Toggle Button */}
          <button
            onClick={() => isTranscriptOpen ? setActiveOverlay("none") : setActiveOverlay("transcript")}
            className={`flex items-center justify-center rounded-full transition-all z-10 shrink-0 ${
              isMobileLandscape ? "w-9 h-9" : "w-11 h-11"
            } ${
              isTranscriptOpen
                ? "bg-white/20 text-white"
                : "hover:bg-white/10 text-white/70"
            }`}
            title="Lịch sử trò chuyện"
          >
            <svg
              width="22"
              height="22"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
            </svg>
          </button>

          <div className="flex-1 flex justify-start items-center z-10 w-full border-l border-white/10 pl-3">
            {isListening ? (
              <div className="flex items-center gap-4">
                <div className="flex justify-center gap-1.5 items-center">
                  {[4, 8, 12, 16, 10, 6, 14, 8, 3].map((val, idx) => (
                    <motion.div
                      key={idx}
                      className="w-1.5 bg-red-400 rounded-full shadow-[0_0_8px_rgba(248,113,113,0.8)]"
                      animate={{
                        height: [`${val}px`, `${val * 1.5}px`, `${val}px`],
                      }}
                      transition={{
                        repeat: Infinity,
                        duration: 0.8,
                        delay: idx * 0.1,
                      }}
                    />
                  ))}
                </div>
                <span className="font-medium text-red-400 text-[17px] tracking-wide animate-pulse">
                  {transcript || "Đang lắng nghe..."}
                </span>
              </div>
            ) : (
              <div className="flex w-full items-center min-w-0">
                <input
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleSend(input);
                  }}
                  disabled={isLoading}
                  placeholder="Nhập câu hỏi hoặc bấm mic..."
                  className={`min-w-0 w-full bg-transparent font-medium text-white outline-none placeholder:text-white/45 disabled:opacity-50 ${
                    isMobileLandscape ? "pr-2 text-[14px]" : "pr-4 text-[16px]"
                  }`}
                />
                <AnimatePresence>
                  {input.trim() && !isLoading && (
                    <motion.button
                      initial={{ opacity: 0, scale: 0.5 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.5 }}
                      onClick={() => handleSend(input)}
                      className="ml-2 w-10 h-10 shrink-0 flex items-center justify-center rounded-full bg-blue-600 text-white shadow-[0_0_15px_rgba(37,99,235,0.4)] hover:bg-blue-500 active:scale-90 transition-all"
                    >
                      <svg
                        width="18"
                        height="18"
                        viewBox="0 0 24 24"
                        fill="currentColor"
                      >
                        <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
                      </svg>
                    </motion.button>
                  )}
                </AnimatePresence>
              </div>
            )}
          </div>

          {/* Mic Button */}
          {browserSupportsSpeechRecognition && (
            <button
              onClick={() => {
                if (isListening) {
                  stopListening();
                } else {
                  // Nếu Mascot đang phát giọng nói dở dang, ngắt lời ngay lập tức để người dùng nói
                  if (avatarState === "speaking") {
                    _stopCurrentAudio();
                  }
                  startListening();
                }
              }}
              className={`rounded-full flex items-center justify-center relative group hover:scale-105 active:scale-95 transition-all z-10 shrink-0 ${
                isMobileLandscape ? "w-10 h-10" : "w-15 h-15"
              } ${
                isListening
                  ? "bg-red-500 text-white shadow-[0_0_30px_rgba(239,68,68,0.6)]"
                  : isMobileLandscape
                    ? "border border-white/70 bg-white/95 text-[#1555c0] shadow-[0_3px_12px_rgba(0,0,0,0.24)]"
                    : "bg-white text-blue-800 shadow-[0_0_20px_rgba(255,255,255,0.2)]"
              }`}
            >
              {isListening && (
                <div className="absolute inset-0 scale-110 animate-ping rounded-full border-[3px] border-red-500/40" />
              )}
              <svg
                className={isMobileLandscape ? "h-5 w-5" : "h-7 w-7"}
                viewBox="0 0 24 24"
                fill="currentColor"
                aria-hidden="true"
              >
                <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm5.91-3c-.49 0-.9.36-.98.85C16.52 14.2 14.47 16 12 16s-4.52-1.8-4.93-4.15c-.08-.49-.49-.85-.98-.85-.61 0-1.09.54-1 1.14.49 3 2.89 5.35 5.91 5.78V20c0 .55.45 1 1 1s1-.45 1-1v-2.08c3.02-.43 5.42-2.78 5.91-5.78.1-.6-.39-1.14-1-1.14z" />
              </svg>
            </button>
          )}
        </div>
      </div>
      )}
      {/* END BOTTOM CONTROLS WRAPPER */}

      {/* === EXPANDABLE TRANSCRIPT (Fullscreen on mobile) === */}
      <AnimatePresence>
        {isTranscriptOpen && (
          <>
          {/* Backdrop */}
          {isMobileLandscape && (
            <motion.div
              className="fixed inset-0 bg-black/40 z-35"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setActiveOverlay("none")}
            />
          )}
          <motion.div
            initial={{ opacity: 0, x: -50, scale: 0.95 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            exit={{ opacity: 0, x: -50, scale: 0.95 }}
            transition={{ type: "spring", damping: 25, stiffness: 200 }}
            className={`fixed bg-black/60 backdrop-blur-3xl border border-white/10 shadow-2xl overflow-hidden flex flex-col pointer-events-auto z-40 ${
              isMobileLandscape
                ? "inset-0 m-[var(--mb-edge)] rounded-2xl"
                : "left-6 bottom-24 w-[380px] h-[60vh] max-h-[600px] rounded-3xl"
            }`}
          >
            <div className="p-4 border-b border-white/10 bg-white/5 flex items-center justify-between">
              <h3 className="text-white font-medium flex items-center gap-2">
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
                </svg>
                Lịch sử trò chuyện
              </h3>
              <button
                onClick={() => setActiveOverlay("none")}
                className={`text-white/50 hover:text-white transition-colors flex items-center justify-center ${
                  isMobileLandscape ? "w-11 h-11" : ""
                }`}
              >
                <svg
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <line x1="18" y1="6" x2="6" y2="18"></line>
                  <line x1="6" y1="6" x2="18" y2="18"></line>
                </svg>
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-4 custom-scrollbar">
              {messages.map((msg) => {
                const isUser = msg.role === "user";
                return (
                  <div
                    key={msg.id}
                    className={`flex ${isUser ? "justify-end" : "justify-start"}`}
                  >
                    <div
                      className={`max-w-[85%] px-4 py-3 rounded-2xl text-[15px] leading-relaxed ${
                        isUser
                          ? "bg-blue-600/80 text-white rounded-tr-sm"
                          : "bg-white/10 text-white/90 rounded-tl-sm"
                      }`}
                    >
                      {isUser ? (
                        <span className="whitespace-pre-wrap">
                          {msg.content}
                        </span>
                      ) : (
                        <div className="whitespace-pre-wrap text-pretty [&>p]:mb-2 [&>p:last-child]:mb-0">
                          <ReactMarkdown
                            components={{
                              p: ({ node, ...props }) => {
                                void node;
                                return <p className="mb-2 text-pretty last:mb-0" {...props} />;
                              },
                              strong: ({ node, ...props }) => {
                                void node;
                                return <strong className="font-bold text-blue-300" {...props} />;
                              },
                              ul: ({ node, ...props }) => {
                                void node;
                                return <ul className="list-disc pl-5 mb-2" {...props} />;
                              },
                              ol: ({ node, ...props }) => {
                                void node;
                                return <ol className="list-decimal pl-5 mb-2" {...props} />;
                              },
                              li: ({ node, ...props }) => {
                                void node;
                                return <li className="mb-1" {...props} />;
                              },
                            }}
                          >
                            {msg.content}
                          </ReactMarkdown>
                          {msg.isStreaming && isWaitingMessage(msg.content) && <TypingIndicator />}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
              <div ref={transcriptEndRef} />
            </div>
          </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
