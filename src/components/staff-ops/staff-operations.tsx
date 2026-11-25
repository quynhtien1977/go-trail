"use client";

import { useState } from "react";
import { Bus, CalendarDays, Map as MapIcon, Users } from "lucide-react";
import type { Role } from "@/schemas/auth";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { StaffCatalogManager } from "@/components/catalog/staff-catalog-manager";
import { DepartureManager } from "./departure-manager";
import { FleetManager } from "./fleet-manager";
import { PersonnelManager } from "./personnel-manager";
import { Panel } from "./shared";

type TabId = "departures" | "catalog" | "fleet" | "personnel";

// Tabs follow the server RBAC (PRD 3.2); hiding a tab is only presentation, every API re-checks the role.
const tabs: { id: TabId; label: string; icon: typeof Bus; roles: Role[] }[] = [
  { id: "departures", label: "Chuyến", icon: CalendarDays, roles: ["RouteMgr", "HRMgr", "Admin"] },
  { id: "catalog", label: "Tuyến & điểm đón", icon: MapIcon, roles: ["RouteMgr", "Admin"] },
  { id: "fleet", label: "Đội xe", icon: Bus, roles: ["HRMgr", "Admin"] },
  { id: "personnel", label: "Nhân sự", icon: Users, roles: ["HRMgr", "Admin"] },
];

export function StaffOperations({ actorRole }: { actorRole: Role }) {
  const visible = tabs.filter((tab) => tab.roles.includes(actorRole));
  const [active, setActive] = useState<TabId>(visible[0]?.id ?? "departures");
  if (!visible.length) return null;

  return (
    <Tabs value={active} onValueChange={(value) => setActive(value as TabId)} className="gap-4">
      <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
        <TabsList className="h-auto! w-max gap-1 rounded-2xl bg-zinc-200/70 p-1 dark:bg-zinc-800">
          {visible.map(({ id, label, icon: Icon }) => (
            <TabsTrigger key={id} value={id} className="h-9 rounded-xl px-3 text-xs font-bold sm:text-sm">
              <Icon aria-hidden /> {label}
            </TabsTrigger>
          ))}
        </TabsList>
      </div>
      <TabsContent value="departures"><DepartureManager actorRole={actorRole} /></TabsContent>
      {visible.some((tab) => tab.id === "catalog") && (
        <TabsContent value="catalog"><Panel><StaffCatalogManager actorRole={actorRole} /></Panel></TabsContent>
      )}
      {visible.some((tab) => tab.id === "fleet") && <TabsContent value="fleet"><FleetManager /></TabsContent>}
      {visible.some((tab) => tab.id === "personnel") && <TabsContent value="personnel"><PersonnelManager /></TabsContent>}
    </Tabs>
  );
}
