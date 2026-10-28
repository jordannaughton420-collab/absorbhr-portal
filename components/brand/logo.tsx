import Image from "next/image";

export const LOGO_PATH = "/brand/absorbhr-logo.png";
// Pixel size of the file above, so the logo keeps its shape at any height.
const LOGO_WIDTH = 1103;
const LOGO_HEIGHT = 200;

export function Logo({ className, height = 40 }: { className?: string; height?: number }) {
  return (
    <Image
      src={LOGO_PATH}
      alt="AbsorbHR"
      width={Math.round((height * LOGO_WIDTH) / LOGO_HEIGHT)}
      height={height}
      priority
      unoptimized
      className={className}
    />
  );
}
