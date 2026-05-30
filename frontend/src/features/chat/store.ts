import { create } from "zustand";
import { useTourStore } from "@/features/tour/store";
import { ChatMessage } from "./types";
import {
  CHAT_CONNECTION_ERROR_MESSAGE,
  getRandomWaitingMessage,
  isWaitingMessage,
} from "./messages";

// ── Constants ──
const API_URL = process.env.NEXT_PUBLIC_API_URL || "";
const MAX_HISTORY_FOR_AI = 20; // Max messages sent to Gemini for context
const THINKING_STATE_DELAY_MS = 1100;

// ── Types ──
interface ChatState {
  messages: ChatMessage[];
  sessionId: string | null;
  isLoading: boolean;
  error: string | null;
  isTTSEnabled: boolean;

  // === Actions ===
  toggleTTS: () => void;
  initSession: () => Promise<void>;
  resetSession: () => void;
  sendMessage: (message: string, locationId?: string) => Promise<void>;
  addMessage: (message: ChatMessage) => void;
  _appendChunk: (messageId: string, chunk: string) => void;
  _setMessages: (messages: ChatMessage[]) => void;
}

// ── Global Audio Manager ──
let _currentAudio: HTMLAudioElement | null = null;
let _currentAudioUrl: string | null = null;

export function _stopCurrentAudio() {
  if (_currentAudio) {
    _currentAudio.pause();
    _currentAudio.currentTime = 0;
    _currentAudio = null;
  }
  if (_currentAudioUrl) {
    // Only revoke if it's a blob URL
    if (_currentAudioUrl.startsWith("blob:")) {
      URL.revokeObjectURL(_currentAudioUrl);
    }
    _currentAudioUrl = null;
  }
  useTourStore.getState().setAvatarState("idle");
}

export function playPrecachedAudio(url: string) {
  _stopCurrentAudio();
  const audio = new Audio(url);
  _currentAudioUrl = url;
  _currentAudio = audio;

  audio.onplaying = () => {
    if (_currentAudio === audio) {
      useTourStore.getState().setAvatarState("speaking");
    }
  };
  audio.onended = () => {
    if (_currentAudio === audio) {
      _stopCurrentAudio();
    }
  };
  audio.play().then(() => {
    if (_currentAudio === audio) {
      useTourStore.getState().setAvatarState("speaking");
    }
  }).catch(e => {
    console.error("Failed to play precached audio:", e);
    if (_currentAudio === audio) {
      useTourStore.getState().setAvatarState("idle");
    }
  });
}

// ── Tool Call Queue ──
type ToolCall = { name: string; args: Record<string, unknown> };

let _pendingToolCalls: ToolCall[] = [];

/**
 * Queue a tool call to be executed after AI finishes speaking.
 * This ensures sequential flow: AI speaks → map opens → navigate.
 */
function _queueToolCall(toolCall: ToolCall) {
  _pendingToolCalls.push(toolCall);
}

function _hasNavigation(calls: ToolCall[]) {
  return calls.some((toolCall) => toolCall.name === "navigate_to");
}

/**
 * Flush all queued tool calls AFTER AI finishes streaming.
 * Executes in order: navigate_to first, then show_media (deferred).
 */
