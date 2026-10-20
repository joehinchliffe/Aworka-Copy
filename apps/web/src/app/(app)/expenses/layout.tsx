import { SubNav } from "@/components/Nav";
import { requireUser } from "@/lib/session";

export default async function Layout({ children }: { children: React.ReactNode }) {
  await requireUser("record_expenses");
  return (
    <>
      <SubNav links={[
        { href: "/expenses", label: "Expenses" },
        { href: "/expenses/new", label: "New expense" },
        { href: "/expenses/recurring", label: "Recurring" },
        { href: "/expenses/categories", label: "Categories" },
        { href: "/expenses/suppliers", label: "Suppliers" },
        { href: "/expenses/mileage", label: "Mileage" },
      ]} />
      <main>{children}</main>
    </>
  );
}
