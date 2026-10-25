import Image from "next/image";

export const LOGO_PATH = "/brand/absorbhr-logo.svg";

export function Logo({ className, height = 40 }: { className?: string; height?: number }) {
  return (
    <Image
      src={LOGO_PATH}
      alt="AbsorbHR"
      width={Math.round(height * (200 / 48))}
      height={height}
      priority
      unoptimized
      className={className}
    />
  );
}
