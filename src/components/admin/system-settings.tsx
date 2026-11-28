"use client";

import { useState, type FormEvent } from "react";
import { CircleAlert, CircleCheck } from "lucide-react";
import { Notice, buttonOutline, buttonYellow } from "@/components/accounts/ui-parts";
import { cn } from "@/lib/utils";
import {
  SETTING_FIELDS, changedSettings, minimumLeaders, settingValuesFrom, validateSetting, validateSettings,
  type SettingKey, type SettingRow, type SettingValues,
} from "@/lib/admin-insights-ui";

// Q04 system settings (Stitch "Q04 - Settings"). Values are read from SYSTEM_SETTINGS on the server;
// there is no update API yet, so "Lưu thay đổi" only keeps the values on this page.
export function SystemSettings({ rows }: { rows: readonly SettingRow[] }) {
  const [saved, setSaved] = useState<SettingValues>(() => settingValuesFrom(rows));
  const [draft, setDraft] = useState<SettingValues>(saved);
  const [errors, setErrors] = useState<Partial<Record<SettingKey, string>>>({});
  const [touched, setTouched] = useState<Partial<Record<SettingKey, boolean>>>({});
  const [savedNote, setSavedNote] = useState(false);

  const changed = changedSettings(saved, draft);
  const dirty = changed.length > 0;
  const ratio = Number(draft.LEADER_RATIO);

  const update = (key: SettingKey, value: string) => {
    const next = { ...draft, [key]: value.replace(/[^\d]/g, "").slice(0, 3) };
    setDraft(next);
    setSavedNote(false);
    if (touched[key]) setErrors((current) => ({ ...current, [key]: validateSettings(next)[key] }));
  };

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const found = validateSettings(draft);
    setErrors(found);
    setTouched({ SEAT_TTL_MINUTES: true, MAX_SEATS_PER_INVOICE: true, LEADER_RATIO: true });
    const first = SETTING_FIELDS.find((field) => found[field.key]);
    if (first) return (event.currentTarget.elements.namedItem(first.key) as HTMLInputElement | null)?.focus();
    if (!dirty) return;
    const normalized = Object.fromEntries(SETTING_FIELDS.map((field) => [field.key, String(Number(draft[field.key]))])) as SettingValues;
    setSaved(normalized);
    setDraft(normalized);
    setSavedNote(true);
  };

  const revert = () => { setDraft(saved); setErrors({}); setTouched({}); setSavedNote(false); };

  return (
    <div className="space-y-6">
      {savedNote && (
        <div role="status" className="flex items-start gap-3 rounded-[5px] border border-[#C8E6C9] bg-[#E8F5E9] p-4 text-sm font-medium text-[#186734]">
          <CircleCheck aria-hidden="true" className="mt-0.5 size-5 shrink-0" />
          Đã lưu cấu hình trên trang này. Khi có API lưu, giá trị mới sẽ áp dụng cho các lượt đặt vé và lần chốt chuyến tiếp theo.
        </div>
      )}

      <div className="border-b border-[#E0E0E0] pb-4">
        <h1 className="text-2xl font-bold">Cấu hình hệ thống</h1>
        <p className="mt-1 text-sm text-[#5C636A]">Tham số dùng chung cho đặt vé và phân công Leader.</p>
      </div>

      <Notice tone="warning" title="Chưa lưu được lên máy chủ">
        Giá trị hiện tại được đọc từ hệ thống. Chưa có API cập nhật cấu hình, nên thay đổi chỉ giữ trên trang này và mất khi tải lại.
      </Notice>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <form onSubmit={submit} noValidate className="flex flex-col gap-6 rounded-[5px] border border-[#E0E0E0] bg-white p-4 sm:p-6 lg:col-span-8">
          <h2 className="border-b border-[#E0E0E0] pb-4 text-lg font-bold">Tham số vận hành</h2>
          <div className="flex flex-col gap-5">
            {SETTING_FIELDS.map((field) => {
              const error = errors[field.key];
              const id = `setting-${field.key}`;
              return (
                <div key={field.key} className="flex flex-col gap-1.5">
                  <label htmlFor={id} className="text-sm font-semibold">{field.label}</label>
                  <div className="relative">
                    <input id={id} name={field.key} value={draft[field.key]} inputMode="numeric" autoComplete="off"
                      onChange={(event) => update(field.key, event.target.value)}
                      onBlur={() => {
                        setTouched((current) => ({ ...current, [field.key]: true }));
                        setErrors((current) => ({ ...current, [field.key]: validateSetting(field, draft[field.key]) }));
                      }}
                      aria-invalid={error ? true : undefined} aria-describedby={`${id}-help${error ? ` ${id}-error` : ""}`}
                      className={cn("h-11 w-full rounded-[5px] border bg-white pl-3 pr-16 text-sm tabular-nums outline-none focus:ring-2",
                        error ? "border-[#C62828] focus:ring-[#C62828]/15" : "border-[#E0E0E0] focus:border-[#186734] focus:ring-[#186734]/15")} />
                    <span aria-hidden="true" className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-[#5C636A]">{field.unit}</span>
                  </div>
                  {error && (
                    <p id={`${id}-error`} className="flex items-center gap-1 text-xs font-medium text-[#C62828]">
                      <CircleAlert aria-hidden="true" className="size-3.5" />{error}
                    </p>
                  )}
                  <p id={`${id}-help`} className="text-xs text-[#5C636A]">{field.help} Từ {field.min} đến {field.max}.</p>
                  <p className="text-xs text-[#5C636A]">Mã tham số: <code>{field.key}</code></p>
                </div>
              );
            })}
          </div>
          <div className="flex flex-col gap-3 border-t border-[#E0E0E0] pt-5 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs text-[#5C636A]">{dirty ? `${changed.length} tham số chưa lưu` : "Không có thay đổi"}</p>
            <div className="flex flex-col-reverse gap-2 sm:flex-row">
              <button type="button" onClick={revert} disabled={!dirty} className={buttonOutline}>Hoàn tác</button>
              <button type="submit" disabled={!dirty} className={buttonYellow}>Lưu thay đổi</button>
            </div>
          </div>
        </form>

        <aside className="h-fit rounded-[5px] border border-[#E0E0E0] bg-white p-4 sm:p-6 lg:col-span-4">
          <h2 className="mb-4 text-base font-bold">Áp dụng như thế nào</h2>
          <ul className="flex flex-col gap-3 text-sm text-[#4B5563]">
            <li className="flex gap-2.5"><Dot />Thời gian giữ ghế chỉ áp dụng cho lượt giữ ghế mới; hóa đơn đang chờ thanh toán giữ hạn cũ.</li>
            <li className="flex gap-2.5"><Dot />Số ghế tối đa được kiểm tra khi khách tạo hóa đơn.</li>
            <li className="flex gap-2.5"><Dot />Tỷ lệ Leader được kiểm tra khi xác nhận chuyến và trước khi chuyến chạy.</li>
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
