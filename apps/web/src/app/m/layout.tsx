import type { Metadata, Viewport } from "next";
import "./mobile.css";

export const metadata: Metadata = {
  title: "Rounds",
  description: "Your round on your phone, online or off.",
  manifest: "/manifest.webmanifest",
  icons: { icon: "/icons/icon.svg", apple: "/icons/icon-192.png" },
  appleWebApp: { capable: true, title: "Rounds", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#0f766e",
};

export default function MobileLayout({ children }: { children: React.ReactNode }) {
  return children;
}
