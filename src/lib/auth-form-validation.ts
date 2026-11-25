// Client-side checks for the login and registration forms. They mirror src/schemas/auth.ts so people see
// the problem next to the field before submitting; the server still validates every request.

export const EMAIL_MAX = 254;
export const PASSWORD_MIN = 12;
export const PASSWORD_MAX_BYTES = 72;
export const NAME_MIN = 2;
export const NAME_MAX = 100;
export const PHONE_INPUT_MAX = 20;

export type LoginFields = { email: string; password: string };
export type RegisterFields = LoginFields & { fullName: string; phone: string; confirmPassword: string };
export type FieldErrors<K extends string> = Partial<Record<K, string>>;

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@.]{2,}$/;
// Letters (any language), combining marks, spaces, apostrophes, dots and hyphens.
const namePattern = /^[\p{L}\p{M}][\p{L}\p{M}\s'.-]*$/u;

export function passwordBytes(value: string): number {
  return new TextEncoder().encode(value).length;
}

export function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

// People type phone numbers with spaces, dots or dashes; the API accepts digits with an optional leading +.
export function normalizePhone(value: string): string {
  return value.trim().replace(/[\s.()-]/g, "");
}

export function normalizeName(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

export function validateEmail(value: string): string | undefined {
  const email = normalizeEmail(value);
  if (!email) return "Vui lòng nhập email.";
  if (email.length > EMAIL_MAX) return `Email tối đa ${EMAIL_MAX} ký tự.`;
  if (!emailPattern.test(email)) return "Email chưa đúng định dạng, ví dụ ten@vi-du.vn.";
  return undefined;
}

export function validateLoginPassword(value: string): string | undefined {
  if (!value) return "Vui lòng nhập mật khẩu.";
  if (passwordBytes(value) > PASSWORD_MAX_BYTES) return "Mật khẩu quá dài (tối đa 72 byte).";
  return undefined;
}

export function validateNewPassword(value: string): string | undefined {
  if (!value) return "Vui lòng nhập mật khẩu.";
  if (!value.trim()) return "Mật khẩu không được chỉ gồm khoảng trắng.";
  if ([...value].length < PASSWORD_MIN) return `Mật khẩu cần tối thiểu ${PASSWORD_MIN} ký tự.`;
  if (passwordBytes(value) > PASSWORD_MAX_BYTES) return "Mật khẩu quá dài (tối đa 72 byte, khoảng 72 ký tự không dấu).";
  return undefined;
}

export function validateFullName(value: string): string | undefined {
  const name = normalizeName(value);
  if (!name) return "Vui lòng nhập họ và tên.";
  if (name.length < NAME_MIN) return `Họ và tên cần ít nhất ${NAME_MIN} ký tự.`;
  if (name.length > NAME_MAX) return `Họ và tên tối đa ${NAME_MAX} ký tự.`;
  if (!namePattern.test(name)) return "Họ và tên chỉ gồm chữ cái và khoảng trắng.";
  return undefined;
}

export function validatePhone(value: string): string | undefined {
  const phone = normalizePhone(value);
  if (!phone) return "Vui lòng nhập số điện thoại.";
  if (!/^\+?[0-9]+$/.test(phone)) return "Số điện thoại chỉ gồm chữ số (có thể bắt đầu bằng +).";
  const digits = phone.replace("+", "").length;
  if (digits < 9 || digits > 15) return "Số điện thoại cần từ 9 đến 15 chữ số.";
  return undefined;
}

export function validateConfirmPassword(password: string, confirm: string): string | undefined {
  if (!confirm) return "Vui lòng nhập lại mật khẩu.";
  if (password !== confirm) return "Mật khẩu nhập lại không khớp.";
  return undefined;
}

function compact<K extends string>(errors: Record<K, string | undefined>): FieldErrors<K> {
  return Object.fromEntries(Object.entries(errors).filter(([, message]) => message)) as FieldErrors<K>;
}

export function validateLogin(fields: LoginFields): FieldErrors<keyof LoginFields> {
  return compact({ email: validateEmail(fields.email), password: validateLoginPassword(fields.password) });
}

export function validateRegistration(fields: RegisterFields): FieldErrors<keyof RegisterFields> {
  return compact({
    fullName: validateFullName(fields.fullName),
    email: validateEmail(fields.email),
    phone: validatePhone(fields.phone),
    password: validateNewPassword(fields.password),
    confirmPassword: validateConfirmPassword(fields.password, fields.confirmPassword),
  });
}

// Single-field check used on blur / while correcting a field that already shows an error.
export function validateRegisterField(field: keyof RegisterFields, fields: RegisterFields): string | undefined {
  return validateRegistration(fields)[field];
}

export function toRegistrationPayload(fields: RegisterFields) {
  return {
    email: normalizeEmail(fields.email),
    password: fields.password,
    full_name: normalizeName(fields.fullName),
    phone: normalizePhone(fields.phone),
  };
}

export function loginFailureMessage(error: string | null | undefined): string | null {
  if (!error) return null;
  if (error === "CredentialsSignin") return "Email hoặc mật khẩu không đúng, hoặc tài khoản không dùng được ở cổng này.";
  if (error === "AUTH_UNAVAILABLE") return "Dịch vụ đăng nhập tạm thời gián đoạn. Vui lòng thử lại sau ít phút.";
  return "Đăng nhập chưa thành công. Vui lòng thử lại.";
}

export function registerFailureMessage(status: number): string {
  if (status === 409) return "Email này không dùng được để đăng ký. Nếu đã có tài khoản, hãy đăng nhập.";
  if (status === 422) return "Thông tin chưa hợp lệ. Vui lòng kiểm tra lại các trường.";
  if (status === 429) return "Bạn đã thử đăng ký quá nhiều lần. Vui lòng thử lại sau 15 phút.";
  if (status === 503) return "Dịch vụ đăng ký tạm thời gián đoạn. Vui lòng thử lại sau ít phút.";
  return "Chưa thể tạo tài khoản lúc này. Vui lòng thử lại sau.";
}
