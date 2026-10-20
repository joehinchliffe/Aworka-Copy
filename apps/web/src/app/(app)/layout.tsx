import Link from "next/link";
import { headers } from "next/headers";
import { MainNav } from "@/components/Nav";
import { accountFor } from "@/lib/lookups";
import { isActive, trialDaysLeft } from "@/lib/plans";
import { todayIso } from "@/lib/time";
import { requireUser } from "@/lib/session";
import { logoutAction } from "../(auth)/actions";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const account = await accountFor(user.accountId);
  const today = todayIso();
  const path = (await headers()).get("x-pathname") ?? "";
  const active = account ? isActive(account, today) : false;
  const days = account ? trialDaysLeft(account, today) : 0;
  return (
    <>
      <header className="topbar">
        <span className="brand">{user.businessName}</span>
        <MainNav />
        <span className="spacer" />
        <span className="user">{user.name}</span>
        <form action={logoutAction}><button className="btn small" style={{ marginLeft: 8 }}>Log out</button></form>
      </header>
      {account?.plan === "trial" && days > 0 && days <= 14 && (
        <div className="notice ok no-print" style={{ margin: 0, borderRadius: 0 }}>Free trial: {days} days left. <Link href="/subscription">Choose a plan</Link></div>
      )}
      {active || path.startsWith("/subscription") ? children : (
        <main><div className="panel"><h1>Your trial has ended</h1><p>Your data is safe. Choose a plan to carry on using the app.</p><Link className="btn primary" href="/subscription">See plans</Link></div></main>
      )}
    </>
  );
}
