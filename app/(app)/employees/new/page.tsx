import type { Metadata } from "next";
import { requireHr } from "@/lib/auth/context";
import { getLookups } from "@/lib/data/lookups";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmployeeForm } from "../employee-forms";

export const metadata: Metadata = { title: "Add employee · AbsorbHR Portal" };

export default async function NewEmployeePage() {
  await requireHr();
  const lookups = await getLookups();
  return (
    <Card className="max-w-3xl">
      <CardHeader>
        <CardTitle>
          <span className="text-2xl">Add an employee</span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <EmployeeForm {...lookups} />
      </CardContent>
    </Card>
  );
}
