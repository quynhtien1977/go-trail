"use client";

import { useState, type FormEvent } from "react";
import { CalendarDays, CheckCircle2, Circle, Plus, Search } from "lucide-react";
import type { Role } from "@/schemas/auth";
import type { ManagedDepartureDto } from "@/schemas/departure";
import type { AssignmentDto } from "@/schemas/assignment";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { fetchStaffPickups, fetchStaffTrips, formatVnd } from "@/lib/catalog-client";
import {
  departureApi, errorMessage, formatVietnamDate, fromVietnamLocalInput, toVietnamLocalInput,
  type DepartureInput, type DepartureStatus,
} from "@/lib/staff-ops-client";
import { cn } from "@/lib/utils";
import { AssignmentPanel, summarizeCrew } from "./assignment-panel";
import {
  DepartureStatusPill, departureStatusLabel, Drawer, EmptyState, Notice, Pager, Panel, RefreshButton, ResourceView,
  SectionHeader, SelectField, useResource, type NoticeValue,
} from "./shared";

const PAGE_SIZE = 10;
const closedStatuses: DepartureStatus[] = ["Ended", "Cancelled", "Rescheduled"];

// MVP state machine (PRD 4): no cancel or reschedule actions are offered anywhere.
// Running -> Ended belongs to the Leader flow (L02).
const transitions: Partial<Record<DepartureStatus, { to: DepartureStatus; label: string; confirm: string; hint: string }>> = {
  Draft: {
    to: "Open", label: "Mở bán", confirm: "Mở bán chuyến này? Sau khi mở bán sẽ không sửa được lịch, giá và điểm đón.",
    hint: "Điều kiện mở bán: có RouteMgr đang hoạt động phụ trách hóa đơn, ít nhất 1 điểm đón đang hoạt động, ít nhất 1 xe Sẵn sàng đã sinh đủ ghế và hạn đặt vé chưa qua.",
  },
  Open: {
    to: "Closed", label: "Đóng bán", confirm: "Đóng bán chuyến này? Khách sẽ không đặt thêm được.",
    hint: "Chỉ đóng bán khi đã qua hạn đặt vé hoặc mọi ghế đã bán hết.",
  },
  Closed: {
    to: "Confirmed", label: "Chốt chuyến", confirm: "Chốt chuyến này? Sau khi chốt không thêm/bỏ xe được nữa.",
    hint: "Điều kiện chốt: đủ số khách tối thiểu (vé đã thanh toán), mỗi xe có tài xế và phụ xe, đủ Leader theo tỷ lệ Leader/khách.",
  },
  Confirmed: {
    to: "Running", label: "Bắt đầu chạy", confirm: "Bắt đầu vận hành chuyến này?",
    hint: "Chỉ bắt đầu được từ giờ đón sớm nhất (hoặc giờ khởi hành) và tổ lái phải còn đầy đủ, hợp lệ.",
  },
};

export function DepartureManager({ actorRole }: { actorRole: Role }) {
  const canManage = actorRole === "RouteMgr" || actorRole === "Admin";
  const canAssign = actorRole === "HRMgr" || actorRole === "Admin";
  return (
    <div className="space-y-6">
      {canManage && <TripDepartures actorRole={actorRole} canAssign={canAssign} />}
      {actorRole === "HRMgr" && <DepartureLookup />}
    </div>
  );
}

