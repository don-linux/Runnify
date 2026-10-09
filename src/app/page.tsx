import { Suspense } from "react";
import { DayScene } from "@/components/day-scene";
import { RunAdvice } from "@/components/run-advice";

export default function Page() {
  return (
    <Suspense
      fallback={
        <>
          <DayScene period="day" />
          <main className="relative z-10 mx-auto flex w-full max-w-6xl flex-1 flex-col px-4 py-10">
            <p className="text-sm text-muted-foreground">Preparando el consejo de salida…</p>
          </main>
        </>
      }
    >
      <RunAdvice />
    </Suspense>
  );
}
