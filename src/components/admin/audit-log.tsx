"use client";

import Link from "next/link";
import { useState, type FormEvent, type ReactNode } from "react";
import { ArrowRight, History, RefreshCw, Search } from "lucide-react";
import {
  Avatar, Drawer, EmptyBlock, Notice, Pagination, SkeletonRows, Tag, buttonOutline, smallButton,
} from "@/components/accounts/ui-parts";
import { useLoad } from "@/components/accounts/use-load";
import { cn } from "@/lib/utils";
import { describeFailure, formatCount, formatDate, roleLabel } from "@/lib/customer-account-ui";
import {
  AUDIT_ACTIONS, AUDIT_RANGES, AUDIT_TABLE_FILTERS, AUDIT_TABLE_LABELS, auditActionLabel, auditClient, auditObjectLabel,
  describeAuditChange, isAutomatic, validRecordId,
  type AuditAction, type AuditItem, type AuditQuery, type AuditRange, type AuditTable,
} from "@/lib/admin-insights-ui";

const fieldClass = "h-11 w-full rounded-[5px] border border-[#E0E0E0] bg-white px-3 text-sm outline-none focus:border-[#186734] focus:ring-2 focus:ring-[#186734]/15";

const timeFormat = new Intl.DateTimeFormat("vi-VN", { timeZone: "Asia/Ho_Chi_Minh", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });
function auditTime(iso: string, seconds = false) {
  const time = timeFormat.format(new Date(iso));
  return `${formatDate(iso)} ${seconds ? time : time.slice(0, 5)}`;
}

// Where "Mở …" in the detail drawer leads for each object type (only pages that exist today).
const OBJECT_LINKS: Record<string, { href: string; label: string }> = {
  users: { href: "/admin/accounts", label: "Mở tài khoản" },
  payments: { href: "/admin/reconciliation", label: "Mở đối soát" },
  supply_items: { href: "/staff/supplies", label: "Mở kho vật tư" },
  supply_transactions: { href: "/staff/supplies", label: "Mở kho vật tư" },
  system_settings: { href: "/admin/settings", label: "Mở cấu hình" },
};

