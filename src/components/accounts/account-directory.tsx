"use client";

import Link from "next/link";
import { useRef, useState, type FormEvent } from "react";
import { useSession } from "next-auth/react";
import { ChevronRight, ExternalLink, IdCard, Lock, LockOpen, RefreshCw, Search, ShieldCheck, UserCog } from "lucide-react";
import type { Role } from "@/schemas/auth";
import { cn } from "@/lib/utils";
import {
  AccountClientError, DEMO_ACCOUNTS, ROLES, ROLE_LABELS, accountActions, createDemoAccountSource, describeFailure,
  directoryCapabilities, formatCount, formatDate, roleOptions,
  type AccountQuery, type AccountRow, type AccountSource, type AccountStatus, type Failure,
} from "@/lib/customer-account-ui";
import {
  Avatar, Dialog, Drawer, EmptyBlock, Notice, Pagination, RoleTag, SkeletonRows, Spinner, StatusTag,
  buttonDanger, buttonGreen, buttonOutline, buttonOutlineDanger, buttonOutlineGreen, buttonYellow, smallButton,
} from "./ui-parts";
import { useLoad } from "./use-load";

const input = "h-11 w-full rounded-[5px] border border-[#E0E0E0] bg-white px-3 text-base text-[#212529] placeholder:text-[#5C636A] focus:border-[#186734] focus:outline-2 focus:outline-[#186734] sm:text-sm";

type Pending = { kind: "role" | "lock" | "unlock"; account: AccountRow };

