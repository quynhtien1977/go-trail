"use client";

import { useState, type FormEvent } from "react";
import { Bus, Plus, Wrench } from "lucide-react";
import type { SeatDto, VehicleDto } from "@/schemas/fleet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatVnd } from "@/lib/catalog-client";
import { errorMessage, fleetApi, formatVietnamDate, type SeatInput, type VehicleStatus } from "@/lib/staff-ops-client";
import { cn } from "@/lib/utils";
import {
  Drawer, EmptyState, Notice, Pager, Panel, Pill, RefreshButton, ResourceView, SectionHeader, SelectField,
  TextAreaField, useResource, vehicleStatusLabel, type NoticeValue,
} from "./shared";

const PAGE_SIZE = 10;
const statusFilters: { value: "" | VehicleStatus; label: string }[] = [
  { value: "", label: "Tất cả trạng thái" },
  { value: "Ready", label: "Sẵn sàng" },
  { value: "Maintenance", label: "Bảo dưỡng" },
  { value: "Inactive", label: "Ngừng hoạt động" },
];

export function FleetManager() {
  const [status, setStatus] = useState<"" | VehicleStatus>("");
  const [page, setPage] = useState(1);
  const [creating, setCreating] = useState(false);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [notice, setNotice] = useState<NoticeValue>(null);
  const vehicles = useResource(`vehicles:${status}:${page}`, () =>
    fleetApi.list({ page, pageSize: PAGE_SIZE, status: status || undefined }));

  return (
    <Panel className="space-y-5">
      <SectionHeader
        title="Đội xe & sơ đồ ghế"
        description="Quản lý xe bus, sơ đồ ghế và lịch bảo dưỡng. Xe đang bảo dưỡng hoặc ngừng hoạt động không thể phân công cho chuyến."
        actions={<>
          <RefreshButton onClick={vehicles.reload} loading={vehicles.loading} label="Làm mới danh sách xe" />
          <Button type="button" variant="brand" onClick={() => setCreating(true)}><Plus /> Thêm xe</Button>
        </>}
      />
      <Notice notice={notice} onClose={() => setNotice(null)} />
      <div className="max-w-xs">
        <SelectField id="vehicle-status-filter" label="Lọc theo trạng thái" value={status}
          onChange={(value) => { setStatus(value as "" | VehicleStatus); setPage(1); }} options={statusFilters} />
      </div>

      <ResourceView resource={vehicles} loadingLabel="Đang tải danh sách xe..." errorTitle="Không thể tải danh sách xe"
        isEmpty={(data) => data.items.length === 0}
        empty={<EmptyState icon={<Bus className="size-10 text-zinc-300" aria-hidden />}
          title={status ? "Không có xe ở trạng thái này" : "Chưa có xe nào"}
          message={status ? "Thử chọn trạng thái khác." : "Thêm xe đầu tiên kèm sơ đồ ghế để bắt đầu phân công chuyến."}
          action={!status && <Button type="button" variant="brand" size="sm" onClick={() => setCreating(true)}><Plus /> Thêm xe</Button>} />}>
        {(data) => (
          <>
            <ul className="divide-y divide-zinc-200 overflow-hidden rounded-2xl border border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
              {data.items.map((vehicle) => {
                const badge = vehicleStatusLabel[vehicle.status];
                return (
                  <li key={vehicle.vehicle_id} className="flex flex-col gap-3 p-3 sm:flex-row sm:items-center sm:justify-between sm:p-4">
                    <div className="min-w-0 space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono text-sm font-black text-zinc-950 dark:text-white">{vehicle.plate_number}</span>
                        <Pill color={badge.color}>{badge.label}</Pill>
                      </div>
                      <p className="text-xs text-zinc-500 dark:text-zinc-400">
                        #{vehicle.vehicle_id} · {vehicle.vehicle_type} · {vehicle.seat_count} ghế hoạt động
                      </p>
                    </div>
                    <Button type="button" variant="outline" size="sm" onClick={() => setSelectedId(vehicle.vehicle_id)}>
                      Chi tiết & sơ đồ ghế
                    </Button>
                  </li>
                );
              })}
            </ul>
            <Pager page={data.pagination.page} totalPages={data.pagination.totalPages} totalItems={data.pagination.totalItems}
              onChange={setPage} disabled={vehicles.loading} />
          </>
        )}
      </ResourceView>

      <CreateVehicleDrawer open={creating} onClose={() => setCreating(false)} onCreated={(vehicle) => {
        setCreating(false);
        setNotice({ type: "success", text: `Đã thêm xe ${vehicle.plate_number} với ${vehicle.seats.length} ghế.` });
        vehicles.reload();
      }} />
      <VehicleDetailDrawer vehicleId={selectedId} onClose={() => setSelectedId(null)} onChanged={vehicles.reload} />
    </Panel>
  );
}

