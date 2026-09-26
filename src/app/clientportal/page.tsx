import { redirect } from "next/navigation";

/** Doorway only. Logged-out visitors are redirected to /clientportal/signin
 * by the proxy before this renders; everyone else lands on the dashboard. */
export default function ClientPortalDoorway() {
  redirect("/clientportal/dashboard");
}
