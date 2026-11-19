import type { ReactNode } from "react";
import Link from "next/link";
import { Logo } from "@/components/logo";

export function AuthFrame({ children }: { children: ReactNode }) {
  return (
    <main className="grid min-h-dvh grid-rows-[auto_1fr] px-6 py-6">
      <Link href="/" className="justify-self-start rounded-md" aria-label="Fareline home">
        <Logo />
      </Link>
      <div className="grid place-items-center py-12">{children}</div>
    </main>
  );
}
