import { redirect } from "next/navigation";

// Sales now lives in the Dashboard ("Sales & Activity" tab).
export default function SalesPage() {
  redirect("/dashboard?tab=sales");
}
