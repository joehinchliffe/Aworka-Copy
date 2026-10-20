import { SubNav } from "@/components/Nav";

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <SubNav links={[
        { href: "/reports", label: "Profit and loss" },
        { href: "/reports/activity", label: "Activity" },
        { href: "/reports/valuation", label: "Valuation" },
        { href: "/reports/forecast", label: "Income forecast" },
        { href: "/reports/retention", label: "Retention" },
      ]} />
      <main>{children}</main>
    </>
  );
}
