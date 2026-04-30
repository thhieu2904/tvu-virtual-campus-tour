"use client";

import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useTourStore } from "@/features/tour/store";
import { useChatStore } from "../store";

export default function ChatOverlay() {
  const location = useTourStore((s) => s.currentLocation());
  const navigateTo = useTourStore((s) => s.navigateTo);

  const { messages, isLoading, initSession, sendMessage, _setMessages } = useChatStore();
  const [input, setInput] = useState("");
  const [isListening, setIsListening] = useState(false);
  const [isTranscriptOpen, setIsTranscriptOpen] = useState(false);
  const [showSubtitle, setShowSubtitle] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const transcriptEndRef = useRef<HTMLDivElement>(null);

  // Khởi tạo session
  useEffect(() => {
    initSession();
  }, [initSession]);

  // Cập nhật câu chào khi đổi địa điểm
  useEffect(() => {
    if (!location) return;
    _setMessages([
      {
        id: `intro-${location.slug}`,
        role: "assistant",
        content: location.introMessage,
      },
    ]);
  }, [location?.slug, _setMessages]);

  // Tự động cuộn xuống cuối (Transcript)
  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isTranscriptOpen]);

  // Auto-hide Subtitles
  useEffect(() => {
    if (messages.length > 0) {
      setShowSubtitle(true);
      const timer = setTimeout(() => setShowSubtitle(false), 8000);
      return () => clearTimeout(timer);
    }
  }, [messages]);

  const handleSend = (text: string) => {
    if (!text.trim() || isLoading) return;

    // Check lệnh điều hướng
    const navLink = location?.links.find((l) =>
      text.toLowerCase().includes(l.label.toLowerCase()),
    );

    if (navLink) {
      _setMessages([
        ...useChatStore.getState().messages,
        { id: Date.now().toString(), role: "user", content: text },
      ]);
      setTimeout(() => {
        _setMessages([
          ...useChatStore.getState().messages,
          {
            id: (Date.now() + 1).toString(),
            role: "assistant",
            content: `Được rồi! Mình sẽ đưa bạn tới ${navLink.label.replace("Đi tới ", "").replace("Quay lại ", "")} ngay nhé! 🚀`,
          },
        ]);
        setTimeout(() => navigateTo(navLink.toSlug), 1000);
      }, 500);
    } else {
      sendMessage(text, location?.id);
    }
    setInput("");
  };

  // KIOSK OPTIMIZATION: Chỉ hiển thị 2 tin nhắn gần nhất (1 câu hỏi, 1 câu trả lời) dưới dạng Subtitle
  const displayMessages = messages.slice(-2);
  const suggestedQuestions = location?.suggestedQuestions || [];

  return (
    <>
      {/* === DYNAMIC SUBTITLES (Speech Bubbles) === */}
      <AnimatePresence>
        {showSubtitle && displayMessages.map((msg) => {
          if (msg.role === "assistant") {
            return (
              <motion.div
                key={msg.id}
                initial={{ opacity: 0, scale: 0.8, x: -20, y: 20 }}
                animate={{ opacity: 1, scale: 1, x: 0, y: 0 }}
                exit={{ opacity: 0, scale: 0.8, y: 10 }}
                className="fixed left-[32%] top-[25%] w-max max-w-[380px] z-50 pointer-events-auto origin-bottom-left"
              >
                <div className="relative bg-black/70 backdrop-blur-3xl text-white px-6 py-4 rounded-[28px] rounded-bl-xl border border-white/20 shadow-2xl">
                  <span className="whitespace-pre-wrap text-[16px] leading-relaxed font-medium">{msg.content}</span>
                  {msg.isStreaming && (
                    <motion.span
                      className="inline-block w-1.5 h-4 ml-1.5 bg-white/70 align-middle"
                      animate={{ opacity: [1, 0] }}
                      transition={{ repeat: Infinity, duration: 0.8, ease: "linear" }}
                    />
                  )}
                  {/* Speech Bubble Tail */}
                  <div className="absolute -left-2 bottom-2 w-5 h-5 bg-black/70 border-l border-b border-white/20 rounded-bl-md transform rotate-45 -z-10 backdrop-blur-3xl"></div>
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
                className="fixed bottom-[260px] left-1/2 -translate-x-1/2 w-max max-w-[400px] z-40 pointer-events-auto flex justify-center"
              >
                <div className="bg-blue-600/90 text-white px-6 py-3 rounded-full border border-blue-400/30 shadow-xl backdrop-blur-2xl">
                  <span className="whitespace-pre-wrap text-[15px] font-medium">{msg.content}</span>
                </div>
              </motion.div>
            );
          }
          return null;
        })}
      </AnimatePresence>

      {/* === BOTTOM CONTROLS WRAPPER === */}
      <div className="fixed bottom-12 left-1/2 -translate-x-1/2 flex flex-col items-center gap-5 z-40 w-full max-w-3xl pointer-events-none">
        {/* === QUICK ACTIONS (SUGGESTED QUESTIONS) === */}
        {suggestedQuestions.length > 0 && (
          <div className="flex flex-wrap justify-center gap-3 pointer-events-auto px-4">
            {suggestedQuestions.map((q, idx) => (
              <motion.button
                key={idx}
                onClick={() => handleSend(q)}
                className="h-11 px-5 bg-black/40 hover:bg-black/60 backdrop-blur-xl border border-white/20 text-white/90 font-medium text-[15px] rounded-full shadow-lg hover:shadow-white/10 hover:-translate-y-0.5 active:scale-95 transition-all flex items-center gap-2"
              >
                {q}
              </motion.button>
            ))}
          </div>
        )}

      {/* === VOICE HUB (Premium Dark Glass) === */}
      <div className="bg-black/50 backdrop-blur-3xl border border-white/20 shadow-[0_16px_48px_0_rgba(0,0,0,0.4)] rounded-[3rem] pl-4 pr-2 py-2 flex items-center gap-4 pointer-events-auto relative overflow-hidden w-[90%] sm:w-[500px]">
        {/* Subtle glass shimmer */}
        <div className="absolute inset-0 bg-gradient-to-tr from-white/0 via-white/5 to-white/0 skew-x-12 opacity-50 pointer-events-none"></div>
        
        {/* Transcript Toggle Button */}
        <button
          onClick={() => setIsTranscriptOpen(!isTranscriptOpen)}
          className={`w-12 h-12 flex items-center justify-center rounded-full transition-all z-10 shrink-0 ${
            isTranscriptOpen ? "bg-white/20 text-white" : "hover:bg-white/10 text-white/70"
          }`}
          title="Lịch sử trò chuyện"
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
          </svg>
        </button>

        <div className="flex-1 flex justify-start items-center z-10 w-full border-l border-white/10 pl-4">
          {isListening ? (
            <div className="flex items-center gap-4">
              <div className="flex justify-center gap-1.5 items-center">
                {[4, 8, 12, 16, 10, 6, 14, 8, 3].map((val, idx) => (
                  <motion.div
                    key={idx}
                    className="w-1.5 bg-red-400 rounded-full shadow-[0_0_8px_rgba(248,113,113,0.8)]"
                    animate={{ height: [`${val}px`, `${val * 1.5}px`, `${val}px`] }}
                    transition={{ repeat: Infinity, duration: 0.8, delay: idx * 0.1 }}
                  />
                ))}
              </div>
              <span className="font-medium text-red-400 text-[17px] tracking-wide animate-pulse">Đang lắng nghe...</span>
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
                className="min-w-0 w-full bg-transparent text-white placeholder:text-white/50 text-[17px] font-medium outline-none disabled:opacity-50 pr-4"
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
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
                    </svg>
                  </motion.button>
                )}
              </AnimatePresence>
            </div>
          )}
        </div>

        {/* Mic Button */}
        <button
          onClick={() => setIsListening(!isListening)}
          className={`w-16 h-16 rounded-full flex items-center justify-center relative group hover:scale-105 active:scale-95 transition-all z-10 shrink-0 ${
            isListening 
              ? "bg-red-500 text-white shadow-[0_0_30px_rgba(239,68,68,0.6)]" 
              : "bg-white text-blue-800 shadow-[0_0_20px_rgba(255,255,255,0.2)]"
          }`}
        >
          <div className={`absolute inset-0 rounded-full border-[3px] scale-110 transition-colors ${
            isListening ? "border-red-500/40 animate-ping" : "border-white/20"
          }`}></div>
          <svg width="28" height="28" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm5.91-3c-.49 0-.9.36-.98.85C16.52 14.2 14.47 16 12 16s-4.52-1.8-4.93-4.15c-.08-.49-.49-.85-.98-.85-.61 0-1.09.54-1 1.14.49 3 2.89 5.35 5.91 5.78V20c0 .55.45 1 1 1s1-.45 1-1v-2.08c3.02-.43 5.42-2.78 5.91-5.78.1-.6-.39-1.14-1-1.14z" />
          </svg>
        </button>
      </div>

      </div>
      {/* END BOTTOM CONTROLS WRAPPER */}

      {/* === EXPANDABLE TRANSCRIPT (Right Side Panel) === */}
      <AnimatePresence>
        {isTranscriptOpen && (
          <motion.div
            initial={{ opacity: 0, x: 50, scale: 0.95 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            exit={{ opacity: 0, x: 50, scale: 0.95 }}
            transition={{ type: "spring", damping: 25, stiffness: 200 }}
            className="fixed right-6 bottom-36 w-[380px] h-[60vh] max-h-[600px] bg-black/60 backdrop-blur-3xl border border-white/10 rounded-3xl shadow-2xl overflow-hidden flex flex-col pointer-events-auto z-40"
          >
            <div className="p-4 border-b border-white/10 bg-white/5 flex items-center justify-between">
              <h3 className="text-white font-medium flex items-center gap-2">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>
                Lịch sử trò chuyện
              </h3>
              <button onClick={() => setIsTranscriptOpen(false)} className="text-white/50 hover:text-white transition-colors">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
              </button>
            </div>
            
            <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-4 custom-scrollbar">
              {messages.map((msg) => {
                const isUser = msg.role === "user";
                return (
                  <div key={msg.id} className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
                    <div className={`max-w-[85%] px-4 py-3 rounded-2xl text-[15px] leading-relaxed ${
                      isUser ? "bg-blue-600/80 text-white rounded-tr-sm" : "bg-white/10 text-white/90 rounded-tl-sm"
                    }`}>
                      <span className="whitespace-pre-wrap">{msg.content}</span>
                    </div>
                  </div>
                );
              })}
              <div ref={transcriptEndRef} />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