// ---------------------------------------------------------------------------
// Create vehicle with a generated seat grid
// ---------------------------------------------------------------------------
function generateSeats(floors: number, rows: number, columns: number): SeatInput[] {
  const seats: SeatInput[] = [];
  for (let floor = 1; floor <= floors; floor++) {
    const prefix = floor === 1 ? "A" : "B";
    let index = 0;
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < columns; x++) {
        index++;
        seats.push({ seat_name: `${prefix}${String(index).padStart(2, "0")}`, floor_level: floor, x_position: x, y_position: y });
      }
    }
  }
  return seats;
}

function CreateVehicleDrawer({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: (vehicle: VehicleDto) => void }) {
  const [plate, setPlate] = useState("");
  const [type, setType] = useState("");
  const [floors, setFloors] = useState("1");
  const [rows, setRows] = useState("10");
  const [columns, setColumns] = useState("4");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const layout = { floors: Number(floors), rows: Number(rows), columns: Number(columns) };
  const validLayout = layout.floors >= 1 && layout.floors <= 2 && layout.rows >= 1 && layout.rows <= 31
    && layout.columns >= 1 && layout.columns <= 21;
  const seats = validLayout ? generateSeats(layout.floors, layout.rows, layout.columns) : [];
  const tooMany = seats.length > 80;

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!validLayout || tooMany || seats.length === 0) return;
    setBusy(true);
    setError(null);
    try {
      const vehicle = await fleetApi.create({ plate_number: plate.trim(), vehicle_type: type.trim(), seats });
      setPlate(""); setType("");
      onCreated(vehicle);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Drawer open={open} onClose={onClose} title="Thêm xe mới" description="Sơ đồ ghế được sinh tự động theo số tầng, hàng và cột. Có thể sửa từng ghế sau khi tạo.">
      <form onSubmit={submit} className="space-y-4">
        <Notice notice={error ? { type: "error", text: error, hint: "Biển số có thể đã tồn tại, hoặc dữ liệu chưa đúng định dạng." } : null} onClose={() => setError(null)} />
        <Input id="vehicle-plate" label="Biển số" required value={plate} onChange={(event) => setPlate(event.target.value)}
          placeholder="51B-123.45" maxLength={15} helperText="4–15 ký tự gồm chữ, số, dấu chấm hoặc gạch ngang." />
        <Input id="vehicle-type" label="Loại xe" required value={type} onChange={(event) => setType(event.target.value)}
          placeholder="Limousine 29 chỗ" maxLength={50} />
        <div className="grid grid-cols-3 gap-3">
          <SelectField id="vehicle-floors" label="Số tầng" value={floors} onChange={setFloors}
            options={[{ value: "1", label: "1 tầng" }, { value: "2", label: "2 tầng" }]} />
          <Input id="vehicle-rows" label="Số hàng" type="number" min={1} max={31} required value={rows} onChange={(event) => setRows(event.target.value)} />
          <Input id="vehicle-columns" label="Số cột" type="number" min={1} max={21} required value={columns} onChange={(event) => setColumns(event.target.value)} />
        </div>
        <p className={cn("text-xs", tooMany ? "font-semibold text-red-600" : "text-zinc-500")}>
          {tooMany ? `Sơ đồ có ${seats.length} ghế, vượt giới hạn 80 ghế mỗi xe.` : `Sẽ tạo ${seats.length} ghế (${seats[0]?.seat_name ?? "-"} … ${seats.at(-1)?.seat_name ?? "-"}).`}
        </p>
        {validLayout && !tooMany && seats.length > 0 && (
          <SeatGrid seats={seats.map((seat, index) => ({ ...seat, seat_id: index, vehicle_id: 0, is_active: true }))} />
        )}
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="outline" onClick={onClose}>Hủy</Button>
          <Button type="submit" variant="brand" isLoading={busy} disabled={!validLayout || tooMany}>Tạo xe</Button>
        </div>
      </form>
    </Drawer>
  );
}

