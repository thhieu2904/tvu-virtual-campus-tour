import { EventStreamContentType, fetchEventSource } from "@microsoft/fetch-event-source";
import { create } from "zustand";

import { useTourStore, onNavigationStart } from "@/features/tour/store";

import {
  CHAT_CONNECTION_ERROR_MESSAGE,
  getRandomWaitingMessage,
  isWaitingMessage,
} from "./messages";
import { ChatMessage } from "./types";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "";
const MAX_HISTORY_FOR_AI = 12;
const THINKING_STATE_DELAY_MS = 1100;
const NAVIGATION_AFTER_AUDIO_DELAY_MS = 500;

type ToolCall = { name: string; args: Record<string, unknown> };
type SsePayload = Record<string, unknown> & { request_id?: string };

interface ChatState {
  messages: ChatMessage[];
  sessionId: string | null;
  isLoading: boolean;
  error: string | null;
  isTTSEnabled: boolean;

  toggleTTS: () => void;
  initSession: () => Promise<string | null>;
  resetSession: () => void;
  sendMessage: (message: string, locationId?: string) => Promise<void>;
  addMessage: (message: ChatMessage) => void;
  _appendChunk: (messageId: string, chunk: string) => void;
  _setMessages: (messages: ChatMessage[]) => void;
}

let _currentAudio: HTMLAudioElement | null = null;
let _currentAudioUrl: string | null = null;
let _activeChatAbortController: AbortController | null = null;
let _activeRequestId: string | null = null;
let _pendingToolCalls: ToolCall[] = [];
let _initSessionPromise: Promise<string | null> | null = null;

function _clearPendingToolCalls() {
  _pendingToolCalls = [];
}

function _abortActiveRequest() {
  if (_activeChatAbortController) {
    _activeChatAbortController.abort();
    _activeChatAbortController = null;
  }
}

export function _stopCurrentAudio() {
  if (_currentAudio) {
    _currentAudio.pause();
    _currentAudio.currentTime = 0;
    _currentAudio = null;
  }
  if (_currentAudioUrl) {
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
  }).catch((error) => {
    console.error("Failed to play precached audio:", error);
    if (_currentAudio === audio) {
      useTourStore.getState().setAvatarState("idle");
    }
  });
}

onNavigationStart(() => {
  _abortActiveRequest();
  _clearPendingToolCalls();
  _stopCurrentAudio();
});

function _isToolCall(value: unknown): value is ToolCall {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<ToolCall>;
  return typeof candidate.name === "string" && !!candidate.args && typeof candidate.args === "object";
}

function _setToolCalls(requestId: string, calls: unknown[]) {
  if (_activeRequestId !== requestId) return;
  _pendingToolCalls = calls.filter(_isToolCall);
}

function _hasNavigation(calls: ToolCall[]) {
  return calls.some((toolCall) => toolCall.name === "navigate_to");
}

function _flushToolCalls(requestId: string) {
  if (_activeRequestId !== requestId) return;

  const tourStore = useTourStore.getState();
  const calls = [..._pendingToolCalls];
  _clearPendingToolCalls();
  const hasNavigation = _hasNavigation(calls);

  for (const toolCall of calls) {
    switch (toolCall.name) {
      case "navigate_to": {
        const slug = toolCall.args.location_slug;
        if (typeof slug === "string" && slug && slug !== tourStore.currentLocationSlug) {
          setTimeout(() => {
            if (_activeRequestId === requestId) {
              tourStore.setPendingNavigation(slug);
            }
          }, NAVIGATION_AFTER_AUDIO_DELAY_MS);
        }
        break;
      }

      case "show_media": {
        const mediaType = toolCall.args.media_type;
        const preferredTab = mediaType === "image" ? "info" as const : "video" as const;
        const focusMediaId = typeof toolCall.args.focus_media_id === "string"
          ? toolCall.args.focus_media_id
          : null;

        if (hasNavigation) {
          tourStore.setPendingMediaFocus({ mediaId: focusMediaId, tab: preferredTab });
        } else {
          tourStore.setFocusedMedia(focusMediaId, preferredTab);
          tourStore.setActiveOverlay("info");
        }
        break;
      }

      case "toggle_map": {
        const state = toolCall.args.state;
        if (!hasNavigation && (state === "open" || state === "close")) {
          tourStore.setActiveOverlay(state === "open" ? "map" : "none");
        }
        break;
      }
    }
  }
}

function _flushImmediateVisualToolCalls(requestId: string) {
  if (_activeRequestId !== requestId || _pendingToolCalls.length === 0) return;
  if (_hasNavigation(_pendingToolCalls)) return;

  const hasVisualTool = _pendingToolCalls.some(
    (toolCall) => toolCall.name === "show_media" || toolCall.name === "toggle_map",
  );
  if (hasVisualTool) {
    _flushToolCalls(requestId);
  }
}

