import { Suspense } from "react";
import { RunAdvice } from "@/components/run-advice";

export default function Page() {
  return (
    <Suspense
      fallback={
        <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col px-4 py-10">
          <p className="text-sm text-muted-foreground">Preparando el consejo de salida…</p>
        </main>
      }
    >
      <RunAdvice />
    </Suspense>
  );
}
