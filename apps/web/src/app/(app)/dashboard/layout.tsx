import { SubNav } from "@/components/Nav";

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <SubNav links={[
        { href: "/dashboard", label: "Dashboard" },
        { href: "/reports", label: "Reports" },
        { href: "/reports/activity", label: "Activity" },
      ]} />
      <main>{children}</main>
    </>
  );
}
