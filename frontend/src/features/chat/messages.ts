export const WAITING_MESSAGES = [
  "Mình đang tra cứu thông tin, bạn chờ một chút nhé...",
  "Mình đang kiểm tra dữ liệu để trả lời chính xác hơn...",
  "Để mình tìm thông tin phù hợp nhất cho bạn nhé...",
  "Mình đang đối chiếu dữ liệu, sẽ trả lời ngay sau ít giây...",
];

export const CHAT_CONNECTION_ERROR_MESSAGE =
  "Xin lỗi, hiện tại mình chưa kết nối được tới máy chủ. Bạn thử lại sau một chút nhé.";

export function getRandomWaitingMessage() {
  const index = Math.floor(Math.random() * WAITING_MESSAGES.length);
  return WAITING_MESSAGES[index];
}

export function isWaitingMessage(content?: string | null) {
  return Boolean(content && WAITING_MESSAGES.includes(content));
}
