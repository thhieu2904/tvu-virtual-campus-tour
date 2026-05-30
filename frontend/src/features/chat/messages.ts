export const WAITING_MESSAGES = [
  "",
];

export const CHAT_CONNECTION_ERROR_MESSAGE =
  "Xin lỗi, hiện tại mình chưa kết nối được tới máy chủ. Bạn thử lại sau một chút nhé.";

export function getRandomWaitingMessage() {
  const index = Math.floor(Math.random() * WAITING_MESSAGES.length);
  return WAITING_MESSAGES[index];
}

export function isWaitingMessage(content?: string | null) {
  return WAITING_MESSAGES.includes(content ?? "");
}
