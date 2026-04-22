"use client";

import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useTourStore } from "@/features/tour/store";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
}

export default function ChatOverlay() {
  const location = useTourStore((s) => s.currentLocation());
  const navigateTo = useTourStore((s) => s.navigateTo);

  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isListening, setIsListening] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Show intro message when location changes
  useEffect(() => {
    if (!location) return;
    setMessages([
      {
        id: `intro-${location.slug}`,
        role: "assistant",
        content: location.introMessage,
      },
    ]);
  }, [location?.slug]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSend = (text?: string) => {
    const content = text || input.trim();
    if (!content) return;

    const userMsg: Message = {
      id: Date.now().toString(),
      role: "user",
      content,
    };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");

    // Check if it's a navigation command
    const navLink = location?.links.find((l) =>
      content.toLowerCase().includes(l.label.toLowerCase()),
    );

    if (navLink) {
      setTimeout(() => {
        setMessages((prev) => [
          ...prev,
          {
            id: (Date.now() + 1).toString(),
            role: "assistant",
            content: `Được rồi! Mình sẽ đưa bạn tới ${navLink.label.replace("Đi tới ", "").replace("Quay lại ", "")} ngay nhé! 🚀`,
          },
        ]);
        setTimeout(() => navigateTo(navLink.toSlug), 1000);
      }, 500);
    } else {
      // TODO: Call RAG API
      setTimeout(() => {
        setMessages((prev) => [
          ...prev,
          {
            id: (Date.now() + 1).toString(),
            role: "assistant",
            content:
              "Cảm ơn bạn đã hỏi! Mình đang xử lý câu trả lời... (RAG pipeline chưa kết nối)",
          },
        ]);
      }, 800);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // Suggested questions come from current location data
  const suggestedQuestions = location?.suggestedQuestions || [];

  return (
    <div className="absolute bottom-6 left-6 right-6 z-20 flex flex-col items-center gap-3">
      {/* Suggested Questions */}
      <div className="flex gap-2 flex-wrap justify-center">
        {suggestedQuestions.map((q) => (
          <motion.button
            key={q}
            onClick={() => handleSend(q)}
            className="px-4 py-2 bg-white rounded-full text-sm text-[#053384] font-medium shadow-[0_4px_16px_rgba(0,0,0,0.08)] hover:shadow-[0_6px_24px_rgba(0,0,0,0.12)] cursor-pointer transition-shadow"
            whileHover={{ scale: 1.03 }}
            whileTap={{ scale: 0.97 }}
          >
            {q}
          </motion.button>
        ))}
      </div>

      {/* Chat Messages */}
      <AnimatePresence>
        {messages.length > 0 && (
          <motion.div
            className="w-full max-w-[700px] max-h-[240px] overflow-y-auto rounded-2xl bg-white shadow-[0_8px_32px_rgba(0,0,0,0.10)] p-4 space-y-3"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
          >
            {messages.map((msg) => (
              <motion.div
                key={msg.id}
                className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.2 }}
              >
                <div
                  className={`max-w-[80%] px-4 py-2.5 rounded-2xl text-sm leading-relaxed ${
                    msg.role === "user"
                      ? "bg-[#053384] text-white rounded-br-md"
                      : "bg-[#f0f4fa] text-[#333333] rounded-bl-md"
                  }`}
                >
                  {msg.content}
                </div>
              </motion.div>
            ))}
            <div ref={messagesEndRef} />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Input Bar */}
      <div className="w-full max-w-[700px] flex items-center gap-3">
        <div className="flex-1 flex items-center bg-white rounded-2xl shadow-[0_8px_32px_rgba(0,0,0,0.10)] px-5 py-3">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Nhập câu hỏi hoặc bấm mic để nói..."
            className="flex-1 text-sm text-[#333] placeholder:text-gray-400 outline-none bg-transparent"
          />
          <motion.button
            onClick={() => handleSend()}
            disabled={!input.trim()}
            className={`ml-3 w-9 h-9 flex items-center justify-center rounded-full transition-colors cursor-pointer ${
              input.trim()
                ? "bg-[#053384] text-white"
                : "bg-gray-100 text-gray-400"
            }`}
            whileHover={input.trim() ? { scale: 1.1 } : {}}
            whileTap={input.trim() ? { scale: 0.9 } : {}}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
              <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
            </svg>
          </motion.button>
        </div>

        {/* Microphone */}
        <motion.button
          onClick={() => setIsListening(!isListening)}
          className={`relative w-14 h-14 flex items-center justify-center rounded-full shadow-[0_8px_32px_rgba(0,0,0,0.12)] cursor-pointer transition-colors ${
            isListening
              ? "bg-red-500 text-white"
              : "bg-white text-[#053384] hover:bg-[#e8eef8]"
          }`}
          whileHover={{ scale: 1.08 }}
          whileTap={{ scale: 0.92 }}
        >
          {isListening && (
            <span className="absolute inset-0 rounded-full bg-red-500 animate-ping opacity-25" />
          )}
          <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm5.91-3c-.49 0-.9.36-.98.85C16.52 14.2 14.47 16 12 16s-4.52-1.8-4.93-4.15c-.08-.49-.49-.85-.98-.85-.61 0-1.09.54-1 1.14.49 3 2.89 5.35 5.91 5.78V20c0 .55.45 1 1 1s1-.45 1-1v-2.08c3.02-.43 5.42-2.78 5.91-5.78.1-.6-.39-1.14-1-1.14z" />
          </svg>
        </motion.button>
      </div>
    </div>
  );
}