function _flushToolCalls() {
  const tourStore = useTourStore.getState();
  const calls = [..._pendingToolCalls];
  _pendingToolCalls = [];

  let hasNavigation = false;

  for (const toolCall of calls) {
    switch (toolCall.name) {
      case "navigate_to": {
        const slug = toolCall.args.location_slug as string;
        if (slug && slug !== tourStore.currentLocationSlug) {
          hasNavigation = true;
          // Delay map transition by 3 seconds so the mascot can perform the Thankful bow and speak their guiding sentence before flying away
          setTimeout(() => {
            tourStore.setPendingNavigation(slug);
          }, 3000);
        }
        break;
      }

      case "show_media": {
        const preferredTab = (toolCall.args.media_type as string) === "image" ? "info" as const : "video" as const;
        const focusMediaId = (toolCall.args.focus_media_id as string) || null;

        if (hasNavigation) {
          // Defer media focus until after navigation completes
          tourStore.setPendingMediaFocus({ mediaId: focusMediaId, tab: preferredTab });
        } else {
          // Show immediately at current location
          tourStore.setFocusedMedia(focusMediaId, preferredTab);
          tourStore.setActiveOverlay("info");
        }
        break;
      }

      case "toggle_map": {
        const state = toolCall.args.state as string;
        if (!hasNavigation) {
          // Only toggle map if we're not already about to navigate
          tourStore.setActiveOverlay(state === "open" ? "map" : "none");
        }
        break;
      }

    }
  }
}

function _flushImmediateVisualToolCalls() {
  const calls = [..._pendingToolCalls];
  if (calls.length === 0 || _hasNavigation(calls)) return;

  const hasVisualTool = calls.some((toolCall) =>
    toolCall.name === "show_media" || toolCall.name === "toggle_map"
  );
  if (hasVisualTool) {
    _flushToolCalls();
  }
}

function appendConnectionError(content: string) {
  if (!content || isWaitingMessage(content)) {
    return CHAT_CONNECTION_ERROR_MESSAGE;
  }
  return `${content}\n\n${CHAT_CONNECTION_ERROR_MESSAGE}`;
}

function getErrorMessage(err: unknown) {
  return err instanceof Error ? err.message : "Unexpected error";
}