// ---------------------------------------------------------------------------
// RouteMgr / Admin: departures per trip
// ---------------------------------------------------------------------------
function TripDepartures({ actorRole, canAssign }: { actorRole: Role; canAssign: boolean }) {
  const trips = useResource("staff-trips", () => fetchStaffTrips({ page: 1, pageSize: 50 }));
  const [tripId, setTripId] = useState<number | null>(null);
  const [status, setStatus] = useState<"" | DepartureStatus>("");
  const [page, setPage] = useState(1);
  const [form, setForm] = useState<{ mode: "create" } | { mode: "edit"; departure: ManagedDepartureDto } | null>(null);
  const [detailId, setDetailId] = useState<number | null>(null);
  const [notice, setNotice] = useState<NoticeValue>(null);

  const selectedTripId = tripId ?? trips.data?.items[0]?.trip_id ?? null;
  const selectedTrip = trips.data?.items.find((trip) => trip.trip_id === selectedTripId);
  const departures = useResource(selectedTripId === null ? null : `departures:${selectedTripId}:${status}:${page}`,
    () => departureApi.list(selectedTripId!, { page, pageSize: PAGE_SIZE, status: status || undefined }));

  return (
    <Panel className="space-y-5">
      <SectionHeader
        title="Chuyến khởi hành"
        description="Tạo chuyến nháp, lập lịch điểm đón, chọn nhân viên phụ trách hóa đơn và chuyển trạng thái Nháp → Mở bán → Đóng bán → Chốt → Đang chạy. MVP không có hủy hoặc dời chuyến."
        actions={<>
          <RefreshButton onClick={() => { trips.reload(); departures.reload(); }} loading={trips.loading || departures.loading} label="Làm mới danh sách chuyến" />
          <Button type="button" variant="brand" disabled={!selectedTrip?.is_active} onClick={() => setForm({ mode: "create" })}
            title={selectedTrip && !selectedTrip.is_active ? "Tuyến đang tạm ẩn, không tạo chuyến mới được" : undefined}>
            <Plus /> Tạo chuyến
          </Button>
        </>}
      />
      <Notice notice={notice} onClose={() => setNotice(null)} />

      <ResourceView resource={trips} loadingLabel="Đang tải danh sách tuyến..." errorTitle="Không thể tải danh sách tuyến"
        isEmpty={(data) => data.items.length === 0}
        empty={<EmptyState title="Chưa có tuyến nào" message="Tạo tuyến ở tab Tuyến & điểm đón trước khi lập chuyến." />}>
        {(tripPage) => (
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-[2fr_1fr]">
              <SelectField id="departure-trip" label="Tuyến" value={String(selectedTripId ?? "")}
                onChange={(value) => { setTripId(Number(value)); setPage(1); }}
                options={tripPage.items.map((trip) => ({ value: String(trip.trip_id), label: `#${trip.trip_id} · ${trip.name}${trip.is_active ? "" : " (tạm ẩn)"}` }))} />
              <SelectField id="departure-status-filter" label="Trạng thái" value={status}
                onChange={(value) => { setStatus(value as "" | DepartureStatus); setPage(1); }}
                options={[{ value: "", label: "Tất cả" }, ...(["Draft", "Open", "Closed", "Confirmed", "Running", "Ended"] as const)
                  .map((value) => ({ value, label: departureStatusLabel[value].label }))]} />
            </div>

            <ResourceView resource={departures} loadingLabel="Đang tải chuyến..." errorTitle="Không thể tải danh sách chuyến"
              isEmpty={(data) => data.items.length === 0}
              empty={<EmptyState icon={<CalendarDays className="size-10 text-zinc-300" aria-hidden />}
                title={status ? "Không có chuyến ở trạng thái này" : "Tuyến chưa có chuyến nào"}
                message={status ? "Thử chọn trạng thái khác." : "Tạo chuyến nháp đầu tiên cho tuyến này."}
                action={!status && selectedTrip?.is_active && <Button type="button" variant="brand" size="sm" onClick={() => setForm({ mode: "create" })}><Plus /> Tạo chuyến</Button>} />}>
              {(data) => (
                <>
                  <ul className="space-y-3">
                    {data.items.map((departure) => (
                      <DepartureCard key={departure.departure_id} departure={departure} actorRole={actorRole}
                        onDetail={() => setDetailId(departure.departure_id)}
                        onEdit={() => setForm({ mode: "edit", departure })} />
                    ))}
                  </ul>
                  <Pager page={data.pagination.page} totalPages={data.pagination.totalPages} totalItems={data.pagination.totalItems}
                    onChange={setPage} disabled={departures.loading} />
                </>
              )}
            </ResourceView>
          </div>
        )}
      </ResourceView>

      {form && selectedTripId !== null && (
        <DepartureFormDrawer key={form.mode === "edit" ? form.departure.departure_id : "create"} tripId={selectedTripId} actorRole={actorRole}
          departure={form.mode === "edit" ? form.departure : null} onClose={() => setForm(null)}
          onSaved={(departure, created) => {
            setForm(null);
            setNotice({ type: "success", text: created ? `Đã tạo chuyến nháp #${departure.departure_id}. Gán xe rồi mở bán khi sẵn sàng.` : `Đã cập nhật chuyến #${departure.departure_id}.` });
            departures.reload();
          }} />
      )}
      <DepartureDetailDrawer departureId={detailId} actorRole={actorRole} canAssign={canAssign} onClose={() => setDetailId(null)}
        onChanged={departures.reload} onEdit={(departure) => { setDetailId(null); setForm({ mode: "edit", departure }); }} />
    </Panel>
  );
}