export function AccountDirectory() {
  const { data: session, status: sessionStatus } = useSession();
  const caps = directoryCapabilities(session?.user?.role);
  const actorId = session?.user?.user_id ?? null;
  const [source] = useState<AccountSource>(() => createDemoAccountSource(withSignedInAdmin(session?.user)));
  const [query, setQuery] = useState<AccountQuery>({ page: 1, pageSize: 20 });
  const [search, setSearch] = useState("");
  const [detailId, setDetailId] = useState<number | null>(null);
  const [pending, setPending] = useState<Pending | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);
  const enabled = sessionStatus === "authenticated" && caps.canManageAccounts;

  const list = useLoad(enabled ? JSON.stringify([query, revision]) : null, (signal) => source.list(query, signal));

  if (sessionStatus === "loading") return <SkeletonRows />;
  if (!caps.canManageAccounts) {
    return <Notice tone="danger" title="Bạn không có quyền quản lý tài khoản">Trang này chỉ dành cho quản trị viên.</Notice>;
  }

  const data = list.state.data;
  const failure = list.state.phase === "error" ? describeFailure(list.state.code, list.state.status) : null;
  const detail = detailId === null ? null : data?.items.find((row) => row.user_id === detailId) ?? null;

  function onSearch(event: FormEvent) {
    event.preventDefault();
    setQuery((current) => ({ ...current, page: 1, q: search.trim() || undefined }));
  }
  function afterChange(message: string) {
    setPending(null);
    setNotice(message);
    setRevision((value) => value + 1);
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Quản lý tài khoản</h1>
          <p className="mt-1 text-sm text-[#5C636A]">Đổi vai trò, khóa hoặc mở khóa tài khoản đăng nhập. Tài khoản Leader được tạo từ hồ sơ nhân sự.</p>
        </div>
        <button type="button" onClick={list.reload} disabled={list.state.phase === "loading"} className={buttonOutline}>
          <RefreshCw aria-hidden="true" className={cn("size-4", list.state.phase === "loading" && "animate-spin")} /> Làm mới
        </button>
      </div>

      {source.isDemo && (
        <Notice tone="info" title="Đang hiển thị dữ liệu mẫu">
          Danh sách tài khoản và các thay đổi trên trang này chỉ để minh họa, chưa lưu vào hệ thống.
        </Notice>
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {ROLES.map((role) => (
          <button key={role} type="button" aria-pressed={query.role === role}
            onClick={() => setQuery((current) => ({ ...current, page: 1, role: current.role === role ? undefined : role }))}
            className={cn("flex items-center justify-between gap-2 rounded-[5px] border bg-white px-3 py-3 text-left text-sm",
              query.role === role ? "border-[#186734] ring-1 ring-[#186734]" : "border-[#E0E0E0] hover:border-[#6B7280]")}>
            <span className="text-[#5C636A]">{ROLE_LABELS[role]}</span>
            <span className="font-bold tabular-nums">{data ? formatCount(data.roleCounts[role]) : "–"}</span>
          </button>
        ))}
      </div>

      {notice && <Notice tone="info" title={notice} />}

      <form onSubmit={onSearch} className="grid grid-cols-1 gap-3 rounded-[5px] border border-[#E0E0E0] bg-white p-4 sm:grid-cols-[minmax(0,1fr)_200px_200px_auto]">
        <label className="relative">
          <span className="sr-only">Tìm tài khoản</span>
          <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[#5C636A]" />
          <input type="search" value={search} onChange={(event) => setSearch(event.target.value)} maxLength={100}
            placeholder="Tìm theo tên hoặc email" className={cn(input, "pl-9")} />
        </label>
        <label>
          <span className="sr-only">Vai trò</span>
          <select value={query.role ?? ""} className={input}
            onChange={(event) => setQuery((current) => ({ ...current, page: 1, role: (event.target.value || undefined) as Role | undefined }))}>
            <option value="">Tất cả vai trò</option>
            {ROLES.map((role) => <option key={role} value={role}>{ROLE_LABELS[role]}</option>)}
          </select>
        </label>
        <label>
          <span className="sr-only">Trạng thái</span>
          <select value={query.status ?? ""} className={input}
            onChange={(event) => setQuery((current) => ({ ...current, page: 1, status: (event.target.value || undefined) as AccountStatus | undefined }))}>
            <option value="">Tất cả trạng thái</option>
            <option value="Active">Đang hoạt động</option>
            <option value="Locked">Đã khóa</option>
          </select>
        </label>
        <button type="submit" className={buttonOutline}>Tìm</button>
      </form>

      <section aria-label="Danh sách tài khoản" className="overflow-hidden rounded-[5px] border border-[#E0E0E0] bg-white">
        {failure && !data ? (
          <div className="p-4"><Notice tone="danger" title={failure.title}
            action={failure.retryable ? <button type="button" onClick={list.reload} className={buttonOutline}>Thử lại</button> : undefined}>{failure.detail}</Notice></div>
        ) : !data ? (
          <SkeletonRows />
        ) : data.items.length === 0 ? (
          <EmptyBlock icon={<IdCard aria-hidden="true" className="size-10" />} title="Không tìm thấy tài khoản phù hợp"
            action={<button type="button" className={buttonOutline}
              onClick={() => { setSearch(""); setQuery((current) => ({ page: 1, pageSize: current.pageSize })); }}>Đặt lại bộ lọc</button>}>
            Thử đổi từ khóa, vai trò hoặc trạng thái.
          </EmptyBlock>
        ) : (
          <>
            <AccountTable rows={data.items} actorId={actorId} onDetail={setDetailId} onAction={setPending} />
            <AccountCards rows={data.items} actorId={actorId} onDetail={setDetailId} onAction={setPending} />
            <Pagination page={data.pagination.page} totalPages={data.pagination.totalPages} totalItems={data.pagination.totalItems}
              pageSize={data.pagination.pageSize} noun="tài khoản"
              onPage={(page) => setQuery((current) => ({ ...current, page }))}
              onPageSize={(pageSize) => setQuery((current) => ({ ...current, page: 1, pageSize }))} />
          </>
        )}
      </section>

      {detail && <AccountDetailDrawer account={detail} actorId={actorId} onClose={() => setDetailId(null)} onAction={setPending} />}

      {pending?.kind === "role" && (
        <RoleDialog account={pending.account} source={source} onClose={() => setPending(null)}
          onDone={(role) => afterChange(`Đã đổi vai trò của ${pending.account.full_name} thành ${ROLE_LABELS[role]}`)} />
      )}
      {(pending?.kind === "lock" || pending?.kind === "unlock") && (
        <LockDialog account={pending.account} source={source} locking={pending.kind === "lock"} onClose={() => setPending(null)}
          onDone={() => afterChange(pending.kind === "lock" ? `Đã khóa tài khoản ${pending.account.full_name}` : `Đã mở khóa tài khoản ${pending.account.full_name}`)} />
      )}
    </div>
  );
}

// The signed-in admin appears in the demo list so the "Bạn" row (no self-changes) can be seen.
function withSignedInAdmin(user: { user_id?: number; name?: string | null; email?: string | null; role?: string } | undefined): AccountRow[] {
  if (!user?.user_id || user.role !== "Admin" || DEMO_ACCOUNTS.some((row) => row.user_id === user.user_id)) return [...DEMO_ACCOUNTS];
  return [{ user_id: user.user_id, full_name: user.name ?? "Quản trị viên", email: user.email ?? "", phone: "", role: "Admin", status: "Active",
    created_at: "2026-01-01T00:00:00.000Z", has_staff_profile: false }, ...DEMO_ACCOUNTS];
}

type RowProps = { rows: AccountRow[]; actorId: number | null; onDetail: (id: number) => void; onAction: (pending: Pending) => void };

// Three fixed-width slots (detail · role · lock) so every row lines up regardless of which actions apply.
// A blocked role change keeps its slot as a disabled button with the reason as tooltip and accessible description.
function RowActions({ account, actorId, onDetail, onAction, compact }: { account: AccountRow; actorId: number | null; onDetail: (id: number) => void; onAction: (pending: Pending) => void; compact?: boolean }) {
  const actions = accountActions(account, actorId);
  const hintId = `role-hint-${account.user_id}`;
  return (
    <div className={cn("grid items-center gap-2",
      compact ? "grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)]" : "grid-cols-[112px_104px_92px] justify-end")}>
      <button type="button" onClick={() => onDetail(account.user_id)}
        className={cn("inline-flex min-h-9 items-center gap-1 whitespace-nowrap text-sm font-semibold text-[#186734] hover:underline",
          compact ? "justify-start" : "justify-end")}>
        Xem chi tiết <ChevronRight aria-hidden="true" className="size-4" />
      </button>
      {actions.isSelf ? (
        <span className="col-span-2 text-right text-xs text-[#5C636A]">Tài khoản của bạn</span>
      ) : (
        <>
          <button type="button" disabled={!actions.canChangeRole} onClick={() => onAction({ kind: "role", account })}
            title={actions.roleChangeHint ?? undefined} aria-describedby={actions.roleChangeHint ? hintId : undefined}
            className={cn(buttonOutline, smallButton, "w-full px-2")}>
            Đổi vai trò
          </button>
          {actions.roleChangeHint && <span id={hintId} className="sr-only">{actions.roleChangeHint}</span>}
          {account.status === "Active" ? (
            <button type="button" onClick={() => onAction({ kind: "lock", account })} className={cn(buttonOutlineDanger, smallButton, "w-full px-2")}>Khóa</button>
          ) : (
            <button type="button" onClick={() => onAction({ kind: "unlock", account })} className={cn(buttonOutlineGreen, smallButton, "w-full px-2")}>Mở khóa</button>
          )}
        </>
      )}
    </div>
  );
}

function NameCell({ account, actorId }: { account: AccountRow; actorId: number | null }) {
  return (
    <div className="flex items-center gap-3">
      <Avatar name={account.full_name} />
      <div className="min-w-0">
        <p className="flex items-center gap-1.5 font-bold">
          <span className="truncate">{account.full_name}</span>
          {account.user_id === actorId && <span className="rounded-[5px] bg-[#F5F5F5] px-1.5 text-xs font-medium text-[#5C636A]">Bạn</span>}
        </p>
        <p className="truncate text-xs text-[#5C636A]">{account.email}</p>
      </div>
    </div>
  );
}

function AccountTable({ rows, actorId, onDetail, onAction }: RowProps) {
  return (
    <div className="hidden overflow-x-auto md:block">
      <table className="w-full min-w-[820px] text-left text-sm">
        <thead className="border-b border-[#E0E0E0] bg-[#F8F9FA] text-[13px] font-semibold text-[#5C636A]">
          <tr>
            <th scope="col" className="px-4 py-3">Tài khoản</th>
            <th scope="col" className="px-4 py-3">Vai trò</th>
            <th scope="col" className="px-4 py-3 text-center">Trạng thái</th>
            <th scope="col" className="px-4 py-3">Ngày tạo</th>
            <th scope="col" className="px-4 py-3 text-right">Thao tác</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[#E0E0E0]">
          {rows.map((account) => (
            <tr key={account.user_id} className="hover:bg-[#F8F9FA]">
              <td className="px-4 py-3"><NameCell account={account} actorId={actorId} /></td>
              <td className="px-4 py-3"><RoleTag role={account.role} /></td>
              <td className="px-4 py-3 text-center"><StatusTag status={account.status} /></td>
              <td className="whitespace-nowrap px-4 py-3 text-[#5C636A]">{formatDate(account.created_at)}</td>
              <td className="w-[340px] px-4 py-3">
                <RowActions account={account} actorId={actorId} onDetail={onDetail} onAction={onAction} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function AccountCards({ rows, actorId, onDetail, onAction }: RowProps) {
  return (
    <ul className="divide-y divide-[#E0E0E0] md:hidden">
      {rows.map((account) => {
        const actions = accountActions(account, actorId);
        return (
          <li key={account.user_id} className="space-y-3 p-4">
            <div className="flex items-start justify-between gap-2">
              <NameCell account={account} actorId={actorId} />
              <RoleTag role={account.role} />
            </div>
            <div className="flex items-center gap-2 text-xs text-[#5C636A]">
              <StatusTag status={account.status} /> Tạo {formatDate(account.created_at)}
            </div>
            <RowActions account={account} actorId={actorId} onDetail={onDetail} onAction={onAction} compact />
            {actions.roleChangeHint && !actions.isSelf && <p className="text-xs text-[#5C636A]">Không đổi được vai trò: {actions.roleChangeHint.toLowerCase()}.</p>}
          </li>
        );
      })}
    </ul>
  );
}

function AccountDetailDrawer({ account, actorId, onClose, onAction }: { account: AccountRow; actorId: number | null; onClose: () => void; onAction: (pending: Pending) => void }) {
  const actions = accountActions(account, actorId);
  return (
    <Drawer labelledBy="account-detail-title" onClose={onClose}
      title={<div className="flex items-center gap-3">
        <Avatar name={account.full_name} size="lg" />
        <div className="min-w-0">
          <h2 id="account-detail-title" className="truncate text-base font-bold">{account.full_name}</h2>
          <div className="mt-1 flex flex-wrap gap-1.5"><RoleTag role={account.role} /><StatusTag status={account.status} /></div>
        </div>
      </div>}
      footer={<div className="flex justify-end"><button type="button" onClick={onClose} className={buttonOutline}>Đóng</button></div>}>
      <div className="space-y-5">
        <dl className="divide-y divide-[#E0E0E0] rounded-[5px] border border-[#E0E0E0] bg-[#F8F9FA] px-3 text-sm">
          {[
            ["Email", account.email || "Chưa có"],
            ["Số điện thoại", account.phone || "Chưa có"],
            ["Vai trò", ROLE_LABELS[account.role]],
            ["Trạng thái", account.status === "Active" ? "Đang hoạt động" : "Đã khóa"],
            ["Ngày tạo tài khoản", formatDate(account.created_at)],
          ].map(([label, value]) => (
            <div key={label} className="flex justify-between gap-3 py-2.5">
              <dt className="text-[#5C636A]">{label}</dt>
              <dd className="min-w-0 break-all text-right font-medium">{value}</dd>
            </div>
          ))}
        </dl>

        {account.has_staff_profile && (
          <div className="rounded-[5px] border border-[#E0E0E0] bg-[#F8F9FA] p-3 text-sm">
            <p className="font-bold">Hồ sơ nhân sự</p>
            <p className="mt-1">Tài khoản này gắn với hồ sơ nhân sự Leader nên không thể đổi vai trò tại đây.</p>
          </div>
        )}
        {account.role === "Customer" && (
          <Link href="/staff/customers" className={cn(buttonOutline, "w-full")}>
            <ExternalLink aria-hidden="true" className="size-4" /> Xem khách hàng và lịch sử đặt vé
          </Link>
        )}

        {actions.isSelf ? (
          <p className="text-sm text-[#5C636A]">Không thể tự thay đổi vai trò hoặc khóa tài khoản của bạn.</p>
        ) : (
          <div className="space-y-2">
            <button type="button" disabled={!actions.canChangeRole} onClick={() => onAction({ kind: "role", account })} className={cn(buttonOutline, "w-full")}>
              <UserCog aria-hidden="true" className="size-4" /> Đổi vai trò
            </button>
            {actions.roleChangeHint && <p className="text-xs text-[#5C636A]">{actions.roleChangeHint}</p>}
            {account.status === "Active" ? (
              <button type="button" onClick={() => onAction({ kind: "lock", account })} className={cn(buttonOutlineDanger, "w-full")}>
                <Lock aria-hidden="true" className="size-4" /> Khóa tài khoản
              </button>
            ) : (
              <button type="button" onClick={() => onAction({ kind: "unlock", account })} className={cn(buttonOutlineGreen, "w-full")}>
                <LockOpen aria-hidden="true" className="size-4" /> Mở khóa tài khoản
              </button>
            )}
            <p className="text-xs text-[#5C636A]">Khóa tài khoản sẽ đăng xuất người dùng khỏi mọi thiết bị.</p>
          </div>
        )}
      </div>
    </Drawer>
  );
}

function useSubmit(action: "role" | "lock" | "unlock") {
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<Failure | null>(null);
  const inFlight = useRef(false);
  async function run(task: () => Promise<void>) {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setFailure(null);
    try { await task(); } catch (cause) {
      const error = cause instanceof AccountClientError ? cause : new AccountClientError(0, "NETWORK_ERROR", "");
      setFailure(describeFailure(error.code, error.status, action));
    } finally { inFlight.current = false; setBusy(false); }
  }
  return { busy, failure, run };
}

function RoleDialog({ account, source, onClose, onDone }: { account: AccountRow; source: AccountSource; onClose: () => void; onDone: (role: Role) => void }) {
  const [role, setRole] = useState<Role>(account.role);
  const { busy, failure, run } = useSubmit("role");
  const options = roleOptions(account);
  return (
    <Dialog labelledBy="role-dialog-title" busy={busy} onClose={onClose}
      title={<><ShieldCheck aria-hidden="true" className="size-5 text-[#186734]" /> Đổi vai trò</>}
      actions={<>
        <button type="button" onClick={onClose} disabled={busy} className={buttonOutline}>Hủy</button>
        <button type="button" disabled={busy || role === account.role} className={buttonYellow}
          onClick={() => run(async () => { await source.updateAccess(account.user_id, { role }); onDone(role); })}>
          {busy && <Spinner />} Lưu vai trò
        </button>
      </>}>
      <p className="text-sm text-[#5C636A]">Tài khoản: <span className="font-semibold text-[#212529]">{account.full_name}</span> ({account.email}) · Vai trò hiện tại: <span className="font-semibold text-[#212529]">{ROLE_LABELS[account.role]}</span></p>
      <fieldset className="space-y-2">
        <legend className="sr-only">Chọn vai trò mới</legend>
        {options.map((option) => (
          <label key={option.role} className={cn("flex items-start gap-3 rounded-[5px] border p-3",
            option.disabled ? "cursor-not-allowed border-[#E0E0E0] bg-[#F8F9FA] text-[#5C636A]"
              : role === option.role ? "cursor-pointer border-[#186734] bg-[#E8F5E9]/40" : "cursor-pointer border-[#E0E0E0] hover:bg-[#F8F9FA]")}>
            <input type="radio" name="role" value={option.role} checked={role === option.role} disabled={option.disabled || busy}
              onChange={() => setRole(option.role)} className="mt-1 size-4 accent-[#186734]" />
            <span>
              <span className="block text-sm font-semibold">{option.label}{option.current && " (hiện tại)"}</span>
              <span className="block text-xs text-[#5C636A]">{option.description}</span>
            </span>
          </label>
        ))}
      </fieldset>
      <Notice tone="info" title="Người dùng sẽ bị đăng xuất và phải đăng nhập lại với vai trò mới.">
        Hệ thống luôn giữ ít nhất một quản trị viên đang hoạt động.
      </Notice>
      {failure && <Notice tone="danger" title={failure.title}>{failure.detail}</Notice>}
    </Dialog>
  );
}

function LockDialog({ account, source, locking, onClose, onDone }: { account: AccountRow; source: AccountSource; locking: boolean; onClose: () => void; onDone: () => void }) {
  const { busy, failure, run } = useSubmit(locking ? "lock" : "unlock");
  const target: AccountStatus = locking ? "Locked" : "Active";
  return (
    <Dialog labelledBy="lock-dialog-title" busy={busy} onClose={onClose}
      title={<>{locking ? <Lock aria-hidden="true" className="size-5 text-[#C62828]" /> : <LockOpen aria-hidden="true" className="size-5 text-[#186734]" />}
        {locking ? "Khóa tài khoản" : "Mở khóa tài khoản"}</>}
      actions={<>
        <button type="button" onClick={onClose} disabled={busy} className={buttonOutline}>Hủy</button>
        <button type="button" disabled={busy} className={locking ? buttonDanger : buttonGreen}
          onClick={() => run(async () => { await source.updateAccess(account.user_id, { status: target }); onDone(); })}>
          {busy ? <Spinner /> : locking ? <Lock aria-hidden="true" className="size-4" /> : <LockOpen aria-hidden="true" className="size-4" />}
          {locking ? "Khóa tài khoản" : "Mở khóa"}
        </button>
      </>}>
      <div className="flex items-center gap-3">
        <Avatar name={account.full_name} size="lg" />
        <div className="min-w-0">
          <p className="truncate font-bold">{account.full_name}</p>
          <p className="truncate text-sm text-[#5C636A]">{account.email}</p>
        </div>
        <RoleTag role={account.role} />
      </div>
      {locking ? (
        <Notice tone="warning" title="Người dùng sẽ bị đăng xuất khỏi mọi thiết bị">
          Tài khoản không thể đăng nhập cho đến khi được mở khóa. Dữ liệu và lịch sử của tài khoản được giữ nguyên.
        </Notice>
      ) : (
        <p className="text-sm">Sau khi mở khóa, người dùng đăng nhập lại bình thường theo vai trò hiện có. Mật khẩu không thay đổi.</p>
      )}
      {failure && <Notice tone="danger" title={failure.title}>{failure.detail}</Notice>}
    </Dialog>
  );
}
