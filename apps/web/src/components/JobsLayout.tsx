import { SubNav } from "@/components/Nav";

/** Same sub-navigation as the customers (Jobs) area, for rounds, tasks, prices and sales sources. */
export function JobsLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <SubNav links={[
        { href: "/customers", label: "Jobs" },
        { href: "/customers/new", label: "New customer" },
        { href: "/rounds", label: "Rounds" },
        { href: "/tasks", label: "Tasks" },
        { href: "/price-revisions", label: "Prices" },
        { href: "/sales-sources", label: "Sales sources" },
        { href: "/map", label: "Map" },
      ]} />
      <main>{children}</main>
    </>
  );
}