function canEditDeparture(departure: ManagedDepartureDto, actorRole: Role) {
  if (departure.status === "Draft") return true;
  return actorRole === "Admin" && !closedStatuses.includes(departure.status);
}

function DepartureCard({ departure, actorRole, onDetail, onEdit }: {
  departure: ManagedDepartureDto; actorRole: Role; onDetail: () => void; onEdit: () => void;
}) {
  return (
    <li className="space-y-3 rounded-2xl border border-zinc-200 p-3 sm:p-4 dark:border-zinc-800">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-black text-zinc-950 dark:text-white">Chuyến #{departure.departure_id}</span>
            <DepartureStatusPill status={departure.status} />
            {departure.is_demo && <span className="text-[11px] font-bold text-zinc-400">DEMO</span>}
          </div>
          <p className="text-xs text-zinc-600 dark:text-zinc-400">Khởi hành {formatVietnamDate(departure.departure_date)} · hạn đặt {formatVietnamDate(departure.booking_deadline)}</p>
        </div>
        <span className="text-sm font-black text-zinc-950 dark:text-white">{formatVnd(departure.price)}</span>
      </div>
      <dl className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-3">
        <div><dt className="text-zinc-500">Khách tối thiểu</dt><dd className="font-semibold">{departure.min_passengers}</dd></div>
        <div><dt className="text-zinc-500">Điểm đón</dt><dd className="font-semibold">{departure.pickups.length}</dd></div>
        <div className="col-span-2 sm:col-span-1">
          <dt className="text-zinc-500">Nhân viên phụ trách hóa đơn</dt>
          <dd className={cn("font-semibold", !departure.invoice_owner && "text-red-600")}>
            {departure.invoice_owner ? departure.invoice_owner.full_name : "Chưa phân công"}
          </dd>
        </div>
      </dl>
      <div className="flex flex-wrap justify-end gap-2">
        {canEditDeparture(departure, actorRole) && (
          <Button type="button" variant="outline" size="sm" onClick={onEdit}>
            {departure.status === "Draft" ? "Sửa nháp" : "Đổi người phụ trách"}
          </Button>
        )}
        <Button type="button" variant="outline" size="sm" onClick={onDetail}>Chi tiết, phân công & trạng thái</Button>
      </div>
    </li>
  );
}

