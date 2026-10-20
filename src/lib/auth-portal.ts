import type { Role } from "@/schemas/auth";
import { getSafeAuthCallback } from "./auth-redirect";

export type LoginGate = "customer" | "staff";
const staffRoles: readonly string[] = ["Leader", "RouteMgr", "HRMgr", "Accountant", "Admin"];

export function canLoginAtGate(role: string, gate: LoginGate): boolean {
  return gate === "customer" ? role === "Customer" : gate === "staff" && staffRoles.includes(role);
}

export function getRolePortal(role: Role): string {
  if (role === "Admin") return "/admin";
  if (role === "Leader") return "/leader";
  return role === "Customer" ? "/account" : "/staff";
}

export function getLoginPath(path: string): "/login" | "/staff/login" {
  return /^\/(staff|admin|leader)(\/|$)/.test(path) ? "/staff/login" : "/login";
}

// Allow only known application destinations. API/login/continuation routes cannot be callbacks.
export function getAuthDestination(role: Role, value: string | null, origin: string): string {
  const safe = getSafeAuthCallback(value, origin);
  if (safe) {
    const path = new URL(safe, origin).pathname;
    // Reject encoded paths rather than interpreting them differently from the router.
    if (!path.includes("%") && path !== "/staff/login" && !path.startsWith("/staff/login/")) {
      const groups = role === "Customer" ? ["account", "booking", "checkout", "trips"]
        : role === "Admin" ? ["account", "staff", "leader", "admin"]
        : role === "Leader" ? ["leader"] : ["staff"];
      if (groups.some(group => path === `/${group}` || path.startsWith(`/${group}/`))) return safe;
    }
  }
  return getRolePortal(role);
}
