import { redirect } from "next/navigation";
import Dashboard from "@/components/Dashboard";
import { currentUser } from "@/lib/auth";

export default async function Home() {
  if (!(await currentUser())) redirect("/login");
  return <Dashboard />;
}
