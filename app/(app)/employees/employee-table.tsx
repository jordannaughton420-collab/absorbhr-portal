"use client";

import * as React from "react";
import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/feedback";
import { Input, Label } from "@/components/ui/form";
import { Table, Td, Th } from "@/components/ui/table";
import { formatDate } from "@/lib/format";

type Row = {
  id: string;
  name: string;
  jobTitle: string;
  department: string;
  manager: string;
  startDate: string;
  status: "pre_start" | "active" | "leaver";
};

const STATUS: Record<Row["status"], { label: string; variant: "success" | "muted" | "warning" }> = {
  active: { label: "Active", variant: "success" },
  pre_start: { label: "Starting soon", variant: "warning" },
  leaver: { label: "Leaver", variant: "muted" },
};

// Filtering happens in the browser so names never appear in URLs or server logs.
export function EmployeeTable({ rows }: { rows: Row[] }) {
  const [query, setQuery] = React.useState("");
  const [showLeavers, setShowLeavers] = React.useState(false);
  const q = query.trim().toLowerCase();
  const visible = rows.filter(
    (r) =>
      (showLeavers || r.status !== "leaver") &&
      (!q || [r.name, r.jobTitle, r.department].some((s) => s.toLowerCase().includes(q))),
  );

  return (
    <Card className="p-4">
      <div className="mb-4 flex flex-wrap items-end gap-4">
        <div className="w-full max-w-xs space-y-1.5">
          <Label htmlFor="employee-search">Search</Label>
          <Input
            id="employee-search"
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Name, job title or department"
            autoComplete="off"
          />
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={showLeavers}
            onChange={(e) => setShowLeavers(e.target.checked)}
            className="size-4 accent-primary"
          />
          Show leavers
        </label>
      </div>
      <p className="sr-only" aria-live="polite">
        {visible.length} results
      </p>
      <Table>
        <thead>
          <tr>
            <Th>Name</Th>
            <Th>Job title</Th>
            <Th className="hidden md:table-cell">Department</Th>
            <Th className="hidden lg:table-cell">Manager</Th>
            <Th className="hidden sm:table-cell">Start date</Th>
            <Th>Status</Th>
          </tr>
        </thead>
        <tbody>
          {visible.map((r) => (
            <tr key={r.id} className="hover:bg-muted/50">
              <Td>
                <Link
                  href={`/employees/${r.id}`}
                  className="font-medium text-primary underline-offset-4 hover:underline"
                >
                  {r.name}
                </Link>
              </Td>
              <Td>{r.jobTitle}</Td>
              <Td className="hidden md:table-cell">{r.department}</Td>
              <Td className="hidden lg:table-cell">{r.manager}</Td>
              <Td className="hidden sm:table-cell">{formatDate(r.startDate)}</Td>
              <Td>
                <Badge variant={STATUS[r.status].variant}>{STATUS[r.status].label}</Badge>
              </Td>
            </tr>
          ))}
          {visible.length === 0 && (
            <tr>
              <Td colSpan={6} className="py-8 text-center text-muted-foreground">
                No matching people.
              </Td>
            </tr>
          )}
        </tbody>
      </Table>
    </Card>
  );
}
