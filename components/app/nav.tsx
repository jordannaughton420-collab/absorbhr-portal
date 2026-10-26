"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BookOpen,
  BarChart3,
  DatabaseZap,
  ShieldAlert,
  Building2,
  CalendarDays,
  ClipboardCheck,
  Plane,
  Thermometer,
  FileClock,
  FilePen,
  Gavel,
  ListChecks,
  Target,
  LayoutDashboard,
  Network,
  Settings,
  ShieldCheck,
  User,
  Users,
} from "lucide-react";
import { cn } from "@/lib/utils";

const ICONS = {
  dashboard: LayoutDashboard,
  profile: User,
  employees: Users,
  org: Network,
  settings: Settings,
  audit: FileClock,
  privacy: ShieldCheck,
  admin: Building2,
  leave: Plane,
  approvals: ClipboardCheck,
  calendar: CalendarDays,
  sickness: Thermometer,
  policies: BookOpen,
  checklists: ListChecks,
  reviews: Target,
  cases: Gavel,
  requests: FilePen,
  reports: BarChart3,
  dataProtection: DatabaseZap,
  breaches: ShieldAlert,
};

export type NavItem = { href: string; label: string; icon: keyof typeof ICONS };

export function Nav({ items }: { items: NavItem[] }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Main">
      <ul className="space-y-1">
        {items.map((item) => {
          const Icon = ICONS[item.icon];
          const active =
            pathname === item.href ||
            (item.href !== "/dashboard" && pathname.startsWith(item.href + "/"));
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium",
                  active ? "bg-primary text-primary-foreground" : "hover:bg-muted",
                )}
              >
                <Icon className="size-4 shrink-0" aria-hidden="true" />
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