// Q04 audit log (Stitch "Q04 - Audit Log" + "Q04 - Audit Detail") on GET /api/admin/audit. Read-only.
export function AuditLog() {
  const [now, setNow] = useState(() => new Date());
  const [draftRecord, setDraftRecord] = useState("");
  const [recordError, setRecordError] = useState<string | null>(null);
  const [query, setQuery] = useState<AuditQuery>({ page: 1, pageSize: 20, range: "7d" });
  const [selected, setSelected] = useState<AuditItem | null>(null);

  const list = useLoad(JSON.stringify(["audit", query, now.getTime()]), (signal) => auditClient.list(query, now, signal));
  const staff = useLoad("audit-staff", (signal) => auditClient.staff(signal));
  const summary = useLoad(JSON.stringify(["audit-summary", now.getTime()]), async (signal) => {
    const week = { range: "7d" as const };
    const [total, roles, statuses, money, prices] = await Promise.all([
      auditClient.count(week, now, signal),
      auditClient.count({ ...week, action: "RoleChanged" }, now, signal),
      auditClient.count({ ...week, action: "AccountStatusChanged" }, now, signal),
      auditClient.count({ ...week, action: "MoneyRecorded" }, now, signal),
      auditClient.count({ ...week, action: "TripPriceChanged" }, now, signal),
    ]);
    return { total, accounts: roles + statuses, moneyAndPrice: money + prices };
  });

  const set = (patch: Partial<AuditQuery>) => setQuery((current) => ({ ...current, page: 1, ...patch }));
  const filtered = Boolean(query.recordId || query.userId !== undefined || query.action || query.table || query.range !== "7d");
  const reset = () => { setDraftRecord(""); setRecordError(null); setQuery({ page: 1, pageSize: query.pageSize, range: "7d" }); };
  const refresh = () => { setNow(new Date()); list.reload(); summary.reload(); };
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!validRecordId(draftRecord)) { setRecordError("Chỉ nhập chữ, số hoặc dấu gạch dưới (tối đa 40 ký tự)."); return; }
    setRecordError(null);
    set({ recordId: draftRecord.trim().replace(/^#/, "") || undefined });
  };

  const actorName = staff.state.phase === "ready" ? staff.state.data.find((person) => person.user_id === query.userId)?.full_name : undefined;
  const activeFilters = [
    query.recordId && `Mã đối tượng: ${query.recordId}`,
    query.userId !== undefined && `Người thực hiện: ${actorName ?? `#${query.userId}`}`,
    query.action && `Hành động: ${auditActionLabel(query.action)}`,
    query.table && `Đối tượng: ${AUDIT_TABLE_LABELS[query.table]}`,
    `Khoảng thời gian: ${AUDIT_RANGES.find((item) => item.value === query.range)?.label}`,
  ].filter(Boolean) as string[];

  const state = list.state;
  const failure = state.phase === "error" ? describeFailure(state.code, state.status) : null;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Nhật ký hoạt động</h1>
          <p className="mt-1 max-w-3xl text-sm text-[#5C636A]">
            Các thay đổi quan trọng về quyền tài khoản, cấu hình, trạng thái chuyến, giá tuyến, tiền và kho vật tư. Chỉ xem, không sửa hoặc xóa.
          </p>
        </div>
        <button type="button" onClick={refresh} className={buttonOutline}><RefreshCw aria-hidden="true" className="size-4" /> Làm mới</button>
      </div>

      <section aria-label="Thống kê nhật ký" className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <Summary label="Bản ghi 7 ngày qua" value={summary.state.phase === "ready" ? summary.state.data.total : null} />
        <Summary label="Thay đổi tài khoản" value={summary.state.phase === "ready" ? summary.state.data.accounts : null} hint="Đổi vai trò, khóa / mở khóa · 7 ngày" />
        <Summary label="Thay đổi tiền & giá" value={summary.state.phase === "ready" ? summary.state.data.moneyAndPrice : null} hint="Ghi nhận tiền, đổi giá tuyến · 7 ngày" />
      </section>

      <form onSubmit={submit} role="search" className="rounded-[5px] border border-[#E0E0E0] bg-white p-4">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-12">
          <label className="xl:col-span-4">
            <span className="mb-1 block text-xs font-medium text-[#5C636A]">Mã đối tượng</span>
            <span className="relative block">
              <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[#5C636A]" />
              <input value={draftRecord} onChange={(event) => setDraftRecord(event.target.value)} maxLength={41}
                placeholder="Ví dụ 42 hoặc LEADER_RATIO" aria-invalid={recordError ? true : undefined}
                aria-describedby={recordError ? "record-error" : undefined} className={cn(fieldClass, "pl-9", recordError && "border-[#C62828]")} />
            </span>
            {recordError && <span id="record-error" className="mt-1 block text-xs text-[#C62828]">{recordError}</span>}
          </label>
          <Select label="Người thực hiện" className="xl:col-span-2" value={query.userId === undefined ? "" : String(query.userId)}
            onChange={(value) => set({ userId: value ? Number(value) : undefined })}
            options={[{ value: "", label: "Tất cả" }, ...(staff.state.phase === "ready"
              ? staff.state.data.map((person) => ({ value: String(person.user_id), label: `${person.full_name} · ${roleLabel(person.role)}` }))
              : [])]} />
          <Select label="Hành động" className="xl:col-span-2" value={query.action ?? ""}
            onChange={(value) => set({ action: (value || undefined) as AuditAction | undefined })}
            options={[{ value: "", label: "Tất cả hành động" }, ...AUDIT_ACTIONS.map((item) => ({ value: item, label: auditActionLabel(item) }))]} />
          <Select label="Đối tượng" className="xl:col-span-2" value={query.table ?? ""}
            onChange={(value) => set({ table: (value || undefined) as AuditTable | undefined })}
            options={[{ value: "", label: "Tất cả" }, ...AUDIT_TABLE_FILTERS.map((table) => ({ value: table, label: AUDIT_TABLE_LABELS[table] }))]} />
          <Select label="Khoảng thời gian" className="xl:col-span-2" value={query.range}
            onChange={(value) => set({ range: value as AuditRange })}
            options={AUDIT_RANGES.map((item) => ({ value: item.value, label: item.label }))} />
        </div>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-[#E0E0E0] pt-3 text-xs">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[#5C636A]">Bộ lọc đang bật:</span>
            {activeFilters.map((item) => <span key={item} className="rounded-[5px] border border-[#E0E0E0] bg-[#F8F9FA] px-2 py-1">{item}</span>)}
          </div>
          <div className="flex gap-2">
            <button type="submit" className={cn(buttonOutline, smallButton)}>Tìm</button>
            {filtered && <button type="button" onClick={reset} className={cn(buttonOutline, smallButton, "text-[#186734]")}>Xóa bộ lọc</button>}
          </div>
        </div>
      </form>

      {failure && (
        <Notice tone="danger" title={failure.title === "Không tìm thấy tài khoản" ? "Không tải được nhật ký" : failure.title}
          action={<button type="button" onClick={refresh} className={buttonOutline}>Thử lại</button>}>
          {state.phase === "error" && state.status === 422 ? "Bộ lọc không hợp lệ. Hãy xóa bộ lọc và thử lại." : failure.detail}
        </Notice>
      )}

      <section aria-label="Danh sách bản ghi" aria-busy={state.phase === "loading"} className="overflow-hidden rounded-[5px] border border-[#E0E0E0] bg-white">
        {state.phase === "loading" ? <SkeletonRows /> : state.phase === "error" ? null : state.data.items.length === 0 ? (
          <EmptyBlock icon={<History className="size-8" />} title="Không có bản ghi phù hợp"
            action={filtered ? <button type="button" onClick={reset} className={buttonOutline}>Xóa bộ lọc</button> : undefined}>
            Thử khoảng thời gian dài hơn hoặc bỏ bớt bộ lọc.
          </EmptyBlock>
        ) : (
          <>
            <div className="hidden overflow-x-auto lg:block">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-[#E0E0E0] bg-[#F8F9FA] text-xs text-[#5C636A]">
                  <tr>
                    <th className="px-4 py-3 font-semibold">Thời gian</th><th className="px-4 py-3 font-semibold">Người thực hiện</th>
                    <th className="px-4 py-3 font-semibold">Hành động</th><th className="px-4 py-3 font-semibold">Đối tượng</th>
                    <th className="px-4 py-3 font-semibold">Thay đổi</th><th className="px-4 py-3 text-right font-semibold"><span className="sr-only">Thao tác</span></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E0E0E0]">
                  {state.data.items.map((item) => (
                    <tr key={item.log_id} className={cn("hover:bg-[#F8F9FA]", selected?.log_id === item.log_id && "bg-[#E8F5E9]/40")}>
                      <td className="whitespace-nowrap px-4 py-3 text-[#5C636A]">{auditTime(item.created_at)}</td>
                      <td className="px-4 py-3"><ActorText item={item} /></td>
                      <td className="px-4 py-3 font-medium">{auditActionLabel(item.action)}</td>
                      <td className="whitespace-nowrap px-4 py-3 text-[#5C636A]">{auditObjectLabel(item)}</td>
                      <td className="px-4 py-3"><ChangeText item={item} /></td>
                      <td className="px-4 py-3 text-right">
                        <button type="button" onClick={() => setSelected(item)} className={cn(buttonOutline, smallButton, "text-[#186734]")}
                          aria-label={`Xem chi tiết bản ghi #${item.log_id}`}>Xem</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <ul className="divide-y divide-[#E0E0E0] lg:hidden">
              {state.data.items.map((item) => (
                <li key={item.log_id}>
                  <button type="button" onClick={() => setSelected(item)} className="block w-full p-4 text-left hover:bg-[#F8F9FA]">
                    <div className="flex items-start justify-between gap-2">
                      <p className="font-semibold">{auditActionLabel(item.action)}</p>
                      <span className="shrink-0 text-xs text-[#5C636A]">{auditTime(item.created_at)}</span>
                    </div>
                    <p className="mt-1 text-xs text-[#5C636A]">{item.actor_name} · {auditObjectLabel(item)}</p>
                    <p className="mt-1 text-sm"><ChangeText item={item} /></p>
                  </button>
                </li>
              ))}
            </ul>
            <Pagination page={state.data.pagination.page} totalPages={state.data.pagination.totalPages}
              totalItems={state.data.pagination.totalItems} pageSize={query.pageSize} noun="bản ghi"
              onPage={(page) => setQuery((current) => ({ ...current, page }))} onPageSize={(pageSize) => set({ pageSize })} />
          </>
        )}
      </section>

      {selected && <AuditDetail item={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}

function AuditDetail({ item, onClose }: { item: AuditItem; onClose: () => void }) {
  const change = describeAuditChange(item);
  const link = OBJECT_LINKS[item.table_name];
  return (
    <Drawer labelledBy="audit-detail-title" onClose={onClose}
      title={<><p className="text-xs text-[#5C636A]">Nhật ký hoạt động</p><h2 id="audit-detail-title" className="text-base font-bold">Chi tiết bản ghi #{item.log_id}</h2></>}
      footer={<button type="button" onClick={onClose} className={cn(buttonOutline, "w-full")}>Đóng</button>}>
      <div className="space-y-4 text-sm">
        <div className="rounded-[5px] border border-[#E0E0E0] p-4">
          <p className="mb-2 text-xs font-medium text-[#5C636A]">Người thực hiện</p>
          <div className="flex items-center gap-3">
            <Avatar name={item.actor_name} size="lg" />
            <div className="min-w-0">
              <p className="font-bold">{item.actor_name}</p>
              <p className="mt-0.5 text-xs text-[#5C636A]">Mã người dùng #{item.user_id}{isAutomatic(item) ? " · thao tác tự động" : ""}</p>
            </div>
          </div>
        </div>

        <dl className="divide-y divide-[#E0E0E0] rounded-[5px] border border-[#E0E0E0]">
          <Row label="Thời gian">{auditTime(item.created_at, true)} <span className="text-[#5C636A]">(giờ Việt Nam)</span></Row>
          <Row label="Hành động">
            <span className="flex flex-wrap items-center justify-end gap-2">
              <Tag tone="success">{auditActionLabel(item.action)}</Tag><code className="text-xs text-[#5C636A]">{item.action}</code>
            </span>
          </Row>
          <Row label="Đối tượng">
            <span className="flex flex-wrap items-center justify-end gap-2">
              <span className="font-medium">{auditObjectLabel(item)}</span>
              <span className="text-xs text-[#5C636A]">bảng {item.table_name}</span>
              {link && <Link href={link.href} className={cn(buttonOutline, smallButton)}>{link.label}</Link>}
            </span>
          </Row>
        </dl>

        <div className="rounded-[5px] border border-[#E0E0E0] p-4">
          <p className="mb-3 text-xs font-medium text-[#5C636A]">Thay đổi</p>
          {change.before !== undefined ? (
            <>
              <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
                <div className="rounded-[5px] border border-[#E0E0E0] bg-[#FAFAFA] p-3 text-center">
                  <p className="text-xs text-[#5C636A]">Trước</p><p className="mt-1 font-medium">{change.before}</p>
                </div>
                <ArrowRight aria-label="thành" className="size-5 text-[#5C636A]" />
                <div className="rounded-[5px] border border-[#186734] bg-[#F4FBF7] p-3 text-center">
                  <p className="text-xs font-medium text-[#186734]">Sau</p><p className="mt-1 font-semibold text-[#186734]">{change.after}</p>
                </div>
              </div>
              {isAutomatic(item) && <p className="mt-3 text-xs text-[#5C636A]">{change.summary}</p>}
            </>
          ) : (
            <p className="font-medium">{change.summary}</p>
          )}
        </div>

        <p className="rounded-[5px] border border-[#E0E0E0] bg-[#F5F5F5] p-3 text-xs text-[#4B5563]">
          Nhật ký chỉ xem, không sửa hoặc xóa được. Hệ thống không lưu mật khẩu, thông tin ngân hàng hay nội dung yêu cầu trong nhật ký.
        </p>
      </div>
    </Drawer>
  );
}

function ActorText({ item }: { item: AuditItem }) {
  return (
    <span className="flex flex-wrap items-center gap-2">
      <span className="font-medium">{item.actor_name}</span>
      {isAutomatic(item) && <Tag tone="neutral">Tự động</Tag>}
    </span>
  );
}

function ChangeText({ item }: { item: AuditItem }) {
  const change = describeAuditChange(item);
  if (change.before === undefined) return <span className="font-medium">{change.summary}</span>;
  return (
    <span>
      <span className="text-[#5C636A]">{change.before}</span><span aria-hidden="true" className="mx-1 text-[#9CA3AF]">→</span>
      <span className="sr-only"> thành </span><span className="font-medium">{change.after}</span>
    </span>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 p-3.5">
      <dt className="shrink-0 text-[#5C636A]">{label}</dt>
      <dd className="text-right">{children}</dd>
    </div>
  );
}

function Summary({ label, value, hint }: { label: string; value: number | null; hint?: string }) {
  return (
    <div className="rounded-[5px] border border-[#E0E0E0] bg-white p-4">
      <p className="text-sm text-[#5C636A]">{label}</p>
      <p className="mt-1 text-2xl font-bold tabular-nums">
        {value === null ? <span className="inline-block h-7 w-16 animate-pulse rounded-[5px] bg-neutral-200" /> : formatCount(value)}
      </p>
      {hint && <p className="mt-1 text-xs text-[#5C636A]">{hint}</p>}
    </div>
  );
}

function Select({ label, value, onChange, options, className }: {
  label: string; value: string; onChange: (value: string) => void; options: { value: string; label: string }[]; className?: string;
}) {
  return (
    <label className={className}>
      <span className="mb-1 block text-xs font-medium text-[#5C636A]">{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)} className={fieldClass}>
        {options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select>
    </label>
  );
}
