import { SubNav } from "@/components/Nav";

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <SubNav links={[
        { href: "/settings", label: "Settings" },
        { href: "/settings/users", label: "Users" },
        { href: "/settings/round-assignments", label: "Round assignments" },
        { href: "/settings/roles", label: "Roles" },
        { href: "/integrations", label: "Payments" },
        { href: "/tax", label: "Tax and MTD" },
        { href: "/settings/api", label: "API" },
        { href: "/subscription", label: "Plan" },
      ]} />
      <main>{children}</main>
    </>
  );
}
