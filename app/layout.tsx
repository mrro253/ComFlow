import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "CommissionFlow",
  description:
    "Commission tracking for Medicare and Medicaid insurance agencies.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