function _playResponseAudio(
  requestId: string,
  url: string,
  answerLength: number,
  onFinished: () => void,
) {
  if (_activeRequestId !== requestId) return;
  _stopCurrentAudio();

  const audio = new Audio(url);
  _currentAudioUrl = url;
  _currentAudio = audio;
  const timeoutMs = Math.min(Math.max(answerLength * 120, 10000), 45000);
  let fallbackTimer: ReturnType<typeof setTimeout> | null = setTimeout(() => {
    console.warn("Audio playback timeout — flushing queued tool calls");
    if (_currentAudio === audio) {
      _stopCurrentAudio();
      onFinished();
    }
  }, timeoutMs);

  const finish = () => {
    if (_currentAudio !== audio) return;
    if (fallbackTimer) {
      clearTimeout(fallbackTimer);
      fallbackTimer = null;
    }
    _stopCurrentAudio();
    onFinished();
  };

  audio.onplaying = () => {
    if (_currentAudio === audio) {
      useTourStore.getState().setAvatarState("speaking");
    }
  };
  audio.onended = finish;
  audio.onerror = () => {
    console.error("Audio playback load error:", url);
    finish();
  };
  audio.onstalled = () => {
    console.warn("Audio playback stalled:", url);
  };
  audio.play().catch((error) => {
    console.error("Audio playback error:", error);
    finish();
  });
}

function appendConnectionError(content: string) {
  if (!content || isWaitingMessage(content)) {
    return CHAT_CONNECTION_ERROR_MESSAGE;
  }
  return `${content}\n\n${CHAT_CONNECTION_ERROR_MESSAGE}`;
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Unexpected error";
}

function parsePayload(data: string): SsePayload {
  const parsed = JSON.parse(data) as unknown;
  if (!parsed || typeof parsed !== "object") {
    throw new Error("Invalid SSE payload");
  }
  return parsed as SsePayload;
}