// ---------------------------------------------------------------------------
// Detail: readiness checklist, status transition and assignments
// ---------------------------------------------------------------------------
function DepartureDetailDrawer({ departureId, actorRole, canAssign, onClose, onChanged, onEdit }: {
  departureId: number | null; actorRole: Role; canAssign: boolean; onClose: () => void; onChanged: () => void;
  onEdit: (departure: ManagedDepartureDto) => void;
}) {
  const departure = useResource(departureId === null ? null : `departure:${departureId}`, () => departureApi.read(departureId!));
  const [crew, setCrew] = useState<AssignmentDto | null>(null);
  const [notice, setNotice] = useState<NoticeValue>(null);
  const [busy, setBusy] = useState(false);

  async function transition(current: ManagedDepartureDto) {
    const next = transitions[current.status];
    if (!next || !window.confirm(next.confirm)) return;
    setBusy(true);
    setNotice(null);
    try {
      const updated = await departureApi.setStatus(current.departure_id, next.to);
      departure.setData(updated);
      setNotice({ type: "success", text: `Chuyến #${updated.departure_id} đã chuyển sang “${departureStatusLabel[updated.status].label}”.` });
      onChanged();
    } catch (err) {
      setNotice({ type: "error", text: errorMessage(err), hint: next.hint });
    } finally {
      setBusy(false);
    }
  }

  const close = () => { setNotice(null); setCrew(null); onClose(); };

  return (
    <Drawer open={departureId !== null} onClose={close} title={`Chuyến #${departureId ?? ""}`}
      description="Kiểm tra điều kiện, phân công nguồn lực và chuyển trạng thái chuyến.">
      <Notice notice={notice} onClose={() => setNotice(null)} />
      <ResourceView resource={departure} loadingLabel="Đang tải chuyến..." errorTitle="Không thể tải chuyến" isEmpty={() => false} empty={null}>
        {(data) => {
          const next = transitions[data.status];
          const summary = crew && crew.departure_id === data.departure_id ? summarizeCrew(crew) : null;
          return (
            <div className="space-y-6">
              <div className="space-y-2 text-xs">
                <div className="flex flex-wrap items-center gap-2"><DepartureStatusPill status={data.status} />
                  <span className="font-black text-zinc-950 dark:text-white">{formatVnd(data.price)}</span></div>
                <p>Khởi hành <b>{formatVietnamDate(data.departure_date)}</b> · hạn đặt vé <b>{formatVietnamDate(data.booking_deadline)}</b></p>
                <p>Nhân viên phụ trách hóa đơn: <b className={cn(!data.invoice_owner && "text-red-600")}>{data.invoice_owner?.full_name ?? "Chưa phân công"}</b></p>
                {data.pickups.length > 0 && (
                  <ul className="space-y-1 rounded-xl bg-zinc-50 p-3 dark:bg-zinc-900">
                    {data.pickups.map((pickup) => (
                      <li key={pickup.dep_pickup_id}><b>{formatVietnamDate(pickup.pickup_time)}</b> — {pickup.name}, {pickup.address}</li>
                    ))}
                  </ul>
                )}
              </div>

              {data.status === "Draft" && (
                <Checklist items={[
                  { ok: !!data.invoice_owner, label: "Có RouteMgr phụ trách hóa đơn" },
                  { ok: data.pickups.length > 0, label: "Có ít nhất 1 điểm đón trong lịch" },
                  { ok: new Date(data.booking_deadline) > new Date(), label: "Hạn đặt vé chưa qua" },
                  { ok: summary ? summary.vehicles > 0 && summary.seats > 0 : null, label: "Đã gán xe và sinh ghế" },
                ]} />
              )}
              {data.status === "Closed" && summary && (
                <Checklist items={[
                  { ok: summary.missingDriver === 0, label: "Mỗi xe có tài xế" },
                  { ok: summary.missingAssistant === 0, label: "Mỗi xe có phụ xe" },
                  { ok: summary.leaders > 0, label: "Có Leader (đủ theo tỷ lệ khách sẽ được server kiểm tra)" },
                ]} />
              )}

              {(actorRole === "RouteMgr" || actorRole === "Admin") && (
                <div className="flex flex-wrap gap-2">
                  {next ? (
                    <Button type="button" variant="brand" isLoading={busy} onClick={() => transition(data)}>{next.label}</Button>
                  ) : (
                    <p className="text-xs text-zinc-500">
                      {data.status === "Running" ? "Leader kết thúc chuyến từ cổng Leader." : "Không còn thao tác trạng thái cho chuyến này."}
                    </p>
                  )}
                  {canEditDeparture(data, actorRole) && (
                    <Button type="button" variant="outline" onClick={() => onEdit(data)}>
                      {data.status === "Draft" ? "Sửa nháp" : "Đổi người phụ trách"}
                    </Button>
                  )}
                </div>
              )}

              {/* Remount on status change: editable actions depend on the departure status. */}
              <AssignmentPanel key={`${data.departure_id}:${data.status}`} departureId={data.departure_id} canEdit={canAssign} onChanged={setCrew} />
            </div>
          );
        }}
      </ResourceView>
    </Drawer>
  );
}

function Checklist({ items }: { items: { ok: boolean | null; label: string }[] }) {
  return (
    <ul className="space-y-1.5 rounded-2xl border border-zinc-200 p-3 text-xs dark:border-zinc-800">
      {items.map((item) => (
        <li key={item.label} className="flex items-center gap-2">
          {item.ok ? <CheckCircle2 className="size-4 text-emerald-600" aria-hidden /> : <Circle className={cn("size-4", item.ok === false ? "text-red-500" : "text-zinc-300")} aria-hidden />}
          <span className={cn(item.ok === false && "text-red-700 dark:text-red-300")}>{item.label}</span>
          <span className="sr-only">{item.ok ? "đạt" : item.ok === false ? "chưa đạt" : "đang kiểm tra"}</span>
        </li>
      ))}
    </ul>
  );
}

