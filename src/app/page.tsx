import { redirect } from "next/navigation";

/** Entry point. Without a session, everyone starts at the welcome screen. */
export default function RootPage() {
  redirect("/welcome");
}
