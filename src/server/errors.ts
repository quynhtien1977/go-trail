import "server-only";

export type ErrorCode = "INVALID_INPUT" | "UNAUTHENTICATED" | "FORBIDDEN" | "NOT_FOUND"
  | "REGISTRATION_UNAVAILABLE" | "RATE_LIMITED" | "ACCESS_CONFLICT" | "AUTH_UNAVAILABLE"
  | "RESOURCE_CONFLICT" | "VEHICLE_UNAVAILABLE" | "BOOKING_UNAVAILABLE" | "CRON_UNAVAILABLE"
  | "TICKET_NOT_FOUND" | "TICKET_NOT_VALID" | "TICKET_WRONG_DEPARTURE" | "CHECKIN_CLOSED" | "ALREADY_CHECKED_IN";

const messages: Record<ErrorCode, string> = {
  INVALID_INPUT: "Dữ liệu không hợp lệ.",
  UNAUTHENTICATED: "Vui lòng đăng nhập lại.",
  FORBIDDEN: "Bạn không có quyền thực hiện thao tác này.",
  NOT_FOUND: "Không tìm thấy dữ liệu.",
  REGISTRATION_UNAVAILABLE: "Không thể đăng ký bằng thông tin này.",
  RATE_LIMITED: "Bạn đã thử quá nhiều lần. Vui lòng thử lại sau.",
  ACCESS_CONFLICT: "Thay đổi này không phù hợp với tài khoản hoặc nhân sự hiện tại.",
  AUTH_UNAVAILABLE: "Dịch vụ đăng nhập tạm thời không khả dụng. Vui lòng thử lại sau.",
  RESOURCE_CONFLICT: "Dữ liệu bị trùng hoặc xung đột với trạng thái hiện tại.",
  VEHICLE_UNAVAILABLE: "Xe đang bảo dưỡng, ngừng hoạt động hoặc đã được phân công trong thời gian này.",
  BOOKING_UNAVAILABLE: "Dịch vụ đặt vé tạm thời không khả dụng. Vui lòng thử lại sau.",
  CRON_UNAVAILABLE: "Tác vụ nền tạm thời không khả dụng. Vui lòng thử lại sau.",
  TICKET_NOT_FOUND: "Không tìm thấy vé với mã này.",
  TICKET_NOT_VALID: "Vé chưa được thanh toán hoặc đã bị hủy, không thể check-in.",
  TICKET_WRONG_DEPARTURE: "Vé này thuộc chuyến khác, không phải chuyến đang check-in.",
  CHECKIN_CLOSED: "Chuyến đã kết thúc, không thể check-in hoặc đánh dấu vắng.",
  ALREADY_CHECKED_IN: "Hành khách đã check-in, không thể đánh dấu vắng.",
};

export class AppError extends Error {
  constructor(public readonly code: ErrorCode, public readonly status: number, public readonly retryAfter?: number) {
    super(messages[code]);
  }
}
