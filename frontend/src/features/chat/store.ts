import { create } from "zustand";
import { useTourStore } from "@/features/tour/store";
import { ChatMessage } from "./types";

interface ChatState {
  messages: ChatMessage[];
  sessionId: string | null;
  isLoading: boolean;
  error: string | null;

  initSession: () => Promise<void>;
  sendMessage: (message: string, locationId?: string) => Promise<void>;
  _appendChunk: (messageId: string, chunk: string) => void;
  _setMessages: (messages: ChatMessage[]) => void;
}

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";

export const useChatStore = create<ChatState>((set, get) => ({
  messages: [],
  sessionId: null,
  isLoading: false,
  error: null,

  _setMessages: (messages) => set({ messages }),

  initSession: async () => {
    // Prevent re-init if session already exists
    if (get().sessionId) return;
    
    try {
      const res = await fetch(`${API_URL}/api/chat/session`, { method: "POST" });
      if (!res.ok) throw new Error("Failed to init chat session");
      const data = await res.json();
      set({ sessionId: data.session_id });
    } catch (err) {
      console.error(err);
      set({ error: "Could not initialize chat session." });
    }
  },

  _appendChunk: (messageId: string, chunk: string) => {
    set((state) => ({
      messages: state.messages.map((msg) =>
        msg.id === messageId ? { ...msg, content: msg.content + chunk } : msg
      ),
    }));
  },

  sendMessage: async (message: string, locationId?: string) => {
    const { sessionId, messages } = get();
    
    // Optimistic UI update
    const userMsg: ChatMessage = { id: Date.now().toString(), role: "user", content: message };
    const botMsgId = (Date.now() + 1).toString();
    const botMsg: ChatMessage = { id: botMsgId, role: "assistant", content: "", isStreaming: true };
    
    set({ messages: [...messages, userMsg, botMsg], isLoading: true, error: null });
    
    // Update avatar state via TourStore
    useTourStore.getState().setAvatarState("thinking");

    // Gather history (last 10 messages, excluding the current user message and the empty bot message)
    const history = messages.slice(-10).map((m) => ({
      role: m.role,
      content: m.content,
    }));

    try {
      const res = await fetch(`${API_URL}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message,
          location_id: locationId,
          session_id: sessionId,
          stream: true,
          history,
        }),
      });

      if (!res.ok) {
        throw new Error("API responded with an error");
      }

      useTourStore.getState().setAvatarState("speaking");

      const reader = res.body?.getReader();
      if (!reader) throw new Error("No reader available");

      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n\n");
        // Keep the last partial block in the buffer
        buffer = lines.pop() || "";

        for (const block of lines) {
          const dataMatch = block.match(/data: (.*)/);
          if (dataMatch) {
            try {
              const data = JSON.parse(dataMatch[1]);
              if (data.content) {
                get()._appendChunk(botMsgId, data.content);
              }
            } catch (e) {
              console.error("Error parsing SSE data:", e, block);
            }
          }
        }
      }

    } catch (err: any) {
      console.error("Chat error:", err);
      // Fallback message if error occurs
      get()._appendChunk(botMsgId, " Xin lỗi, hiện tại mình không thể kết nối tới máy chủ. Vui lòng thử lại sau.");
      set({ error: err.message });
    } finally {
      // Mark streaming as false
      set((state) => ({
        isLoading: false,
        messages: state.messages.map((msg) =>
          msg.id === botMsgId ? { ...msg, isStreaming: false } : msg
        ),
      }));
      useTourStore.getState().setAvatarState("idle");
    }
  },
}));
