import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Plus } from "lucide-react";
import { requireContext } from "@/lib/auth/context";
import { createClient } from "@/lib/supabase/server";
import { buttonVariants } from "@/components/ui/button";
import { EmployeeTable } from "./employee-table";

export const metadata: Metadata = { title: "Employees · AbsorbHR Portal" };

export default async function EmployeesPage() {
  const ctx = await requireContext();
  if (!ctx.isHr && ctx.role !== "line_manager") redirect("/dashboard");

  // RLS returns everyone for HR, and only direct reports (plus self) for line managers.
  const supabase = await createClient();
  const [{ data }, { data: directory }] = await Promise.all([
    supabase
      .from("employees")
      .select("id, first_name, last_name, preferred_name, job_title, start_date, status, manager_id, departments(name)")
      .order("last_name"),
    supabase.from("employee_directory").select("id, first_name, preferred_name, last_name"),
  ]);
  const names = new Map((directory ?? []).map((d) => [d.id, `${d.preferred_name || d.first_name} ${d.last_name}`]));

  const rows = (data ?? [])
    .filter((e) => ctx.isHr || e.id !== ctx.employeeId)
    .map((e) => ({
      id: e.id,
      name: `${e.preferred_name || e.first_name} ${e.last_name}`,
      jobTitle: e.job_title ?? "",
      department: e.departments?.name ?? "",
      manager: (e.manager_id && names.get(e.manager_id)) || "",
      startDate: e.start_date,
      status: e.status,
    }));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{ctx.isHr ? "Employees" : "My team"}</h1>
          <p className="text-sm text-muted-foreground">
            {ctx.isHr ? `${rows.length} people` : `${rows.length} direct reports`}
          </p>
        </div>
        {ctx.isHr && (
          <Link href="/employees/new" className={buttonVariants()}>
            <Plus aria-hidden="true" /> Add employee
          </Link>
        )}
      </div>
      <EmployeeTable rows={rows} />
    </div>
  );
}
