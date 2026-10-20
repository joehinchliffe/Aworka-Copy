import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = { title: "Rounds", description: "Run your round: planning, debts, invoicing and bookkeeping." };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-GB">
      <body>{children}</body>
    </html>
  );
}
