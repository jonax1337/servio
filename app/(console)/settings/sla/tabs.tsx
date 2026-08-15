"use client";

import type { ReactNode } from "react";
import { Timer, CalendarDays, TrendingUp } from "lucide-react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";

/**
 * Client tab shell for the SLA settings page. The three panels are rendered on
 * the server and passed in as `ReactNode` so all data-loading stays server-side.
 */
export function SlaSettingsTabs({
  slaCount,
  calendarCount,
  policyCount,
  sla,
  calendars,
  escalation,
}: {
  slaCount: number;
  calendarCount: number;
  policyCount: number;
  sla: ReactNode;
  calendars: ReactNode;
  escalation: ReactNode;
}) {
  return (
    <Tabs defaultValue="sla">
      <TabsList>
        <TabsTrigger value="sla">
          <Timer className="size-4" /> SLAs
          <span className="ml-1 rounded-full bg-muted-foreground/15 px-1.5 text-[10px] font-semibold">{slaCount}</span>
        </TabsTrigger>
        <TabsTrigger value="calendars">
          <CalendarDays className="size-4" /> Calendars
          <span className="ml-1 rounded-full bg-muted-foreground/15 px-1.5 text-[10px] font-semibold">{calendarCount}</span>
        </TabsTrigger>
        <TabsTrigger value="escalation">
          <TrendingUp className="size-4" /> Escalation
          <span className="ml-1 rounded-full bg-muted-foreground/15 px-1.5 text-[10px] font-semibold">{policyCount}</span>
        </TabsTrigger>
      </TabsList>

      <TabsContent value="sla" className="pt-4">{sla}</TabsContent>
      <TabsContent value="calendars" className="pt-4">{calendars}</TabsContent>
      <TabsContent value="escalation" className="pt-4">{escalation}</TabsContent>
    </Tabs>
  );
}
