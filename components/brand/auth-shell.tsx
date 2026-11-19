import { Logo } from "@/components/brand/logo";

// Sign-in, 2-step and password pages: the website's purple background with a white card.
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
    <main
      id="main"
      className="brand-surface on-brand flex min-h-screen items-center justify-center px-4 py-12"
    >
      <div className="w-full max-w-md">
        <div className="mb-6 flex flex-col items-center gap-3 text-center">
          <Logo variant="white" height={34} />
          <p className="eyebrow">Client portal</p>
        </div>
        <div className="rounded-[22px] bg-card p-6 text-card-foreground shadow-float sm:p-8">
          <h1 className="text-2xl font-extrabold tracking-tight">{title}</h1>
          {intro && <p className="mt-2 text-sm text-muted-foreground">{intro}</p>}
          <div className="mt-6">{children}</div>
        </div>
      </div>
    </main>
  );
}
