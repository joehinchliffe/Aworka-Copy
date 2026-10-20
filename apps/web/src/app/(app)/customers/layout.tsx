import { SubNav } from "@/components/Nav";

export default function Layout({ children }: { children: React.ReactNode }) {
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
