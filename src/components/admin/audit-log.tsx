"use client";

import Link from "next/link";
import { useState, type FormEvent, type ReactNode } from "react";
import { ArrowRight, History, RefreshCw, Search } from "lucide-react";
import {
  Avatar, Drawer, EmptyBlock, Notice, Pagination, RoleTag, Tag, buttonOutline, smallButton,
} from "@/components/accounts/ui-parts";
import { cn } from "@/lib/utils";
import { formatCount, formatDate } from "@/lib/customer-account-ui";
import {
  AUDIT_ACTIONS, AUDIT_ACTION_LABELS, AUDIT_OBJECT_FILTERS, AUDIT_OBJECT_LABELS, AUDIT_RANGES, DEMO_AUDIT, DEMO_NOW,
  auditActors, auditObjectLabel, auditSummary, describeAuditChange, filterAudit,
  type AuditAction, type AuditEntry, type AuditObjectFilter, type AuditRange,
} from "@/lib/admin-insights-ui";

const fieldClass = "h-11 w-full rounded-[5px] border border-[#E0E0E0] bg-white px-3 text-sm outline-none focus:border-[#186734] focus:ring-2 focus:ring-[#186734]/15";

const timeFormat = new Intl.DateTimeFormat("vi-VN", { timeZone: "Asia/Ho_Chi_Minh", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });
function auditTime(iso: string, seconds = false) {
  const time = timeFormat.format(new Date(iso));
  return `${formatDate(iso)} ${seconds ? time : time.slice(0, 5)}`;
}

// Where "Mở …" in the detail drawer leads for each object type (only pages that exist today).
const OBJECT_LINKS: Partial<Record<AuditEntry["table_name"], { href: string; label: string }>> = {
  users: { href: "/admin/accounts", label: "Mở tài khoản" },
  payments: { href: "/admin/reconciliation", label: "Mở đối soát" },
  supply_items: { href: "/staff/supplies", label: "Mở kho vật tư" },
  supply_transactions: { href: "/staff/supplies", label: "Mở kho vật tư" },
};

