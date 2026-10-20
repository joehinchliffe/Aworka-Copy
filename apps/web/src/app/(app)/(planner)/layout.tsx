import { SubNav } from "@/components/Nav";

/** Job sheets, events and time off live beside the planner and share its sub-navigation. */
export default function Layout({ children }: { children: React.ReactNode }) {
  return (<><SubNav links={[{ href: "/planner", label: "Planner" }, { href: "/job-sheets", label: "Job sheets" }, { href: "/events", label: "Events" }, { href: "/time-off", label: "Time off" }]} /><main>{children}</main></>);
}
