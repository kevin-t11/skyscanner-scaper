import type { ReactNode } from "react";
import Link from "next/link";
import { Logo } from "@/components/logo";

export function AuthFrame({ children }: { children: ReactNode }) {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-8 px-6 py-12">
      <Link href="/" className="rounded-lg" aria-label="Fareline home">
        <Logo large />
      </Link>
      {children}
    </main>
  );
}
