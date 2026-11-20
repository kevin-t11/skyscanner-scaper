"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { Show, UserButton } from "@clerk/nextjs";
import { ButtonLink } from "@/components/motion/button/base";
import { SharedLayoutBg } from "@/components/motion/shared-layout-bg";
import { ThemeToggle } from "@/components/motion/theme-toggle";
import { Logo } from "@/components/logo";

export function SiteHeader({ children }: { children?: ReactNode }) {
  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/85 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-6xl items-center gap-4 px-6">
        <Link href="/" className="rounded-md" aria-label="Fareline home">
          <Logo />
        </Link>
        {children}
        <nav aria-label="Main" className="ml-auto hidden sm:block">
          <SharedLayoutBg className="w-auto flex-row items-center" inset={0} pillClassName="rounded-md bg-muted">
            <Link href="/#how-it-works" className="rounded-md px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground">
              How it works
            </Link>
            <Link href="/search" className="rounded-md px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground">
              Search
            </Link>
          </SharedLayoutBg>
        </nav>
        <div className="ml-auto flex items-center gap-2 sm:ml-0">
          <ThemeToggle variant="circle" aria-label="Toggle theme" className="size-8 rounded-md text-muted-foreground transition-colors hover:text-foreground" iconClassName="size-4" />
          <Show when="signed-out">
            <Link href="/sign-in" className="rounded-md px-2 py-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground">
              Log in
            </Link>
            <ButtonLink href="/sign-up" size="sm">
              Sign up
            </ButtonLink>
          </Show>
          <Show when="signed-in">
            <UserButton />
          </Show>
        </div>
      </div>
    </header>
  );
}
