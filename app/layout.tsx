import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

// next/font downloads Inter at build time and serves it from our own domain,
// so users' browsers never contact Google.
const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "AbsorbHR Portal",
  description: "HR software from AbsorbHR",
  robots: { index: false, follow: false },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en-GB">
      <body className={`${inter.variable} font-sans antialiased`}>
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-primary focus:px-4 focus:py-2 focus:text-primary-foreground"
        >
          Skip to main content
        </a>
        {children}
      </body>
    </html>
  );
}
