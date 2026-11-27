"use client";

import { useState, type FormEvent } from "react";
import { Plus, UserRound, Users } from "lucide-react";
import type { StaffDto } from "@/schemas/staff";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  errorMessage, formatVietnamDate, personnelApi, type StaffCreateInput, type StaffPatch, type StaffStatus, type StaffType,
} from "@/lib/staff-ops-client";
import {
  crewRoleLabel, Drawer, EmptyState, Notice, Pager, Panel, Pill, RefreshButton, ResourceView, SectionHeader, SelectField,
  staffStatusLabel, useResource, type NoticeValue,
} from "./shared";

const PAGE_SIZE = 10;
const typeOptions = [
  { value: "", label: "Tất cả loại" },
  { value: "Driver", label: crewRoleLabel.Driver },
  { value: "Assistant", label: crewRoleLabel.Assistant },
  { value: "Leader", label: crewRoleLabel.Leader },
];
const statusOptions = [
  { value: "", label: "Tất cả trạng thái" },
  { value: "Active", label: staffStatusLabel.Active.label },
  { value: "Inactive", label: staffStatusLabel.Inactive.label },
];

export function PersonnelManager() {
  const [type, setType] = useState<"" | StaffType>("");
  const [status, setStatus] = useState<"" | StaffStatus>("");
  const [page, setPage] = useState(1);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<StaffDto | null>(null);
  const [notice, setNotice] = useState<NoticeValue>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  const staff = useResource(`personnel:${type}:${status}:${page}`, () =>
    personnelApi.list({ page, pageSize: PAGE_SIZE, staff_type: type || undefined, status: status || undefined }));

  async function deactivate(item: StaffDto) {
    if (!window.confirm(`Ngừng hoạt động nhân sự ${item.full_name}? Nhân sự này sẽ không thể được phân công cho chuyến mới.`)) return;
    setBusyId(item.staff_id);
    setNotice(null);
    try {
      await personnelApi.deactivate(item.staff_id);
      setNotice({ type: "success", text: `Đã ngừng hoạt động ${item.full_name}.` });
      staff.reload();
    } catch (err) {
      setNotice({ type: "error", text: errorMessage(err), hint: "Nhân sự đang được phân công cho chuyến chưa kết thúc thì phải gỡ phân công trước." });
    } finally {
      setBusyId(null);
    }
  }

  return (
    <Panel className="space-y-5">
      <SectionHeader
        title="Nhân sự đi tour"
        description="Hồ sơ tài xế, phụ xe và Leader. Tài khoản đăng nhập chỉ được cấp cho Leader và được tạo cùng lúc với hồ sơ."
        actions={<>
          <RefreshButton onClick={staff.reload} loading={staff.loading} label="Làm mới danh sách nhân sự" />
          <Button type="button" variant="brand" onClick={() => setCreating(true)}><Plus /> Thêm nhân sự</Button>
        </>}
      />
      <Notice notice={notice} onClose={() => setNotice(null)} />
      <div className="grid gap-3 sm:max-w-lg sm:grid-cols-2">
        <SelectField id="staff-type-filter" label="Loại nhân sự" value={type} options={typeOptions}
          onChange={(value) => { setType(value as "" | StaffType); setPage(1); }} />
        <SelectField id="staff-status-filter" label="Trạng thái" value={status} options={statusOptions}
          onChange={(value) => { setStatus(value as "" | StaffStatus); setPage(1); }} />
      </div>

      <ResourceView resource={staff} loadingLabel="Đang tải danh sách nhân sự..." errorTitle="Không thể tải danh sách nhân sự"
        isEmpty={(data) => data.items.length === 0}
        empty={<EmptyState icon={<Users className="size-10 text-zinc-300" aria-hidden />}
          title={type || status ? "Không có nhân sự phù hợp bộ lọc" : "Chưa có nhân sự nào"}
          message={type || status ? "Thử bỏ bớt điều kiện lọc." : "Thêm tài xế, phụ xe và Leader để phân công cho chuyến."}
          action={!type && !status && <Button type="button" variant="brand" size="sm" onClick={() => setCreating(true)}><Plus /> Thêm nhân sự</Button>} />}>
        {(data) => (
          <>
            <ul className="divide-y divide-zinc-200 overflow-hidden rounded-2xl border border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
              {data.items.map((item) => (
                <li key={item.staff_id} className="flex flex-col gap-3 p-3 sm:flex-row sm:items-center sm:justify-between sm:p-4">
                  <div className="flex min-w-0 items-start gap-3">
                    <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-zinc-100 text-zinc-500 dark:bg-zinc-800">
                      <UserRound className="size-4" aria-hidden />
                    </div>
                    <div className="min-w-0 space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-black text-zinc-950 dark:text-white">{item.full_name}</span>
                        <Pill color="blue">{crewRoleLabel[item.staff_type]}</Pill>
                        <Pill color={staffStatusLabel[item.status].color}>{staffStatusLabel[item.status].label}</Pill>
                      </div>
                      <p className="text-xs text-zinc-500 dark:text-zinc-400">#{item.staff_id} · {item.phone}</p>
                      {item.staff_type === "Driver" && item.license_number && (
                        <p className="text-xs text-zinc-500 dark:text-zinc-400">
                          GPLX {item.license_number} · hạng {item.license_class} · hết hạn {item.license_expiry && formatVietnamDate(`${item.license_expiry}T00:00:00+07:00`, false)}
                        </p>
                      )}
                      {item.account && (
                        <p className="break-words text-xs text-zinc-500 dark:text-zinc-400">
                          Tài khoản: <span className="break-all">{item.account.email}</span> · {item.account.status === "Active" ? "đang hoạt động" : "đã khóa"}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="flex gap-2 sm:shrink-0">
                    <Button type="button" variant="outline" size="sm" onClick={() => setEditing(item)}>Sửa</Button>
                    {item.status === "Active" && (
                      <Button type="button" variant="outline" size="sm" className="text-red-600 hover:text-red-700"
                        isLoading={busyId === item.staff_id} onClick={() => deactivate(item)}>Ngừng hoạt động</Button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
            <Pager page={data.pagination.page} totalPages={data.pagination.totalPages} totalItems={data.pagination.totalItems}
              onChange={setPage} disabled={staff.loading} />
          </>
        )}
      </ResourceView>

      <CreateStaffDrawer open={creating} onClose={() => setCreating(false)} onCreated={(item) => {
        setCreating(false);
        setNotice({ type: "success", text: `Đã thêm ${crewRoleLabel[item.staff_type].toLowerCase()} ${item.full_name}${item.account ? " kèm tài khoản Leader" : ""}.` });
        staff.reload();
      }} />
      <EditStaffDrawer key={editing?.staff_id ?? "none"} staff={editing} onClose={() => setEditing(null)} onSaved={(item) => {
        setEditing(null);
        setNotice({ type: "success", text: `Đã cập nhật ${item.full_name}.` });
        staff.reload();
      }} />
    </Panel>
  );
}

function LicenseFields({ number, setNumber, licenseClass, setLicenseClass, expiry, setExpiry, prefix }: {
  number: string; setNumber: (value: string) => void; licenseClass: string; setLicenseClass: (value: string) => void;
  expiry: string; setExpiry: (value: string) => void; prefix: string;
}) {
  return (
    <fieldset className="space-y-3 rounded-2xl border border-zinc-200 p-3 dark:border-zinc-800">
      <legend className="px-1 text-xs font-bold text-zinc-700 dark:text-zinc-300">Giấy phép lái xe (bắt buộc với tài xế)</legend>
      <Input id={`${prefix}-license-number`} label="Số GPLX" required maxLength={50} value={number} onChange={(event) => setNumber(event.target.value)} />
      <div className="grid grid-cols-2 gap-3">
        <Input id={`${prefix}-license-class`} label="Hạng" required maxLength={20} value={licenseClass} onChange={(event) => setLicenseClass(event.target.value)} placeholder="D" />
        <Input id={`${prefix}-license-expiry`} label="Hết hạn" type="date" required value={expiry} onChange={(event) => setExpiry(event.target.value)} />
      </div>
      <p className="text-xs text-zinc-500">GPLX phải còn hạn tại thời điểm lưu.</p>
    </fieldset>
  );
}

function CreateStaffDrawer({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: (item: StaffDto) => void }) {
  const [type, setType] = useState<StaffType>("Driver");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [licenseNumber, setLicenseNumber] = useState("");
  const [licenseClass, setLicenseClass] = useState("");
  const [licenseExpiry, setLicenseExpiry] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setName(""); setPhone(""); setLicenseNumber(""); setLicenseClass(""); setLicenseExpiry(""); setEmail(""); setPassword("");
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    const input: StaffCreateInput = {
      full_name: name.trim(), phone: phone.trim(), staff_type: type,
      ...(type === "Driver" ? { license_number: licenseNumber.trim(), license_class: licenseClass.trim(), license_expiry: licenseExpiry } : {}),
      ...(type === "Leader" ? { account: { email: email.trim(), password } } : {}),
    };
    setBusy(true);
    setError(null);
    try {
      const item = await personnelApi.create(input);
      reset();
      onCreated(item);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
      setPassword("");
    }
  }

  return (
    <Drawer open={open} onClose={onClose} title="Thêm nhân sự" description="Loại nhân sự không đổi được sau khi tạo.">
      <form onSubmit={submit} className="space-y-4">
        <Notice notice={error ? { type: "error", text: error,
          hint: type === "Leader" ? "Email có thể đã được dùng; mật khẩu cần 12–72 ký tự." : "Kiểm tra số điện thoại (9–15 số) và GPLX còn hạn." } : null}
          onClose={() => setError(null)} />
        <SelectField id="new-staff-type" label="Loại nhân sự" required value={type} onChange={(value) => setType(value as StaffType)}
          options={typeOptions.slice(1)} helperText={type === "Leader" ? "Leader được cấp tài khoản đăng nhập để check-in khách." : "Tài xế và phụ xe không có tài khoản đăng nhập."} />
        <Input id="new-staff-name" label="Họ tên" required minLength={2} maxLength={100} value={name} onChange={(event) => setName(event.target.value)} />
        <Input id="new-staff-phone" label="Số điện thoại" required inputMode="tel" pattern="\+?[0-9]{9,15}" value={phone}
          onChange={(event) => setPhone(event.target.value)} placeholder="0901234567" />
        {type === "Driver" && (
          <LicenseFields prefix="new" number={licenseNumber} setNumber={setLicenseNumber} licenseClass={licenseClass}
            setLicenseClass={setLicenseClass} expiry={licenseExpiry} setExpiry={setLicenseExpiry} />
        )}
        {type === "Leader" && (
          <fieldset className="space-y-3 rounded-2xl border border-zinc-200 p-3 dark:border-zinc-800">
            <legend className="px-1 text-xs font-bold text-zinc-700 dark:text-zinc-300">Tài khoản đăng nhập Leader</legend>
            <Input id="new-staff-email" label="Email" type="email" required autoComplete="off" value={email} onChange={(event) => setEmail(event.target.value)} />
            <Input id="new-staff-password" label="Mật khẩu ban đầu" type="password" required minLength={12} maxLength={72} autoComplete="new-password"
              value={password} onChange={(event) => setPassword(event.target.value)} helperText="12–72 ký tự. Gửi cho Leader qua kênh riêng, không lưu trong ghi chú." />
          </fieldset>
        )}
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="outline" onClick={onClose}>Hủy</Button>
          <Button type="submit" variant="brand" isLoading={busy}>Tạo nhân sự</Button>
        </div>
      </form>
    </Drawer>
  );
}

function EditStaffDrawer({ staff, onClose, onSaved }: { staff: StaffDto | null; onClose: () => void; onSaved: (item: StaffDto) => void }) {
  const [name, setName] = useState(staff?.full_name ?? "");
  const [phone, setPhone] = useState(staff?.phone ?? "");
  const [status, setStatus] = useState<StaffStatus>(staff?.status ?? "Active");
  const [licenseNumber, setLicenseNumber] = useState(staff?.license_number ?? "");
  const [licenseClass, setLicenseClass] = useState(staff?.license_class ?? "");
  const [licenseExpiry, setLicenseExpiry] = useState(staff?.license_expiry ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!staff) return <Drawer open={false} onClose={onClose} title="Sửa nhân sự">{null}</Drawer>;

  const patch: StaffPatch = {
    ...(name.trim() !== staff.full_name ? { full_name: name.trim() } : {}),
    ...(phone.trim() !== staff.phone ? { phone: phone.trim() } : {}),
    ...(status !== staff.status ? { status } : {}),
    ...(staff.staff_type === "Driver" && licenseNumber.trim() !== (staff.license_number ?? "") ? { license_number: licenseNumber.trim() } : {}),
    ...(staff.staff_type === "Driver" && licenseClass.trim() !== (staff.license_class ?? "") ? { license_class: licenseClass.trim() } : {}),
    ...(staff.staff_type === "Driver" && licenseExpiry !== (staff.license_expiry ?? "") ? { license_expiry: licenseExpiry } : {}),
  };
  const dirty = Object.keys(patch).length > 0;

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!dirty || !staff) return;
    setBusy(true);
    setError(null);
    try {
      onSaved(await personnelApi.update(staff.staff_id, patch));
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Drawer open onClose={onClose} title={`Sửa ${crewRoleLabel[staff.staff_type].toLowerCase()} #${staff.staff_id}`}
      description={staff.account ? `Tài khoản Leader: ${staff.account.email}. Khóa/mở tài khoản đăng nhập do Admin thực hiện riêng.` : undefined}>
      <form onSubmit={submit} className="space-y-4">
        <Notice notice={error ? { type: "error", text: error, hint: "Nhân sự đang có chuyến chưa kết thúc thì không thể ngừng hoạt động hoặc để GPLX hết hạn." } : null}
          onClose={() => setError(null)} />
        <Input id="edit-staff-name" label="Họ tên" required minLength={2} maxLength={100} value={name} onChange={(event) => setName(event.target.value)} />
        <Input id="edit-staff-phone" label="Số điện thoại" required inputMode="tel" pattern="\+?[0-9]{9,15}" value={phone} onChange={(event) => setPhone(event.target.value)} />
        <SelectField id="edit-staff-status" label="Trạng thái" value={status} onChange={(value) => setStatus(value as StaffStatus)} options={statusOptions.slice(1)} />
        {staff.staff_type === "Driver" && (
          <LicenseFields prefix="edit" number={licenseNumber} setNumber={setLicenseNumber} licenseClass={licenseClass}
            setLicenseClass={setLicenseClass} expiry={licenseExpiry} setExpiry={setLicenseExpiry} />
        )}
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="outline" onClick={onClose}>Hủy</Button>
          <Button type="submit" variant="brand" disabled={!dirty} isLoading={busy}>Lưu thay đổi</Button>
        </div>
      </form>
    </Drawer>
  );
}