// Q04 audit log (Stitch "Q04 - Audit Log" + "Q04 - Audit Detail"). Read-only; demo entries until an audit list API exists.
export function AuditLog() {
  const [entries] = useState<readonly AuditEntry[]>(DEMO_AUDIT);
  const [draftQ, setDraftQ] = useState("");
  const [q, setQ] = useState("");
  const [actorId, setActorId] = useState<number | undefined>();
  const [action, setAction] = useState<AuditAction | undefined>();
  const [object, setObject] = useState<AuditObjectFilter | undefined>();
  const [range, setRange] = useState<AuditRange>("7d");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [selected, setSelected] = useState<AuditEntry | null>(null);

  const result = filterAudit(entries, { page, pageSize, q, actorId, action, object, range }, DEMO_NOW);
  const summary = auditSummary(entries, DEMO_NOW);
  const actors = auditActors(entries);
  const activeFilters = [
    q && `Mã: ${q}`,
    actorId !== undefined && `Người thực hiện: ${actors.find((actor) => actor.user_id === actorId)?.full_name ?? actorId}`,
    action && `Hành động: ${AUDIT_ACTION_LABELS[action]}`,
    object && `Đối tượng: ${AUDIT_OBJECT_FILTERS.find((group) => group.value === object)?.label}`,
    `Khoảng thời gian: ${AUDIT_RANGES.find((item) => item.value === range)?.label}`,
  ].filter(Boolean) as string[];
  const filtered = Boolean(q || actorId !== undefined || action || object || range !== "7d");

  const reset = () => { setDraftQ(""); setQ(""); setActorId(undefined); setAction(undefined); setObject(undefined); setRange("7d"); setPage(1); };
  const submit = (event: FormEvent) => { event.preventDefault(); setQ(draftQ.trim().slice(0, 30)); setPage(1); };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Nhật ký hoạt động</h1>
          <p className="mt-1 max-w-3xl text-sm text-[#5C636A]">
            Các thay đổi quan trọng về quyền tài khoản, trạng thái chuyến, giá tuyến, tiền và kho vật tư. Chỉ xem, không sửa hoặc xóa.
          </p>
        </div>
        <button type="button" onClick={() => setPage(1)} className={buttonOutline}><RefreshCw aria-hidden="true" className="size-4" /> Làm mới</button>
      </div>

      <Notice tone="info" title="Đang hiển thị dữ liệu minh họa">
        Chưa có API đọc nhật ký. Bản ghi mẫu dùng đúng danh sách hành động mà hệ thống đang ghi (đổi quyền, trạng thái chuyến, giá, tiền, vật tư).
      </Notice>

      <section aria-label="Thống kê nhật ký" className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <Summary label="Bản ghi 7 ngày qua" value={summary.total} />
        <Summary label="Thay đổi tài khoản" value={summary.accountChanges} hint="Đổi vai trò, khóa / mở khóa" />
        <Summary label="Thay đổi tiền & giá" value={summary.moneyAndPrice} />
      </section>

      <form onSubmit={submit} role="search" className="rounded-[5px] border border-[#E0E0E0] bg-white p-4">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-12">
          <label className="xl:col-span-4">
            <span className="mb-1 block text-xs font-medium text-[#5C636A]">Mã bản ghi hoặc mã đối tượng</span>
            <span className="relative block">
              <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[#5C636A]" />
              <input value={draftQ} onChange={(event) => setDraftQ(event.target.value)} inputMode="numeric" maxLength={30}
                placeholder="Ví dụ 88410 hoặc 42" className={cn(fieldClass, "pl-9")} />
            </span>
          </label>
          <Select label="Người thực hiện" className="xl:col-span-2" value={actorId === undefined ? "" : String(actorId)}
            onChange={(value) => { setActorId(value ? Number(value) : undefined); setPage(1); }}
            options={[{ value: "", label: "Tất cả" }, ...actors.map((actor) => ({ value: String(actor.user_id), label: actor.full_name }))]} />
          <Select label="Hành động" className="xl:col-span-2" value={action ?? ""}
            onChange={(value) => { setAction((value || undefined) as AuditAction | undefined); setPage(1); }}
            options={[{ value: "", label: "Tất cả hành động" }, ...AUDIT_ACTIONS.map((item) => ({ value: item, label: AUDIT_ACTION_LABELS[item] }))]} />
          <Select label="Đối tượng" className="xl:col-span-2" value={object ?? ""}
            onChange={(value) => { setObject((value || undefined) as AuditObjectFilter | undefined); setPage(1); }}
            options={[{ value: "", label: "Tất cả" }, ...AUDIT_OBJECT_FILTERS.map((group) => ({ value: group.value, label: group.label }))]} />
          <Select label="Khoảng thời gian" className="xl:col-span-2" value={range}
            onChange={(value) => { setRange(value as AuditRange); setPage(1); }}
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

      <section aria-label="Danh sách bản ghi" className="overflow-hidden rounded-[5px] border border-[#E0E0E0] bg-white">
        {result.items.length === 0 ? (
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
                  {result.items.map((entry) => {
                    const change = describeAuditChange(entry);
                    return (
                      <tr key={entry.log_id} className={cn("hover:bg-[#F8F9FA]", selected?.log_id === entry.log_id && "bg-[#E8F5E9]/40")}>
                        <td className="whitespace-nowrap px-4 py-3 text-[#5C636A]">{auditTime(entry.created_at)}</td>
                        <td className="px-4 py-3"><div className="flex flex-wrap items-center gap-2"><span className="font-medium">{entry.actor.full_name}</span><RoleTag role={entry.actor.role} /></div></td>
                        <td className="px-4 py-3 font-medium">{AUDIT_ACTION_LABELS[entry.action]}</td>
                        <td className="whitespace-nowrap px-4 py-3 text-[#5C636A]">{auditObjectLabel(entry)}</td>
                        <td className="px-4 py-3"><ChangeText change={change} /></td>
                        <td className="px-4 py-3 text-right">
                          <button type="button" onClick={() => setSelected(entry)} className={cn(buttonOutline, smallButton, "text-[#186734]")}
                            aria-label={`Xem chi tiết bản ghi #${entry.log_id}`}>Xem</button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <ul className="divide-y divide-[#E0E0E0] lg:hidden">
              {result.items.map((entry) => (
                <li key={entry.log_id}>
                  <button type="button" onClick={() => setSelected(entry)} className="block w-full p-4 text-left hover:bg-[#F8F9FA]">
                    <div className="flex items-start justify-between gap-2">
                      <p className="font-semibold">{AUDIT_ACTION_LABELS[entry.action]}</p>
                      <span className="shrink-0 text-xs text-[#5C636A]">{auditTime(entry.created_at)}</span>
                    </div>
                    <p className="mt-1 text-xs text-[#5C636A]">{entry.actor.full_name} · {auditObjectLabel(entry)}</p>
                    <p className="mt-1 text-sm"><ChangeText change={describeAuditChange(entry)} /></p>
                  </button>
                </li>
              ))}
            </ul>
            <Pagination page={result.page} totalPages={result.totalPages} totalItems={result.totalItems} pageSize={pageSize} noun="bản ghi"
              onPage={setPage} onPageSize={(size) => { setPageSize(size); setPage(1); }} />
          </>
        )}
      </section>

      {selected && <AuditDetail entry={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}

function AuditDetail({ entry, onClose }: { entry: AuditEntry; onClose: () => void }) {
  const change = describeAuditChange(entry);
  const link = OBJECT_LINKS[entry.table_name];
  return (
    <Drawer labelledBy="audit-detail-title" onClose={onClose}
      title={<><p className="text-xs text-[#5C636A]">Nhật ký hoạt động</p><h2 id="audit-detail-title" className="text-base font-bold">Chi tiết bản ghi #{entry.log_id}</h2></>}
      footer={<button type="button" onClick={onClose} className={cn(buttonOutline, "w-full")}>Đóng</button>}>
      <div className="space-y-4 text-sm">
        <div className="rounded-[5px] border border-[#E0E0E0] p-4">
          <p className="mb-2 text-xs font-medium text-[#5C636A]">Người thực hiện</p>
          <div className="flex items-center gap-3">
            <Avatar name={entry.actor.full_name} size="lg" />
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2"><span className="font-bold">{entry.actor.full_name}</span><RoleTag role={entry.actor.role} /></div>
              <p className="mt-0.5 text-xs text-[#5C636A]">Mã người dùng #{entry.actor.user_id}</p>
            </div>
          </div>
        </div>

        <dl className="divide-y divide-[#E0E0E0] rounded-[5px] border border-[#E0E0E0]">
          <Row label="Thời gian">{auditTime(entry.created_at, true)} <span className="text-[#5C636A]">(giờ Việt Nam)</span></Row>
          <Row label="Hành động">
            <span className="flex flex-wrap items-center justify-end gap-2">
              <Tag tone="success">{AUDIT_ACTION_LABELS[entry.action]}</Tag><code className="text-xs text-[#5C636A]">{entry.action}</code>
            </span>
          </Row>
          <Row label="Đối tượng">
            <span className="flex flex-wrap items-center justify-end gap-2">
              <span className="font-medium">{auditObjectLabel(entry)}</span>
              <span className="text-xs text-[#5C636A]">bảng {entry.table_name} ({AUDIT_OBJECT_LABELS[entry.table_name]})</span>
              {link && <Link href={link.href} className={cn(buttonOutline, smallButton)}>{link.label}</Link>}
            </span>
          </Row>
        </dl>

        <div className="rounded-[5px] border border-[#E0E0E0] p-4">
          <p className="mb-3 text-xs font-medium text-[#5C636A]">Thay đổi</p>
          {change.before !== undefined ? (
            <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
              <div className="rounded-[5px] border border-[#E0E0E0] bg-[#FAFAFA] p-3 text-center">
                <p className="text-xs text-[#5C636A]">Trước</p><p className="mt-1 font-medium">{change.before}</p>
              </div>
              <ArrowRight aria-label="thành" className="size-5 text-[#5C636A]" />
              <div className="rounded-[5px] border border-[#186734] bg-[#F4FBF7] p-3 text-center">
                <p className="text-xs font-medium text-[#186734]">Sau</p><p className="mt-1 font-semibold text-[#186734]">{change.after}</p>
              </div>
            </div>
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

function ChangeText({ change }: { change: ReturnType<typeof describeAuditChange> }) {
  if (change.before === undefined) return <span className="font-medium">{change.summary}</span>;
  return <span><span className="text-[#5C636A]">{change.before}</span><span aria-hidden="true" className="mx-1 text-[#9CA3AF]">→</span><span className="sr-only"> thành </span><span className="font-medium">{change.after}</span></span>;
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 p-3.5">
      <dt className="shrink-0 text-[#5C636A]">{label}</dt>
      <dd className="text-right">{children}</dd>
    </div>
  );
}

function Summary({ label, value, hint }: { label: string; value: number; hint?: string }) {
  return (
    <div className="rounded-[5px] border border-[#E0E0E0] bg-white p-4">
      <p className="text-sm text-[#5C636A]">{label}</p>
      <p className="mt-1 text-2xl font-bold tabular-nums">{formatCount(value)}</p>
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