// ---------------------------------------------------------------------------
// Create / edit Draft, or (Admin) change the invoice owner of an open departure
// ---------------------------------------------------------------------------
function DepartureFormDrawer({ tripId, actorRole, departure, onClose, onSaved }: {
  tripId: number; actorRole: Role; departure: ManagedDepartureDto | null; onClose: () => void;
  onSaved: (departure: ManagedDepartureDto, created: boolean) => void;
}) {
  const ownerOnly = departure !== null && departure.status !== "Draft";
  const pickups = useResource(ownerOnly ? null : `form-pickups:${tripId}`, () => fetchStaffPickups(tripId, { pageSize: 50 }));
  const [departureDate, setDepartureDate] = useState(departure ? toVietnamLocalInput(departure.departure_date) : "");
  const [deadline, setDeadline] = useState(departure ? toVietnamLocalInput(departure.booking_deadline) : "");
  const [minPassengers, setMinPassengers] = useState(String(departure?.min_passengers ?? 10));
  const [priceOverride, setPriceOverride] = useState(departure?.price_override ?? "");
  const [owner, setOwner] = useState(departure?.invoice_owner ? String(departure.invoice_owner.user_id) : "");
  const [schedule, setSchedule] = useState<Record<number, string>>(() =>
    Object.fromEntries((departure?.pickups ?? []).map((item) => [item.pickup_id, toVietnamLocalInput(item.pickup_time)])));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isAdmin = actorRole === "Admin";

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (ownerOnly) {
        onSaved(await departureApi.update(departure.departure_id, { invoice_owner_user_id: Number(owner) }), false);
        return;
      }
      const input: DepartureInput = {
        departure_date: fromVietnamLocalInput(departureDate),
        booking_deadline: fromVietnamLocalInput(deadline),
        min_passengers: Number(minPassengers),
        price_override: priceOverride.trim() ? priceOverride.trim() : null,
        pickups: Object.entries(schedule).filter(([, time]) => time).map(([id, time]) => ({ pickup_id: Number(id), pickup_time: fromVietnamLocalInput(time) })),
        ...(isAdmin && owner ? { invoice_owner_user_id: Number(owner) } : {}),
      };
      onSaved(departure ? await departureApi.update(departure.departure_id, input) : await departureApi.create(tripId, input), !departure);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  const title = ownerOnly ? `Đổi người phụ trách — chuyến #${departure.departure_id}` : departure ? `Sửa chuyến nháp #${departure.departure_id}` : "Tạo chuyến nháp";
  const activePickups = (pickups.data ?? []).filter((item) => item.is_active || item.pickup_id in schedule);

  return (
    <Drawer open onClose={onClose} title={title}
      description={ownerOnly ? "Chỉ áp dụng cho hóa đơn mới; hóa đơn đã lập giữ nguyên tên nhân viên phụ trách lúc lập." : "Giờ nhập theo giờ Việt Nam (UTC+7)."}>
      <form onSubmit={submit} className="space-y-4">
        <Notice notice={error ? { type: "error", text: error, hint: ownerOnly
          ? "Người phụ trách phải là tài khoản RouteMgr đang hoạt động."
          : "Hạn đặt vé phải ở tương lai và không sau giờ khởi hành; giờ đón phải sau hạn đặt vé và cách giờ khởi hành không quá 24 giờ. Đổi ngày khởi hành cần bỏ xe đã gán trước." } : null}
          onClose={() => setError(null)} />

        {!ownerOnly && (
          <>
            <div className="grid gap-3 sm:grid-cols-2">
              <Input id="dep-date" label="Giờ khởi hành" type="datetime-local" required value={departureDate} onChange={(event) => setDepartureDate(event.target.value)} />
              <Input id="dep-deadline" label="Hạn đặt vé" type="datetime-local" required value={deadline} max={departureDate || undefined}
                onChange={(event) => setDeadline(event.target.value)} />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Input id="dep-min" label="Số khách tối thiểu" type="number" min={1} max={200} required value={minPassengers} onChange={(event) => setMinPassengers(event.target.value)} />
              <Input id="dep-price" label="Giá riêng (VND)" inputMode="numeric" pattern="0|[1-9][0-9]{0,13}" value={priceOverride}
                onChange={(event) => setPriceOverride(event.target.value)} helperText="Để trống để dùng giá cơ sở của tuyến." />
            </div>
            <fieldset className="space-y-2 rounded-2xl border border-zinc-200 p-3 dark:border-zinc-800">
              <legend className="px-1 text-xs font-bold text-zinc-700 dark:text-zinc-300">Lịch điểm đón</legend>
              <ResourceView resource={pickups} loadingLabel="Đang tải điểm đón..." errorTitle="Không thể tải điểm đón"
                isEmpty={() => activePickups.length === 0}
                empty={<EmptyState title="Tuyến chưa có điểm đón hoạt động" message="Thêm điểm đón ở tab Tuyến & điểm đón. Chuyến cần ít nhất 1 điểm đón để mở bán." />}>
                {() => (
                  <ul className="space-y-3">
                    {activePickups.map((pickup) => {
                      const checked = pickup.pickup_id in schedule;
                      return (
                        <li key={pickup.pickup_id} className="space-y-2">
                          <label className="flex items-start gap-2 text-xs">
                            <input type="checkbox" className="mt-0.5 size-4 accent-[#febb02]" checked={checked}
                              onChange={(event) => setSchedule((current) => {
                                const copy = { ...current };
                                if (event.target.checked) copy[pickup.pickup_id] = departureDate; else delete copy[pickup.pickup_id];
                                return copy;
                              })} />
                            <span><b>{pickup.name}</b> — {pickup.address}</span>
                          </label>
                          {checked && (
                            <Input id={`pickup-time-${pickup.pickup_id}`} aria-label={`Giờ đón tại ${pickup.name}`} type="datetime-local" required
                              value={schedule[pickup.pickup_id]} onChange={(event) => setSchedule((current) => ({ ...current, [pickup.pickup_id]: event.target.value }))} />
                          )}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </ResourceView>
            </fieldset>
          </>
        )}

        <fieldset className="space-y-2 rounded-2xl border border-zinc-200 p-3 dark:border-zinc-800">
          <legend className="px-1 text-xs font-bold text-zinc-700 dark:text-zinc-300">Nhân viên phụ trách hóa đơn</legend>
          {isAdmin ? (
            <Input id="dep-owner" label="Mã tài khoản RouteMgr (user_id)" type="number" min={1} required={ownerOnly || !departure} value={owner}
              onChange={(event) => setOwner(event.target.value)}
              helperText={`${departure?.invoice_owner ? `Hiện tại: ${departure.invoice_owner.full_name} (#${departure.invoice_owner.user_id}). ` : ""}Phải là tài khoản RouteMgr đang hoạt động; bắt buộc trước khi mở bán.`} />
          ) : (
            <p className="text-xs text-zinc-600 dark:text-zinc-400">
              {departure?.invoice_owner ? `${departure.invoice_owner.full_name} — ` : ""}Chuyến do bạn tạo sẽ do chính bạn phụ trách hóa đơn. Chỉ Admin đổi được người phụ trách.
            </p>
          )}
        </fieldset>

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="outline" onClick={onClose}>Hủy</Button>
          <Button type="submit" variant="brand" isLoading={busy}>{departure ? "Lưu thay đổi" : "Tạo chuyến nháp"}</Button>
        </div>
      </form>
    </Drawer>
  );
}

// ---------------------------------------------------------------------------
// HRMgr: no departure listing API for this role, so assignments are opened by departure ID.
// ---------------------------------------------------------------------------
function DepartureLookup() {
  const [value, setValue] = useState("");
  const [departureId, setDepartureId] = useState<number | null>(null);
  return (
    <Panel className="space-y-5">
      <SectionHeader title="Phân công cho chuyến"
        description="Nhập mã chuyến (do Quản lý Tuyến cung cấp) để gán xe, sinh ghế và phân công tài xế, phụ xe, Leader." />
      <form className="flex flex-col gap-3 sm:flex-row sm:items-end"
        onSubmit={(event) => { event.preventDefault(); const id = Number(value); if (Number.isInteger(id) && id > 0) setDepartureId(id); }}>
        <div className="flex-1 sm:max-w-xs">
          <Input id="lookup-departure" label="Mã chuyến" type="number" min={1} required value={value} onChange={(event) => setValue(event.target.value)} placeholder="Ví dụ: 12" />
        </div>
        <Button type="submit" variant="brand"><Search /> Mở phân công</Button>
      </form>
      {departureId === null ? (
        <EmptyState icon={<Search className="size-9 text-zinc-300" aria-hidden />} title="Chưa chọn chuyến" message="Nhập mã chuyến để xem và chỉnh phân công." />
      ) : (
        <AssignmentPanel key={departureId} departureId={departureId} canEdit />
      )}
    </Panel>
  );
}