export const useChatStore = create<ChatState>((set, get) => ({
  messages: [],
  sessionId: null,
  isLoading: false,
  error: null,
  isTTSEnabled: true,

  toggleTTS: () => set((state) => {
    const isTTSEnabled = !state.isTTSEnabled;
    if (!isTTSEnabled) {
      _stopCurrentAudio();
    }
    return { isTTSEnabled };
  }),

  _setMessages: (messages) => set({ messages }),

  addMessage: (message) => {
    set((state) => ({ messages: [...state.messages, message] }));
  },

  initSession: async () => {
    const existingSessionId = get().sessionId;
    if (existingSessionId) return existingSessionId;
    if (_initSessionPromise) return _initSessionPromise;

    _initSessionPromise = (async () => {
      try {
        const response = await fetch(`${API_URL}/api/chat/session`, { method: "POST" });
        if (!response.ok) throw new Error("Failed to init chat session");
        const data = await response.json();
        set({ sessionId: data.session_id });
        return data.session_id as string | null;
      } catch (error) {
        console.error(error);
        set({ error: "Could not initialize chat session." });
        return null;
      } finally {
        _initSessionPromise = null;
      }
    })();
    return _initSessionPromise;
  },

  resetSession: () => {
    _abortActiveRequest();
    _clearPendingToolCalls();
    _activeRequestId = null;
    _stopCurrentAudio();
    set({ messages: [], sessionId: null, error: null, isLoading: false });

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

  _appendChunk: (messageId, chunk) => {
    set((state) => ({
      messages: state.messages.map((message) => {
        if (message.id !== messageId) return message;
        const currentContent = isWaitingMessage(message.content) ? "" : message.content;
        return { ...message, content: currentContent + chunk };
      }),
    }));
  },

  sendMessage: async (message, locationId) => {
    const { sessionId, messages, isTTSEnabled } = get();
    let thinkingTimer: ReturnType<typeof setTimeout> | null = null;
    let receivedDone = false;
    let audioStarted = false;
    let requestId = `client-${Date.now()}`;

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

    _abortActiveRequest();
    _clearPendingToolCalls();
    _stopCurrentAudio();
    const abortController = new AbortController();
    _activeChatAbortController = abortController;
    _activeRequestId = requestId;

    const userMessage: ChatMessage = { id: Date.now().toString(), role: "user", content: message };
    const botMessageId = (Date.now() + 1).toString();
    const botMessage: ChatMessage = {
      id: botMessageId,
      role: "assistant",
      content: getRandomWaitingMessage(),
      isStreaming: true,
    };
    set({ messages: [...messages, userMessage, botMessage], isLoading: true, error: null });
    scheduleThinkingState();

    const history = messages.slice(-MAX_HISTORY_FOR_AI).map((item) => ({
      role: item.role,
      content: item.content,
    }));
    const ensureSession = async () => {
      const activeSessionId = get().sessionId || sessionId || await get().initSession();
      if (!activeSessionId) throw new Error("Could not initialize chat session.");
      return activeSessionId;
    };

    try {
      const activeSessionId = await ensureSession();
      await fetchEventSource(`${API_URL}/api/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: EventStreamContentType,
        },
        body: JSON.stringify({
          message,
          ...(locationId ? { location_id: locationId } : {}),
          session_id: activeSessionId,
          stream: true,
          tts: isTTSEnabled,
          history,
        }),
        signal: abortController.signal,
        openWhenHidden: true,
        async onopen(response) {
          if (!response.ok) {
            throw new Error(`Chat API responded with ${response.status}`);
          }
          const contentType = response.headers.get("content-type");
          if (!contentType?.startsWith(EventStreamContentType)) {
            throw new Error(`Expected SSE response, received ${contentType || "unknown content type"}`);
          }
        },
        onmessage(event) {
          if (!event.data) return;
          const payload = parsePayload(event.data);
          const eventRequestId = typeof payload.request_id === "string" ? payload.request_id : requestId;

          if (event.event === "start") {
            requestId = eventRequestId;
            _activeRequestId = requestId;
            return;
          }
          if (_activeRequestId !== eventRequestId) return;

          switch (event.event) {
            case "answer": {
              cancelThinkingState();
              const text = typeof payload.text === "string" ? payload.text : "";
              set((state) => ({
                messages: state.messages.map((item) =>
                  item.id === botMessageId
                    ? { ...item, content: text, isStreaming: true }
                    : item,
                ),
              }));
              break;
            }

            case "tool_actions": {
              const actions = Array.isArray(payload.actions) ? payload.actions : [];
              _setToolCalls(requestId, actions);
              _flushImmediateVisualToolCalls(requestId);
              break;
            }

            case "audio_ready": {
              const url = typeof payload.url === "string" ? payload.url : "";
              const provider = typeof payload.provider === "string" ? payload.provider : null;
              if (provider === "edge-tts") {
                console.warn("TTS fallback: using Edge TTS instead of Gemini");
              }
              set((state) => ({
                messages: state.messages.map((item) =>
                  item.id === botMessageId ? { ...item, ttsProvider: provider } : item,
                ),
              }));
              if (url && get().isTTSEnabled) {
                audioStarted = true;
                const answerLength = get().messages.find((item) => item.id === botMessageId)?.content.length || 0;
                _playResponseAudio(requestId, url, answerLength, () => _flushToolCalls(requestId));
              }
              break;
            }

            case "error": {
              const recoverable = payload.recoverable === true;
              const errorMessage = typeof payload.message === "string"
                ? payload.message
                : CHAT_CONNECTION_ERROR_MESSAGE;
              if (recoverable) {
                console.warn("Recoverable chat stream error:", payload.code, errorMessage);
              } else {
                throw new Error(errorMessage);
              }
              break;
            }

            case "done": {
              receivedDone = true;
              cancelThinkingState();
              set((state) => ({
                isLoading: false,
                messages: state.messages.map((item) =>
                  item.id === botMessageId ? { ...item, isStreaming: false } : item,
                ),
              }));
              if (!audioStarted) {
                useTourStore.getState().setAvatarState("idle");
                setTimeout(() => _flushToolCalls(requestId), 500);
              }
              break;
            }
          }
        },
        onclose() {
          if (!receivedDone && !abortController.signal.aborted) {
            throw new Error("Chat stream closed before completion");
          }
        },
        onerror(error) {
          throw error;
        },
      });
    } catch (error: unknown) {
      cancelThinkingState();
      if (abortController.signal.aborted) return;

      console.error("Chat error:", error);
      set((state) => ({
        isLoading: false,
        error: getErrorMessage(error),
        messages: state.messages.map((item) =>
          item.id === botMessageId
            ? { ...item, content: appendConnectionError(item.content), isStreaming: false }
            : item,
        ),
      }));
      useTourStore.getState().setAvatarState("idle");
      _clearPendingToolCalls();
    } finally {
      cancelThinkingState();
      if (_activeChatAbortController === abortController) {
        _activeChatAbortController = null;
      }
      if (!receivedDone && !abortController.signal.aborted) {
        set((state) => ({
          isLoading: false,
          messages: state.messages.map((item) =>
            item.id === botMessageId ? { ...item, isStreaming: false } : item,
          ),
        }));
      }
      if (!_currentAudio && !abortController.signal.aborted) {
        useTourStore.getState().setAvatarState("idle");
      }
    }
  },
}));
