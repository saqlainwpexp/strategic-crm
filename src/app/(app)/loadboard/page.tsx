import { Suspense } from "react";
import { LoadboardTabs } from "@/components/outreach/LoadboardTabs";

export default function LoadboardPage() {
  return (
    <Suspense>
      <LoadboardTabs />
    </Suspense>
  );
}
