import { SubNav } from "@/components/Nav";

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <SubNav links={[
        { href: "/messages", label: "History" },
        { href: "/messages/drafts", label: "Drafts" },
        { href: "/messages/templates", label: "Templates" },
      ]} />
      <main>{children}</main>
    </>
  );
}
