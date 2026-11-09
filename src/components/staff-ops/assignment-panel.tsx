"use client";

import { useEffect, useEffectEvent, useState, type FormEvent } from "react";
import { Bus, Plus, Trash2 } from "lucide-react";
import type { AssignmentDto } from "@/schemas/assignment";
import { Button } from "@/components/ui/button";
import { assignmentApi, errorMessage, fleetApi, personnelApi, type CrewRole, type DepartureStatus } from "@/lib/staff-ops-client";
import {
  crewRoleLabel, DepartureStatusPill, EmptyState, Notice, Pill, ResourceView, SelectField, useResource, type NoticeValue,
} from "./shared";

// Mirrors services/assignments.ts so the UI can explain why an action is unavailable.
const crewStatuses: DepartureStatus[] = ["Draft", "Open", "Closed", "Confirmed"];
const vehicleStatuses: DepartureStatus[] = ["Draft", "Open", "Closed"];

export type CrewSummary = { vehicles: number; missingDriver: number; missingAssistant: number; leaders: number; seats: number };

export function summarizeCrew(data: AssignmentDto): CrewSummary {
  const count = (vehicle: AssignmentDto["vehicles"][number], role: CrewRole) => vehicle.staff.filter((item) => item.role_in_trip === role).length;
  return {
    vehicles: data.vehicles.length,
    missingDriver: data.vehicles.filter((vehicle) => count(vehicle, "Driver") === 0).length,
    missingAssistant: data.vehicles.filter((vehicle) => count(vehicle, "Assistant") === 0).length,
    leaders: data.vehicles.reduce((sum, vehicle) => sum + count(vehicle, "Leader"), 0),
    seats: data.vehicles.reduce((sum, vehicle) => sum + vehicle.generated_seats, 0),
  };
}