// ── Store ──
export const useChatStore = create<ChatState>((set, get) => ({
  messages: [],
  sessionId: null,
  isLoading: false,
  error: null,
  isTTSEnabled: true,

  toggleTTS: () => set((state) => {
    const newState = !state.isTTSEnabled;
    if (!newState) {
      _stopCurrentAudio();
    }
    return { isTTSEnabled: newState };
  }),

  _setMessages: (messages) => set({ messages }),

  /**
   * Add a single message to the conversation (append, never replace).
   * Used for intro messages on location change.
   */
  addMessage: (message) => {
    set((state) => ({
      messages: [...state.messages, message],
    }));
  },

  /**
   * Initialize a new chat session (only once per kiosk lifecycle).
   */
  initSession: async () => {
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

  /**
   * Reset session after idle timeout. Clears all messages, creates new session.
   * This is the ONLY place where messages are cleared.
   */
  resetSession: () => {
    set({ messages: [], sessionId: null, error: null });
    // Re-init a fresh session
    get().initSession();
    // Show welcome message from current location
    const location = useTourStore.getState().currentLocation();
    if (location) {
      set({
        messages: [
          {
            id: `intro-${location.slug}-${Date.now()}`,
            role: "assistant",
            content: location.introMessage,
          },
        ],
      });
    }
  },

  _appendChunk: (messageId: string, chunk: string) => {
    set((state) => ({
      messages: state.messages.map((msg) => {
        if (msg.id === messageId) {
          const currentContent = isWaitingMessage(msg.content) ? "" : msg.content;
          return { ...msg, content: currentContent + chunk };
        }
        return msg;
      }),
    }));
  },

  sendMessage: async (message: string, locationId?: string) => {
    const { sessionId, messages, isTTSEnabled } = get();
    let thinkingTimer: ReturnType<typeof setTimeout> | null = null;
    const scheduleThinkingState = () => {
      if (thinkingTimer) return;
      thinkingTimer = setTimeout(() => {
        useTourStore.getState().setAvatarState("thinking");
        thinkingTimer = null;
      }, THINKING_STATE_DELAY_MS);
    };
    const cancelThinkingState = () => {
      if (thinkingTimer) {
        clearTimeout(thinkingTimer);
        thinkingTimer = null;
      }
    };

    // Dừng âm thanh cũ ngay khi có request mới
    _stopCurrentAudio();

    // Optimistic UI update
    const userMsg: ChatMessage = { id: Date.now().toString(), role: "user", content: message };
    const botMsgId = (Date.now() + 1).toString();
    const botMsg: ChatMessage = {
      id: botMsgId,
      role: "assistant",
      content: getRandomWaitingMessage(),
      isStreaming: true,
    };

    set({ messages: [...messages, userMsg, botMsg], isLoading: true, error: null });

    // Fast cache hits should feel immediate; only show thinking for slower requests.
    scheduleThinkingState();

    // Gather history (last N messages for AI context)
    const history = messages.slice(-MAX_HISTORY_FOR_AI).map((m) => ({
      role: m.role,
      content: m.content,
    }));

    // ── Audio-First Mode (TTS enabled) ──
    if (isTTSEnabled) {
      try {
        const res = await fetch(`${API_URL}/api/chat`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            message,
            ...(locationId ? { location_id: locationId } : {}),
            session_id: sessionId,
            tts: true,
            history,
          }),
        });

        if (!res.ok) throw new Error("API responded with an error");

        const data = await res.json();
        cancelThinkingState();
        const toolActions: ToolCall[] = Array.isArray(data.tool_actions) ? data.tool_actions : [];
        const ttsProvider: string | null = data.tts_provider ?? null;

        if (ttsProvider === "edge-tts") {
          console.warn("⚠️ TTS fallback: using Edge TTS (Microsoft) instead of Gemini");
        }

        // Update bot message with full text at once
        set((state) => ({
          isLoading: false,
          messages: state.messages.map((msg) =>
            msg.id === botMsgId
              ? { ...msg, content: data.answer || "", isStreaming: false, ttsProvider }
              : msg
          ),
        }));

        // Queue tool calls from response
        if (toolActions.length > 0) {
          for (const tc of toolActions) {
            _queueToolCall(tc);
          }
          _flushImmediateVisualToolCalls();
        }

        const shouldYieldAudioToImmediateVideo =
          !_hasNavigation(toolActions) &&
          toolActions.some((tc) => tc.name === "show_media" && tc.args.media_type === "video");

        // Chạy logic Tool Call sau khi phát xong audio
        let audioFallbackTimer: ReturnType<typeof setTimeout> | null = null;
        const handleAudioEnded = (audio?: HTMLAudioElement) => {
          if (audio && _currentAudio !== audio) return;
          if (audioFallbackTimer) {
            clearTimeout(audioFallbackTimer);
            audioFallbackTimer = null;
          }
          _stopCurrentAudio();
          if (toolActions.length > 0) {
            _flushToolCalls();
          }
        };
        const startAudioFallbackTimer = (audio: HTMLAudioElement) => {
          const textLength = typeof data.answer === "string" ? data.answer.length : 0;
          const timeoutMs = Math.min(Math.max(textLength * 120, 10000), 30000);
          audioFallbackTimer = setTimeout(() => {
            console.warn("Audio playback timeout — flushing queued tool calls");
            handleAudioEnded(audio);
          }, timeoutMs);
        };

        if (shouldYieldAudioToImmediateVideo) {
          useTourStore.getState().setAvatarState("idle");
          return;
        }

        // Play audio if available
        if (data.audio_url) {
          _currentAudioUrl = data.audio_url;
          const audio = new Audio(data.audio_url);
          _currentAudio = audio;
          audio.onplaying = () => {
            if (_currentAudio === audio) {
              useTourStore.getState().setAvatarState("speaking");
            }
            if (audioFallbackTimer) {
              clearTimeout(audioFallbackTimer);
              audioFallbackTimer = null;
            }
          };
          audio.onended = () => handleAudioEnded(audio);
          audio.onerror = () => {
            console.error("Audio playback load error:", data.audio_url);
            handleAudioEnded(audio);
          };
          audio.onstalled = () => {
            console.warn("Audio playback stalled:", data.audio_url);
          };
          startAudioFallbackTimer(audio);
          audio.play().then(() => {
            if (_currentAudio === audio) {
              useTourStore.getState().setAvatarState("speaking");
            }
          }).catch(e => {
            console.error("Audio playback error:", e);
            handleAudioEnded(audio);
          });
        }
        else if (data.audio_base64) {
          const audioBytes = Uint8Array.from(atob(data.audio_base64), c => c.charCodeAt(0));
          const blob = new Blob([audioBytes], { type: data.audio_content_type || "audio/wav" });
          const url = URL.createObjectURL(blob);
          const audio = new Audio(url);
          _currentAudioUrl = url;
          _currentAudio = audio;

          audio.onplaying = () => {
            if (_currentAudio === audio) {
              useTourStore.getState().setAvatarState("speaking");
            }
            if (audioFallbackTimer) {
              clearTimeout(audioFallbackTimer);
              audioFallbackTimer = null;
            }
          };
          audio.onended = () => handleAudioEnded(audio);
          audio.onerror = () => {
            console.error("Audio blob playback load error");
            handleAudioEnded(audio);
          };
          audio.onstalled = () => {
            console.warn("Audio blob playback stalled");
          };
          startAudioFallbackTimer(audio);
          audio.play().then(() => {
            if (_currentAudio === audio) {
              useTourStore.getState().setAvatarState("speaking");
            }
          }).catch(e => {
            console.error("Audio blob playback error:", e);
            handleAudioEnded(audio);
          });
        } else {
          // No audio (TTS failed) → go idle and flush tools immediately
          useTourStore.getState().setAvatarState("idle");
          setTimeout(() => {
            if (toolActions.length > 0) {
              _flushToolCalls();
            }
          }, 500);
        }

      } catch (err: unknown) {
        cancelThinkingState();
        console.error("Chat error:", err);
        set((state) => ({
          isLoading: false,
          error: getErrorMessage(err),
          messages: state.messages.map((msg) =>
            msg.id === botMsgId
              ? {
                  ...msg,
                  content: appendConnectionError(msg.content),
                  isStreaming: false,
                }
              : msg
          ),
        }));
        useTourStore.getState().setAvatarState("idle");
      }
      return;
    }

    // ── SSE Streaming Mode (TTS disabled / Muted) ──
    try {
      const res = await fetch(`${API_URL}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message,
          ...(locationId ? { location_id: locationId } : {}),
          session_id: sessionId,
          stream: true,
          history,
        }),
      });

      if (!res.ok) {
        throw new Error("API responded with an error");
      }

      const reader = res.body?.getReader();
      if (!reader) throw new Error("No reader available");

      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split(/\r?\n\r?\n/);
        buffer = lines.pop() || "";

        for (const block of lines) {
          if (block.includes("event: sources") || block.includes("event: thought")) {
            continue;
          }

          if (block.includes("event: tool_call")) {
            const dataMatch = block.match(/data: (.*)/);
            if (dataMatch) {
              try {
                const payload = JSON.parse(dataMatch[1]);
                const toolCall = JSON.parse(payload.content);
                _queueToolCall(toolCall);
              } catch (e) {
                console.error("Error parsing tool_call:", e);
              }
            }
            continue;
          }

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

    } catch (err: unknown) {
      cancelThinkingState();
      console.error("Chat error:", err);
      set((state) => ({
        error: getErrorMessage(err),
        messages: state.messages.map((msg) =>
          msg.id === botMsgId
            ? { ...msg, content: appendConnectionError(msg.content) }
            : msg
        ),
      }));
    } finally {
      cancelThinkingState();
      set((state) => ({
        isLoading: false,
        messages: state.messages.map((msg) =>
          msg.id === botMsgId ? { ...msg, isStreaming: false } : msg
        ),
      }));
      useTourStore.getState().setAvatarState("idle");
      setTimeout(() => _flushToolCalls(), 500);
    }
  },
}));
