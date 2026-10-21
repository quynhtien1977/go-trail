import type { Role } from "@/schemas/auth";

export function canAccessRouteGroup(role: string, path: string): boolean {
  const group = path.split("/")[1];
  const groups: Record<string, readonly Role[]> = {
    account: ["Customer", "Admin"], leader: ["Leader", "Admin"],
    staff: ["RouteMgr", "HRMgr", "Admin"], admin: ["Admin"],
  };
  return !groups[group] || groups[group].some((allowed) => allowed === role);
}
