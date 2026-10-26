import { Logo } from "@/components/brand/logo";
import { DoodleSparkle, DoodleSquiggle } from "@/components/brand/doodle";

export function AuthShell({
  title,
  intro,
  children,
}: {
  title: string;
  intro?: string;
  children: React.ReactNode;
}) {
  return (
    <main id="main" className="flex min-h-screen items-center justify-center bg-accent px-4 py-12">
      <div className="relative w-full max-w-md rounded-xl border bg-card p-6 shadow-sm sm:p-8">
        <DoodleSparkle className="absolute -right-3 -top-3 h-8 w-8 text-primary" />
        <Logo />
        <h1 className="mt-6 text-2xl font-semibold tracking-tight">{title}</h1>
        <DoodleSquiggle className="mt-1 h-4 w-20 text-primary" />
        {intro && <p className="mt-3 text-sm text-muted-foreground">{intro}</p>}
        <div className="mt-6">{children}</div>
      </div>
    </main>
  );
}