// ---------------------------------------------------------------------------
// Seat grid: one block per floor, seats placed by x/y position
// ---------------------------------------------------------------------------
function SeatGrid({ seats, onSeatClick, busySeatId }: { seats: SeatDto[]; onSeatClick?: (seat: SeatDto) => void; busySeatId?: number | null }) {
  const floors = [...new Set(seats.map((seat) => seat.floor_level))].sort();
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {floors.map((floor) => {
        const floorSeats = seats.filter((seat) => seat.floor_level === floor);
        const columns = Math.max(...floorSeats.map((seat) => seat.x_position)) + 1;
        return (
          <div key={floor} className="space-y-2 rounded-2xl border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-800 dark:bg-zinc-900">
            <p className="text-[11px] font-bold uppercase text-zinc-500">Tầng {floor} · {floorSeats.length} ghế</p>
            <div className="grid gap-1.5 overflow-x-auto" style={{ gridTemplateColumns: `repeat(${columns}, minmax(2.25rem, 1fr))` }}>
              {floorSeats.map((seat) => {
                const content = <span className="truncate">{seat.seat_name}</span>;
                const className = cn(
                  "flex h-9 items-center justify-center rounded-lg border px-1 text-[11px] font-bold",
                  seat.is_active
                    ? "border-emerald-300 bg-white text-emerald-800 dark:border-emerald-800 dark:bg-zinc-950 dark:text-emerald-300"
                    : "border-dashed border-zinc-300 bg-zinc-100 text-zinc-400 line-through dark:border-zinc-700 dark:bg-zinc-800",
                );
                const style = { gridColumn: seat.x_position + 1, gridRow: seat.y_position + 1 };
                return onSeatClick ? (
                  <button key={seat.seat_id} type="button" style={style} disabled={busySeatId === seat.seat_id}
                    onClick={() => onSeatClick(seat)} className={cn(className, "transition-colors hover:border-[#febb02] disabled:opacity-50")}
                    aria-label={`Ghế ${seat.seat_name}, ${seat.is_active ? "đang dùng — bấm để khóa" : "đã khóa — bấm để mở lại"}`}>
                    {content}
                  </button>
                ) : (
                  <span key={seat.seat_id} style={style} className={className}>{content}</span>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Vehicle detail: info, status, seats and maintenance
// ---------------------------------------------------------------------------
function VehicleDetailDrawer({ vehicleId, onClose, onChanged }: { vehicleId: number | null; onClose: () => void; onChanged: () => void }) {
  const vehicle = useResource(vehicleId === null ? null : `vehicle:${vehicleId}`, () => fleetApi.read(vehicleId!));
  const [notice, setNotice] = useState<NoticeValue>(null);
  const [busy, setBusy] = useState<string | null>(null);

  async function mutate(label: string, action: () => Promise<unknown>, success: string, hint?: string) {
    setBusy(label);
    setNotice(null);
    try {
      await action();
      setNotice({ type: "success", text: success });
      vehicle.reload();
      onChanged();
    } catch (err) {
      setNotice({ type: "error", text: errorMessage(err), hint });
    } finally {
      setBusy(null);
    }
  }

  const close = () => { setNotice(null); onClose(); };

  return (
    <Drawer open={vehicleId !== null} onClose={close} title={vehicle.data ? `Xe ${vehicle.data.plate_number}` : "Chi tiết xe"}
      description="Bấm vào một ghế để khóa hoặc mở lại ghế đó. Không sửa được sơ đồ khi xe đang được phân công cho chuyến chưa kết thúc.">
      <Notice notice={notice} onClose={() => setNotice(null)} />
      <ResourceView resource={vehicle} loadingLabel="Đang tải thông tin xe..." errorTitle="Không thể tải thông tin xe"
        isEmpty={() => false} empty={null}>
        {(data) => (
          <div className="space-y-6">
            <VehicleInfoForm key={`${data.vehicle_id}:${data.plate_number}:${data.vehicle_type}:${data.status}`} vehicle={data} busy={busy}
              onSave={(patch) => mutate("info", () => fleetApi.update(data.vehicle_id, patch), "Đã cập nhật thông tin xe.",
                "Xe đang có chuyến chưa kết thúc thì không thể chuyển sang Bảo dưỡng/Ngừng hoạt động.")}
              onDeactivate={() => {
                if (window.confirm(`Ngừng hoạt động xe ${data.plate_number}? Xe sẽ không thể phân công cho chuyến mới.`)) {
                  void mutate("deactivate", () => fleetApi.deactivate(data.vehicle_id), "Đã chuyển xe sang Ngừng hoạt động.",
                    "Xe đang được phân công cho chuyến chưa kết thúc thì không thể ngừng hoạt động.");
                }
              }} />

            <section className="space-y-3">
              <h4 className="text-sm font-black text-zinc-900 dark:text-white">Sơ đồ ghế ({data.seats.filter((seat) => seat.is_active).length}/{data.seats.length} đang dùng)</h4>
              {data.seats.length ? (
                <SeatGrid seats={data.seats} busySeatId={busy?.startsWith("seat:") ? Number(busy.slice(5)) : null}
                  onSeatClick={(seat) => mutate(`seat:${seat.seat_id}`,
                    () => fleetApi.updateSeat(data.vehicle_id, seat.seat_id, { is_active: !seat.is_active }),
                    `${seat.is_active ? "Đã khóa" : "Đã mở lại"} ghế ${seat.seat_name}.`,
                    "Không đổi được ghế khi xe đang được phân công, hoặc khi đây là ghế hoạt động cuối cùng.")} />
              ) : <EmptyState title="Xe chưa có ghế" message="Thêm ghế bên dưới." />}
              <AddSeatForm busy={busy === "add-seat"} onAdd={(seat) => mutate("add-seat", () => fleetApi.addSeat(data.vehicle_id, seat),
                `Đã thêm ghế ${seat.seat_name}.`, "Tên ghế hoặc vị trí (tầng, cột, hàng) có thể đã bị trùng.")} />
            </section>

            <MaintenanceSection vehicleId={data.vehicle_id} onCreated={() => { vehicle.reload(); onChanged(); }} />
          </div>
        )}
      </ResourceView>
    </Drawer>
  );
}

function VehicleInfoForm({ vehicle, busy, onSave, onDeactivate }: {
  vehicle: VehicleDto; busy: string | null;
  onSave: (patch: { plate_number?: string; vehicle_type?: string; status?: VehicleStatus }) => void; onDeactivate: () => void;
}) {
  const [plate, setPlate] = useState(vehicle.plate_number);
  const [type, setType] = useState(vehicle.vehicle_type);
  const [status, setStatus] = useState<VehicleStatus>(vehicle.status);
  const patch = {
    ...(plate.trim().toUpperCase() !== vehicle.plate_number ? { plate_number: plate.trim() } : {}),
    ...(type.trim() !== vehicle.vehicle_type ? { vehicle_type: type.trim() } : {}),
    ...(status !== vehicle.status ? { status } : {}),
  };
  const dirty = Object.keys(patch).length > 0;

  return (
    <form className="space-y-3" onSubmit={(event) => { event.preventDefault(); if (dirty) onSave(patch); }}>
      <div className="grid gap-3 sm:grid-cols-2">
        <Input id="detail-plate" label="Biển số" required value={plate} onChange={(event) => setPlate(event.target.value)} maxLength={15} />
        <Input id="detail-type" label="Loại xe" required value={type} onChange={(event) => setType(event.target.value)} maxLength={50} />
      </div>
      <SelectField id="detail-status" label="Trạng thái" value={status} onChange={(value) => setStatus(value as VehicleStatus)}
        options={(["Ready", "Maintenance", "Inactive"] as const).map((value) => ({ value, label: vehicleStatusLabel[value].label }))} />
      <div className="flex flex-wrap justify-end gap-2">
        {vehicle.status !== "Inactive" && (
          <Button type="button" variant="outline" size="sm" onClick={onDeactivate} isLoading={busy === "deactivate"}
            className="text-red-600 hover:text-red-700">Ngừng hoạt động</Button>
        )}
        <Button type="submit" size="sm" variant="brand" disabled={!dirty} isLoading={busy === "info"}>Lưu thay đổi</Button>
      </div>
    </form>
  );
}

function AddSeatForm({ busy, onAdd }: { busy: boolean; onAdd: (seat: SeatInput) => void }) {
  const [name, setName] = useState("");
  const [floor, setFloor] = useState("1");
  const [x, setX] = useState("0");
  const [y, setY] = useState("0");
  return (
    <form className="space-y-3 rounded-2xl border border-dashed border-zinc-300 p-3 dark:border-zinc-700"
      onSubmit={(event) => {
        event.preventDefault();
        onAdd({ seat_name: name.trim(), floor_level: Number(floor), x_position: Number(x), y_position: Number(y) });
        setName("");
      }}>
      <p className="text-xs font-bold text-zinc-700 dark:text-zinc-300">Thêm ghế</p>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Input id="seat-name" label="Tên ghế" required maxLength={10} value={name} onChange={(event) => setName(event.target.value)} placeholder="A41" />
        <SelectField id="seat-floor" label="Tầng" value={floor} onChange={setFloor} options={[{ value: "1", label: "1" }, { value: "2", label: "2" }]} />
        <Input id="seat-x" label="Cột (0–20)" type="number" min={0} max={20} required value={x} onChange={(event) => setX(event.target.value)} />
        <Input id="seat-y" label="Hàng (0–30)" type="number" min={0} max={30} required value={y} onChange={(event) => setY(event.target.value)} />
      </div>
      <div className="flex justify-end">
        <Button type="submit" size="sm" variant="outline" isLoading={busy}><Plus /> Thêm ghế</Button>
      </div>
    </form>
  );
}

function MaintenanceSection({ vehicleId, onCreated }: { vehicleId: number; onCreated: () => void }) {
  const [page, setPage] = useState(1);
  const records = useResource(`maintenance:${vehicleId}:${page}`, () => fleetApi.listMaintenance(vehicleId, { page, pageSize: 5 }));
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [description, setDescription] = useState("");
  const [cost, setCost] = useState("0");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<NoticeValue>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setNotice(null);
    try {
      await fleetApi.createMaintenance(vehicleId, { start_date: start, end_date: end, description: description.trim(), cost: cost.trim() });
      setStart(""); setEnd(""); setDescription(""); setCost("0");
      setNotice({ type: "success", text: "Đã ghi lịch bảo dưỡng." });
      records.reload();
      onCreated();
    } catch (err) {
      setNotice({ type: "error", text: errorMessage(err), hint: "Ngày kết thúc phải sau ngày bắt đầu; xe không được có chuyến trong khoảng bảo dưỡng." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="space-y-3">
      <h4 className="flex items-center gap-2 text-sm font-black text-zinc-900 dark:text-white"><Wrench className="size-4" /> Lịch bảo dưỡng</h4>
      <ResourceView resource={records} loadingLabel="Đang tải lịch bảo dưỡng..." errorTitle="Không thể tải lịch bảo dưỡng"
        isEmpty={(data) => data.items.length === 0} empty={<EmptyState title="Chưa có lịch bảo dưỡng" />}>
        {(data) => (
          <>
            <ul className="space-y-2">
              {data.items.map((item) => (
                <li key={item.maintenance_id} className="rounded-xl border border-zinc-200 p-3 text-xs dark:border-zinc-800">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-bold text-zinc-900 dark:text-white">
                      {formatVietnamDate(`${item.start_date}T00:00:00+07:00`, false)} → {formatVietnamDate(`${item.end_date}T00:00:00+07:00`, false)}
                    </span>
                    <span className="font-black">{formatVnd(item.cost)}</span>
                  </div>
                  <p className="mt-1 break-words text-zinc-600 dark:text-zinc-400">{item.description}</p>
                </li>
              ))}
            </ul>
            <Pager page={data.pagination.page} totalPages={data.pagination.totalPages} totalItems={data.pagination.totalItems} onChange={setPage} />
          </>
        )}
      </ResourceView>
      <form onSubmit={submit} className="space-y-3 rounded-2xl border border-dashed border-zinc-300 p-3 dark:border-zinc-700">
        <p className="text-xs font-bold text-zinc-700 dark:text-zinc-300">Ghi lịch bảo dưỡng mới</p>
        <Notice notice={notice} onClose={() => setNotice(null)} />
        <div className="grid gap-3 sm:grid-cols-2">
          <Input id="maint-start" label="Từ ngày" type="date" required value={start} onChange={(event) => setStart(event.target.value)} />
          <Input id="maint-end" label="Đến ngày" type="date" required min={start || undefined} value={end} onChange={(event) => setEnd(event.target.value)} />
        </div>
        <TextAreaField id="maint-description" label="Nội dung" required maxLength={500} value={description} onChange={setDescription} />
        <Input id="maint-cost" label="Chi phí (VND)" inputMode="numeric" pattern="0|[1-9][0-9]{0,13}" required value={cost}
          onChange={(event) => setCost(event.target.value)} helperText="Số nguyên, không dấu chấm phân cách." />
        <div className="flex justify-end">
          <Button type="submit" size="sm" variant="outline" isLoading={busy}><Plus /> Ghi bảo dưỡng</Button>
        </div>
      </form>
    </section>
  );
}
