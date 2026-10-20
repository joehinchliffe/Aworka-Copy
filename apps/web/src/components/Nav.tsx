"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

const MAIN = [
  { href: "/dashboard", label: "Home" },
  { href: "/planner", label: "Planner" },
  { href: "/customers", label: "Jobs" },
  { href: "/debts", label: "Debts" },
  { href: "/expenses", label: "Expenses" },
  { href: "/messages", label: "Messages" },
  { href: "/reports", label: "Reports" },
  { href: "/settings", label: "Settings" },
  { href: "/m", label: "Mobile app" },
];

export function MainNav() {
  const path = usePathname();
  return (
    <>
      {MAIN.map((l) => (
        <Link key={l.href} href={l.href} className="nav" aria-current={path.startsWith(l.href) ? "page" : undefined}>{l.label}</Link>
      ))}
    </>
  );
}

export function SubNav({ links }: { links: { href: string; label: string }[] }) {
  const path = usePathname();
  return (
    <nav className="subnav">
      {links.map((l) => (
        <Link key={l.href} href={l.href} aria-current={path === l.href ? "page" : undefined}>{l.label}</Link>
      ))}
    </nav>
  );
}
