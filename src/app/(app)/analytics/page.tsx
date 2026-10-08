import { redirect } from "next/navigation";

// Analytics now lives in the Dashboard ("Analytics" tab).
export default function AnalyticsPage() {
  redirect("/dashboard?tab=analytics");
}
