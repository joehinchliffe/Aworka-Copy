import { MainNav } from "@/components/Nav";
import { requireUser } from "@/lib/session";
import { logoutAction } from "../(auth)/actions";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  return (
    <>
      <header className="topbar">
        <span className="brand">{user.businessName}</span>
        <MainNav />
        <span className="spacer" />
        <span className="user">{user.name}</span>
        <form action={logoutAction}><button className="btn small" style={{ marginLeft: 8 }}>Log out</button></form>
      </header>
      {children}
    </>
  );
}
