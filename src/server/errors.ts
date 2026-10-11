import "server-only";

export type ErrorCode = "INVALID_INPUT" | "UNAUTHENTICATED" | "FORBIDDEN" | "NOT_FOUND"
  | "REGISTRATION_UNAVAILABLE" | "RATE_LIMITED" | "ACCESS_CONFLICT" | "AUTH_UNAVAILABLE";

const messages: Record<ErrorCode, string> = {
  INVALID_INPUT: "Dữ liệu không hợp lệ.",
  UNAUTHENTICATED: "Vui lòng đăng nhập lại.",
  FORBIDDEN: "Bạn không có quyền thực hiện thao tác này.",
  NOT_FOUND: "Không tìm thấy dữ liệu.",
  REGISTRATION_UNAVAILABLE: "Không thể đăng ký bằng thông tin này.",
  RATE_LIMITED: "Bạn đã thử quá nhiều lần. Vui lòng thử lại sau.",
  ACCESS_CONFLICT: "Thay đổi này không phù hợp với tài khoản hoặc nhân sự hiện tại.",
  AUTH_UNAVAILABLE: "Dịch vụ đăng nhập tạm thời không khả dụng. Vui lòng thử lại sau.",
};

export class AppError extends Error {
  constructor(public readonly code: ErrorCode, public readonly status: number) {
    super(messages[code]);
  }
}
