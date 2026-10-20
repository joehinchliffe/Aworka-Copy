import MobileApp from "@/components/mobile/MobileApp";

// A static shell: all data comes from /api/sync and IndexedDB, so it works offline.
export const dynamic = "force-static";

export default function MobilePage() {
  return <MobileApp />;
}
