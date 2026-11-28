"use client";

import { useState, type FormEvent } from "react";
import { CircleAlert, CircleCheck } from "lucide-react";
import { Notice, Spinner, buttonOutline, buttonYellow } from "@/components/accounts/ui-parts";
import { cn } from "@/lib/utils";
import { AccountClientError } from "@/lib/customer-account-ui";
import {
  SETTING_FIELDS, changedSettings, describeSettingFailure, minimumLeaders, settingValuesFrom, settingsClient, validateSetting,
  validateSettings, type SettingKey, type SettingRow, type SettingValues,
} from "@/lib/admin-insights-ui";

// Q04 system settings (Stitch "Q04 - Settings"): values from GET /api/admin/settings (rendered on the server),
// each changed key saved with PATCH /api/admin/settings/:key. The server re-validates ranges, rejects lowering
// LEADER_RATIO when a confirmed/running departure would lack Leaders (409) and writes a SettingChanged audit event.
export function SystemSettings({ rows }: { rows: readonly SettingRow[] }) {
  const [saved, setSaved] = useState<SettingValues>(() => settingValuesFrom(rows));
  const [draft, setDraft] = useState<SettingValues>(saved);
  const [errors, setErrors] = useState<Partial<Record<SettingKey, string>>>({});
  const [touched, setTouched] = useState<Partial<Record<SettingKey, boolean>>>({});
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ saved: number; failed: number } | null>(null);

  const changed = changedSettings(saved, draft);
  const dirty = changed.length > 0;
  const ratio = Number(saved.LEADER_RATIO);

  const update = (key: SettingKey, value: string) => {
    const next = { ...draft, [key]: value.replace(/[^\d]/g, "").slice(0, 5) };
    setDraft(next);
    setResult(null);
    if (touched[key]) setErrors((current) => ({ ...current, [key]: validateSettings(next)[key] }));
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (busy) return;
    const form = event.currentTarget;
    const found = validateSettings(draft);
    setErrors(found);
    setTouched({ SEAT_TTL_MINUTES: true, MAX_SEATS_PER_INVOICE: true, LEADER_RATIO: true });
    const first = SETTING_FIELDS.find((field) => found[field.key]);
    if (first) return (form.elements.namedItem(first.key) as HTMLInputElement | null)?.focus();
    if (!dirty) return;

    setBusy(true);
    setResult(null);
    let nextSaved = saved;
    const serverErrors: Partial<Record<SettingKey, string>> = {};
    // One key at a time: each PATCH is its own transaction and audit event on the server.
    for (const key of changed) {
      try {
        const row = await settingsClient.update(key, draft[key]);
        nextSaved = { ...nextSaved, [key]: row.setting_value };
      } catch (cause) {
        const error = cause instanceof AccountClientError ? cause : new AccountClientError(0, "NETWORK_ERROR", "");
        serverErrors[key] = describeSettingFailure(key, error.code, error.status);
      }
    }
    setSaved(nextSaved);
    setDraft((current) => Object.fromEntries(SETTING_FIELDS.map((field) => [field.key,
      serverErrors[field.key] ? current[field.key] : nextSaved[field.key]])) as SettingValues);
    setErrors(serverErrors);
    const failed = Object.keys(serverErrors).length;
    setResult({ saved: changed.length - failed, failed });
    setBusy(false);
    const firstFailed = SETTING_FIELDS.find((field) => serverErrors[field.key]);
    if (firstFailed) (form.elements.namedItem(firstFailed.key) as HTMLInputElement | null)?.focus();
  };

  const revert = () => { setDraft(saved); setErrors({}); setTouched({}); setResult(null); };

  return (
    <div className="space-y-6">
      {result && result.saved > 0 && (
        <div role="status" className="flex items-start gap-3 rounded-[5px] border border-[#C8E6C9] bg-[#E8F5E9] p-4 text-sm font-medium text-[#186734]">
          <CircleCheck aria-hidden="true" className="mt-0.5 size-5 shrink-0" />
          Đã lưu {result.saved} tham số. Giá trị mới áp dụng cho các lượt đặt vé và lần chốt chuyến tiếp theo.
        </div>
      )}
      {result && result.failed > 0 && (
        <Notice tone="danger" title={`${result.failed} tham số chưa lưu được`}>Xem lỗi ngay dưới từng ô bên dưới.</Notice>
      )}

      <div className="border-b border-[#E0E0E0] pb-4">
        <h1 className="text-2xl font-bold">Cấu hình hệ thống</h1>
        <p className="mt-1 text-sm text-[#5C636A]">Tham số dùng chung cho đặt vé và phân công Leader.</p>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <form onSubmit={submit} noValidate aria-busy={busy} className="flex flex-col gap-6 rounded-[5px] border border-[#E0E0E0] bg-white p-4 sm:p-6 lg:col-span-8">
          <h2 className="border-b border-[#E0E0E0] pb-4 text-lg font-bold">Tham số vận hành</h2>
          <div className="flex flex-col gap-5">
            {SETTING_FIELDS.map((field) => {
              const error = errors[field.key];
              const id = `setting-${field.key}`;
              return (
                <div key={field.key} className="flex flex-col gap-1.5">
                  <label htmlFor={id} className="text-sm font-semibold">{field.label}</label>
                  <div className="relative">
                    <input id={id} name={field.key} value={draft[field.key]} inputMode="numeric" autoComplete="off" disabled={busy}
                      onChange={(event) => update(field.key, event.target.value)}
                      onBlur={() => {
                        setTouched((current) => ({ ...current, [field.key]: true }));
                        setErrors((current) => ({ ...current, [field.key]: validateSetting(field, draft[field.key]) }));
                      }}
                      aria-invalid={error ? true : undefined} aria-describedby={`${id}-help${error ? ` ${id}-error` : ""}`}
                      className={cn("h-11 w-full rounded-[5px] border bg-white pl-3 pr-16 text-sm tabular-nums outline-none focus:ring-2 disabled:bg-neutral-50",
                        error ? "border-[#C62828] focus:ring-[#C62828]/15" : "border-[#E0E0E0] focus:border-[#186734] focus:ring-[#186734]/15")} />
                    <span aria-hidden="true" className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-[#5C636A]">{field.unit}</span>
                  </div>
                  {error && (
                    <p id={`${id}-error`} className="flex items-center gap-1 text-xs font-medium text-[#C62828]">
                      <CircleAlert aria-hidden="true" className="size-3.5 shrink-0" />{error}
                    </p>
                  )}
                  <p id={`${id}-help`} className="text-xs text-[#5C636A]">{field.help} Từ {field.min} đến {field.max}.</p>
                </div>
              );
            })}
          </div>
          <div className="flex flex-col gap-3 border-t border-[#E0E0E0] pt-5 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs text-[#5C636A]">{dirty ? `${changed.length} tham số chưa lưu` : "Không có thay đổi"} · mỗi lần lưu được ghi vào nhật ký hoạt động.</p>
            <div className="flex flex-col-reverse gap-2 sm:flex-row">
              <button type="button" onClick={revert} disabled={!dirty || busy} className={buttonOutline}>Hoàn tác</button>
              <button type="submit" disabled={!dirty || busy} aria-busy={busy} className={buttonYellow}>
                {busy && <Spinner />}{busy ? "Đang lưu…" : "Lưu thay đổi"}
              </button>
            </div>
          </div>
        </form>

        <aside className="h-fit rounded-[5px] border border-[#E0E0E0] bg-white p-4 sm:p-6 lg:col-span-4">
          <h2 className="mb-4 text-base font-bold">Áp dụng như thế nào</h2>
          <ul className="flex flex-col gap-3 text-sm text-[#4B5563]">
            <li className="flex gap-2.5"><Dot />Thời gian giữ ghế chỉ áp dụng cho lượt giữ ghế mới; hóa đơn đang chờ thanh toán giữ hạn cũ.</li>
            <li className="flex gap-2.5"><Dot />Số ghế tối đa được kiểm tra khi khách tạo hóa đơn.</li>
            <li className="flex gap-2.5"><Dot />Tỷ lệ Leader được kiểm tra khi xác nhận chuyến và trước khi chuyến chạy. Không giảm được nếu có chuyến đã xác nhận hoặc đang chạy sẽ thiếu Leader.</li>
          </ul>
          {Number.isInteger(ratio) && ratio > 0 && (
            <p className="mt-4 rounded-[5px] border border-[#E0E0E0] bg-[#F8F9FA] p-3 text-xs text-[#5C636A]">
              Ví dụ: chuyến có 32 vé hợp lệ cần tối thiểu <strong className="text-[#212529]">{minimumLeaders(32, ratio)} Leader</strong> với {ratio} khách mỗi Leader.
            </p>
          )}
        </aside>
      </div>
    </div>
  );
}

function Dot() {
  return <span aria-hidden="true" className="mt-2 size-1.5 shrink-0 rounded-full bg-[#4B5563]" />;
}
