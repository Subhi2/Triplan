import { Suspense } from "react";
import { Planner } from "@/components/trip/Planner";

export default function HomePage() {
  // useSearchParams in Planner needs a Suspense boundary.
  return (
    <Suspense>
      <Planner />
    </Suspense>
  );
}
