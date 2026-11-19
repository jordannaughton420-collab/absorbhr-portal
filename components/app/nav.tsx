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
  CalendarClock,
  Clock,
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
  Sparkles,
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
  assistant: Sparkles,
  rota: CalendarClock,
  shifts: Clock,
};

export type NavItem = { href: string; label: string; icon: keyof typeof ICONS };

export function Nav({ items }: { items: NavItem[] }) {
  const pathname = usePathname();
  // Only the closest match is highlighted, so /leave/approvals lights up "Approvals", not "My leave" too.
  const matches = (href: string) =>
    pathname === href || (href !== "/dashboard" && pathname.startsWith(href + "/"));
  const activeHref = items
    .map((i) => i.href)
    .filter(matches)
    .sort((a, b) => b.length - a.length)[0];
  return (
    <nav aria-label="Main">
      <ul className="space-y-1">
        {items.map((item) => {
          const Icon = ICONS[item.icon];
          const active = item.href === activeHref;
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex items-center gap-3 rounded-full px-3.5 py-2 text-sm font-medium transition-colors",
                  active
                    ? "bg-white font-semibold text-primary shadow-sm"
                    : "text-white/85 hover:bg-white/10 hover:text-white",
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
