import { Logo } from "@/components/brand/logo";
import { DoodleSparkle, DoodleSquiggle } from "@/components/brand/doodle";

export default function Home() {
  return (
    <main id="main" className="flex min-h-screen items-center justify-center bg-accent px-4 py-12">
      <div className="relative w-full max-w-md rounded-xl border bg-card p-8 shadow-sm">
        <DoodleSparkle className="absolute -right-3 -top-3 h-8 w-8 text-primary" />
        <Logo />
        <h1 className="mt-6 text-2xl font-semibold tracking-tight">Welcome to AbsorbHR Portal</h1>
        <DoodleSquiggle className="mt-2 h-4 w-24 text-primary" />
        <p className="mt-4 text-muted-foreground">
          Secure HR software for AbsorbHR clients. Sign-in arrives in Phase 1.
        </p>
      </div>
    </main>
  );
}
