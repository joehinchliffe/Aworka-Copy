import { SubNav } from "@/components/Nav";
export default function Layout({ children }: { children: React.ReactNode }) {
  return (<><SubNav links={[{ href: "/debts", label: "Current debts" }, { href: "/debts/aged", label: "Aged debts" }, { href: "/invoices", label: "Invoices" }]} /><main>{children}</main></>);
}
