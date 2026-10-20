import { SubNav } from "@/components/Nav";

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <SubNav links={[
        { href: "/settings", label: "Settings" },
        { href: "/settings/users", label: "Users" },
        { href: "/settings/round-assignments", label: "Round assignments" },
        { href: "/settings/roles", label: "Roles" },
      ]} />
      <main>{children}</main>
    </>
  );
}
