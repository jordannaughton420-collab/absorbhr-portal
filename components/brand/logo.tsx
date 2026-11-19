import Image from "next/image";

export const LOGO_PATH = "/brand/absorbhr-logo.png";

// Each file with its pixel size, so the logo keeps its shape at any height.
const LOGOS = {
  purple: { src: LOGO_PATH, width: 1103, height: 200 },
  // The website's white logo, for the purple panels.
  white: { src: "/brand/absorbhr-logo-white.svg", width: 1158.25, height: 185.64 },
} as const;

export function Logo({
  className,
  height = 40,
  variant = "purple",
}: {
  className?: string;
  height?: number;
  variant?: keyof typeof LOGOS;
}) {
  const logo = LOGOS[variant];
  return (
    <Image
      src={logo.src}
      alt="AbsorbHR"
      width={Math.round((height * logo.width) / logo.height)}
      height={height}
      priority
      unoptimized
      className={className}
    />
  );
}
