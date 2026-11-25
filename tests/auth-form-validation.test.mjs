import assert from "node:assert/strict";
import { test } from "node:test";
import {
  loginFailureMessage, normalizePhone, registerFailureMessage, toRegistrationPayload, validateEmail, validateFullName,
  validateLogin, validateNewPassword, validatePhone, validateRegistration,
} from "../src/lib/auth-form-validation.ts";
import { registrationSchema } from "../src/schemas/auth.ts";

const valid = {
  fullName: "  Trần   Thị Bích ", email: " Bich.Tran@Vi-Du.VN ", phone: "0912 345.678",
  password: "mat khau du dai", confirmPassword: "mat khau du dai",
};

test("login requires a well-formed email and a password", () => {
  assert.deepEqual(Object.keys(validateLogin({ email: "", password: "" })).sort(), ["email", "password"]);
  assert.match(validateEmail("ten@congty") ?? "", /định dạng/);
  assert.match(validateEmail("a b@x.vn") ?? "", /định dạng/);
  assert.match(validateEmail(`${"a".repeat(250)}@x.vn`) ?? "", /254/);
  assert.equal(validateEmail("  TEN@CongTy.vn "), undefined);
  // Login does not enforce the 12-character registration rule, only the bcrypt byte limit.
  assert.deepEqual(validateLogin({ email: "ten@congty.vn", password: "short" }), {});
  assert.match(validateLogin({ email: "ten@congty.vn", password: "đ".repeat(37) }).password ?? "", /72/);
});

test("registration rules match the server schema", () => {
  assert.deepEqual(validateRegistration(valid), {});
  assert.equal(registrationSchema.safeParse(toRegistrationPayload(valid)).success, true);
  assert.deepEqual(toRegistrationPayload(valid), {
    email: "bich.tran@vi-du.vn", password: "mat khau du dai", full_name: "Trần Thị Bích", phone: "0912345678",
  });
});

test("registration reports each invalid field", () => {
  const errors = validateRegistration({ fullName: "A", email: "x", phone: "12ab", password: "short", confirmPassword: "other" });
  assert.deepEqual(Object.keys(errors).sort(), ["confirmPassword", "email", "fullName", "password", "phone"]);
  assert.match(validateFullName("<script>") ?? "", /chữ cái/);
  assert.match(validateFullName("Nguyễn 123") ?? "", /chữ cái/);
  assert.equal(validateFullName("Nguyễn Văn A"), undefined);
  assert.match(validatePhone("12345678") ?? "", /9 đến 15/);
  assert.equal(validatePhone("+84 912 345 678"), undefined);
  assert.equal(normalizePhone(" (091) 234-5678 "), "0912345678");
  assert.match(validateNewPassword("            ") ?? "", /khoảng trắng/);
  assert.match(validateNewPassword("a".repeat(11)) ?? "", /12/);
  assert.match(validateNewPassword("đ".repeat(40)) ?? "", /72/);
  assert.match(validateRegistration({ ...valid, confirmPassword: "" }).confirmPassword ?? "", /nhập lại/);
});

test("server failures map to safe messages", () => {
  assert.equal(loginFailureMessage(null), null);
  assert.match(loginFailureMessage("CredentialsSignin") ?? "", /không đúng/);
  assert.match(loginFailureMessage("AUTH_UNAVAILABLE") ?? "", /gián đoạn/);
  assert.match(registerFailureMessage(429), /15 phút/);
  assert.match(registerFailureMessage(500), /Chưa thể/);
});
