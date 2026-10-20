import { SubNav } from "@/components/Nav";

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <SubNav links={[
        { href: "/integrations", label: "Online payments" },
        { href: "/integrations/stripe", label: "Card payments" },
        { href: "/integrations/gocardless", label: "Direct Debit" },
        { href: "/integrations/email", label: "Email sending" },
      ]} />
      <main>{children}</main>
    </>
  );
}