export function AssignmentPanel({ departureId, canEdit, onChanged }: {
  departureId: number; canEdit: boolean; onChanged?: (data: AssignmentDto) => void;
}) {
  const assignments = useResource(`assignments:${departureId}`, () => assignmentApi.read(departureId));
  const [notice, setNotice] = useState<NoticeValue>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const report = useEffectEvent((data: AssignmentDto) => onChanged?.(data));
  // Let the parent (departure checklist) see the crew as soon as it loads, not only after a change.
  useEffect(() => { if (assignments.data) report(assignments.data); }, [assignments.data]);

  async function mutate(label: string, action: () => Promise<AssignmentDto>, success: string, hint: string) {
    setBusy(label);
    setNotice(null);
    try {
      const data = await action();
      assignments.setData(data);
      setNotice({ type: "success", text: success });
    } catch (err) {
      setNotice({ type: "error", text: errorMessage(err), hint });
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="space-y-3" aria-labelledby={`assignments-${departureId}`}>
      <h4 id={`assignments-${departureId}`} className="text-sm font-black text-zinc-900 dark:text-white">Phân công xe & tổ lái</h4>
      <Notice notice={notice} onClose={() => setNotice(null)} />
      <ResourceView resource={assignments} loadingLabel="Đang tải phân công..." errorTitle="Không thể tải phân công"
        isEmpty={() => false} empty={null}>
        {(data) => {
          const status = data.status as DepartureStatus;
          const crewEditable = canEdit && crewStatuses.includes(status);
          const vehicleEditable = canEdit && vehicleStatuses.includes(status);
          const summary = summarizeCrew(data);
          return (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-600 dark:text-zinc-400">
                <DepartureStatusPill status={status} />
                <span>{summary.vehicles} xe · {summary.seats} ghế chuyến · {summary.leaders} Leader</span>
              </div>
              {!canEdit && (
                <p className="text-xs text-zinc-500">Chỉ Quản lý Nhân sự & Đội xe (HRMgr) hoặc Admin được thay đổi phân công.</p>
              )}
              {canEdit && !crewEditable && (
                <p className="text-xs text-amber-700 dark:text-amber-300">Chuyến đang chạy hoặc đã kết thúc: giữ nguyên xe và tổ lái.</p>
              )}
              {canEdit && crewEditable && !vehicleEditable && (
                <p className="text-xs text-amber-700 dark:text-amber-300">Chuyến đã chốt: không thêm/bỏ xe, chỉ thay người trong tổ lái.</p>
              )}

              {data.vehicles.length === 0 ? (
                <EmptyState icon={<Bus className="size-9 text-zinc-300" aria-hidden />} title="Chưa gán xe nào"
                  message="Chuyến cần ít nhất một xe (đã sinh ghế) trước khi mở bán." />
              ) : (
                <ul className="space-y-3">
                  {data.vehicles.map((vehicle) => (
                    <li key={vehicle.dep_vehicle_id} className="space-y-3 rounded-2xl border border-zinc-200 p-3 dark:border-zinc-800">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="min-w-0">
                          <p className="font-mono text-sm font-black text-zinc-950 dark:text-white">{vehicle.plate_number}</p>
                          <p className="text-xs text-zinc-500">{vehicle.generated_seats}/{vehicle.seat_count} ghế đã sinh cho chuyến</p>
                        </div>
                        {vehicleEditable && (
                          <Button type="button" variant="outline" size="sm" className="text-red-600 hover:text-red-700"
                            disabled={status !== "Draft" && data.vehicles.length <= 1}
                            title={status !== "Draft" && data.vehicles.length <= 1 ? "Chuyến đã mở bán phải giữ ít nhất một xe" : undefined}
                            isLoading={busy === `vehicle:${vehicle.vehicle_id}`}
                            onClick={() => {
                              if (window.confirm(`Bỏ xe ${vehicle.plate_number} khỏi chuyến? Tổ lái của xe cũng được gỡ.`)) {
                                void mutate(`vehicle:${vehicle.vehicle_id}`, () => assignmentApi.unassignVehicle(departureId, vehicle.vehicle_id),
                                  `Đã bỏ xe ${vehicle.plate_number}.`,
                                  "Không bỏ được xe đã có ghế giữ/bán, hoặc xe cuối cùng của chuyến đã mở bán.");
                              }
                            }}>
                            <Trash2 /> Bỏ xe
                          </Button>
                        )}
                      </div>
                      <CrewList vehicle={vehicle} editable={crewEditable} busy={busy}
                        onRemove={(item) => mutate(`staff:${item.dep_staff_id}`, () => assignmentApi.unassignStaff(departureId, item.dep_staff_id),
                          `Đã gỡ ${item.full_name}.`, "Chuyến đã chốt phải luôn đủ tổ lái; dùng \"Thay người\" thay vì gỡ.")} />
                      {crewEditable && (
                        <AddCrewForm vehicle={vehicle} busy={busy === `crew:${vehicle.vehicle_id}`}
                          onSubmit={(input) => mutate(`crew:${vehicle.vehicle_id}`, () => assignmentApi.assignStaff(departureId, { ...input, vehicle_id: vehicle.vehicle_id }),
                            "Đã cập nhật tổ lái.",
                            "Nhân sự phải đang hoạt động, đúng loại, không trùng chuyến khác cùng ngày; tài xế cần GPLX còn hạn; mỗi xe tối đa 1 tài xế.")} />
                      )}
                    </li>
                  ))}
                </ul>
              )}

              {vehicleEditable && (
                <AddVehicleForm assigned={data.vehicles.map((vehicle) => vehicle.vehicle_id)} busy={busy === "add-vehicle"}
                  onSubmit={(vehicleId) => mutate("add-vehicle", () => assignmentApi.assignVehicle(departureId, vehicleId),
                    "Đã gán xe và sinh ghế cho chuyến.", "Xe phải Sẵn sàng, không bảo dưỡng và không chạy chuyến khác cùng ngày.")} />
              )}
            </div>
          );
        }}
      </ResourceView>
    </section>
  );
}

type Vehicle = AssignmentDto["vehicles"][number];
type Crew = Vehicle["staff"][number];

function CrewList({ vehicle, editable, busy, onRemove }: { vehicle: Vehicle; editable: boolean; busy: string | null; onRemove: (item: Crew) => void }) {
  const roles: CrewRole[] = ["Driver", "Assistant", "Leader"];
  return (
    <div className="grid gap-2 sm:grid-cols-3">
      {roles.map((role) => {
        const items = vehicle.staff.filter((item) => item.role_in_trip === role);
        const required = role !== "Leader";
        return (
          <div key={role} className="space-y-1.5 rounded-xl bg-zinc-50 p-2.5 dark:bg-zinc-900">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] font-bold uppercase text-zinc-500">{crewRoleLabel[role]}</span>
              {required && items.length === 0 && <Pill color="amber">Thiếu</Pill>}
            </div>
            {items.length === 0 ? <p className="text-xs text-zinc-400">—</p> : (
              <ul className="space-y-1">
                {items.map((item) => (
                  <li key={item.dep_staff_id} className="flex items-center justify-between gap-2 text-xs font-semibold text-zinc-800 dark:text-zinc-200">
                    <span className="min-w-0 truncate">{item.full_name}</span>
                    {editable && (
                      <Button type="button" variant="ghost" size="icon-xs" aria-label={`Gỡ ${item.full_name}`}
                        isLoading={busy === `staff:${item.dep_staff_id}`} onClick={() => onRemove(item)}>
                        <Trash2 className="text-red-600" />
                      </Button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        );
      })}
    </div>
  );
}

function AddCrewForm({ vehicle, busy, onSubmit }: {
  vehicle: Vehicle; busy: boolean; onSubmit: (input: { staff_id: number; role_in_trip: CrewRole; replace_dep_staff_id?: number }) => void;
}) {
  const [role, setRole] = useState<CrewRole>("Driver");
  const [staffId, setStaffId] = useState("");
  const [replaceId, setReplaceId] = useState("");
  const candidates = useResource(`crew-candidates:${role}`, () => personnelApi.list({ staff_type: role, status: "Active", pageSize: 50 }));
  const sameRole = vehicle.staff.filter((item) => item.role_in_trip === role);
  const taken = new Set(sameRole.map((item) => item.staff_id));
  const options = (candidates.data?.items ?? []).filter((item) => !taken.has(item.staff_id));

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!staffId) return;
    onSubmit({ staff_id: Number(staffId), role_in_trip: role, ...(replaceId ? { replace_dep_staff_id: Number(replaceId) } : {}) });
    setStaffId("");
    setReplaceId("");
  }

  return (
    <form onSubmit={submit} className="space-y-3 rounded-xl border border-dashed border-zinc-300 p-3 dark:border-zinc-700">
      <div className="grid gap-3 sm:grid-cols-3">
        <SelectField id={`crew-role-${vehicle.dep_vehicle_id}`} label="Vai trò" value={role}
          onChange={(value) => { setRole(value as CrewRole); setStaffId(""); setReplaceId(""); }}
          options={(["Driver", "Assistant", "Leader"] as const).map((value) => ({ value, label: crewRoleLabel[value] }))} />
        <SelectField id={`crew-staff-${vehicle.dep_vehicle_id}`} label="Nhân sự" value={staffId} onChange={setStaffId} required
          disabled={candidates.loading && !candidates.data}
          options={[{ value: "", label: candidates.error ? "Lỗi tải" : candidates.data ? (options.length ? "Chọn nhân sự" : "Không còn ai") : "Đang tải..." },
            ...options.map((item) => ({ value: String(item.staff_id), label: `${item.full_name} (#${item.staff_id})` }))]} />
        <SelectField id={`crew-replace-${vehicle.dep_vehicle_id}`} label="Thay người" value={replaceId} onChange={setReplaceId}
          disabled={sameRole.length === 0}
          options={[{ value: "", label: "Không thay" }, ...sameRole.map((item) => ({ value: String(item.dep_staff_id), label: item.full_name }))]} />
      </div>
      {candidates.error && <p className="text-xs text-red-600">{candidates.error}</p>}
      <div className="flex justify-end">
        <Button type="submit" size="sm" variant="outline" disabled={!staffId} isLoading={busy}><Plus /> {replaceId ? "Thay người" : "Thêm vào tổ lái"}</Button>
      </div>
    </form>
  );
}

function AddVehicleForm({ assigned, busy, onSubmit }: { assigned: number[]; busy: boolean; onSubmit: (vehicleId: number) => void }) {
  const [vehicleId, setVehicleId] = useState("");
  const vehicles = useResource("assignable-vehicles", () => fleetApi.list({ status: "Ready", pageSize: 50 }));
  const options = (vehicles.data?.items ?? []).filter((item) => !assigned.includes(item.vehicle_id));
  return (
    <form className="flex flex-col gap-3 rounded-2xl border border-dashed border-zinc-300 p-3 sm:flex-row sm:items-end dark:border-zinc-700"
      onSubmit={(event) => { event.preventDefault(); if (vehicleId) { onSubmit(Number(vehicleId)); setVehicleId(""); } }}>
      <div className="flex-1">
        <SelectField id="assign-vehicle" label="Gán thêm xe" value={vehicleId} onChange={setVehicleId} required
          options={[{ value: "", label: vehicles.error ? "Lỗi tải danh sách xe" : vehicles.data ? (options.length ? "Chọn xe sẵn sàng" : "Không còn xe sẵn sàng") : "Đang tải..." },
            ...options.map((item) => ({ value: String(item.vehicle_id), label: `${item.plate_number} · ${item.vehicle_type} · ${item.seat_count} ghế` }))]} />
      </div>
      <Button type="submit" variant="outline" disabled={!vehicleId} isLoading={busy}><Plus /> Gán xe</Button>
    </form>
  );
}
