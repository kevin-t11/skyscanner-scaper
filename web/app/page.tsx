import { ButtonLink } from "@/components/motion/button/base";
import { BouncyAccordion } from "@/components/motion/bouncy-accordion";
import { HeroPreview } from "@/components/landing/hero-preview";
import { SiteHeader } from "@/components/site-header";
import { ArrowRightIcon } from "@/components/icons";

const STEPS = [
  {
    title: "Choose a route",
    body: "Type a city or airport. Suggestions come from Skyscanner, so a city code like NYCA covers all of its airports.",
  },
  {
    title: "Search runs in a real browser",
    body: "A warm Chrome session asks Skyscanner for live fares and keeps collecting until the list stops growing, usually in 3 to 7 seconds.",
  },
  {
    title: "Compare and book",
    body: "Sort by best, cheapest or fastest, open any itinerary for its legs and agents, and book on Skyscanner.",
  },
];

const FAQ = [
  {
    id: "prices",
    title: "Where do the prices come from",
    description: "From Skyscanner's own search, at the moment you search. Fareline does not store or resell fares.",
  },
  {
    id: "time",
    title: "Why does a search take a few seconds",
    description: "Skyscanner collects prices from airlines and agents while you wait. Fareline returns as soon as no new flights arrive.",
  },
  {
    id: "return",
    title: "Can I search return trips",
    description: "Yes. Pick a return date and each result shows both legs with one total price.",
  },
  {
    id: "affiliation",
    title: "Is this Skyscanner",
    description: "No. Fareline is an independent tool that reads Skyscanner's public search results. Bookings happen on Skyscanner.",
  },
];

export default function Home() {
  return (
    <>
      <SiteHeader />
      <main>
        <section className="mx-auto grid max-w-6xl items-center gap-12 px-6 pt-16 pb-24 lg:min-h-[calc(100dvh-3.5rem)] lg:grid-cols-[5fr_6fr] lg:py-16">
          <div className="rise-in max-w-md">
            <h1 className="text-4xl leading-[1.1] font-medium tracking-tight text-balance sm:text-5xl">
              Live Skyscanner fares, sorted the way you choose
            </h1>
            <p className="mt-5 text-base leading-relaxed text-muted-foreground">
              Pick two airports and a date. Fareline searches Skyscanner in a real browser and returns every itinerary,
              sorted by best, cheapest or fastest.
            </p>
            <div className="mt-8 flex items-center gap-3">
              <ButtonLink href="/search" size="lg">
                Search flights
                <ArrowRightIcon className="size-4" />
              </ButtonLink>
              <a href="#how-it-works" className="rounded-md px-3 py-2 text-sm text-muted-foreground transition-colors hover:text-foreground">
                How it works
              </a>
            </div>
          </div>
          <div className="rise-in [--i:2]">
            <HeroPreview />
          </div>
        </section>

        <section id="how-it-works" className="scroll-mt-14 border-t border-border">
          <div className="mx-auto max-w-5xl px-6 py-24 text-center">
            <h2 className="text-2xl font-medium tracking-tight">How it works</h2>
            <ol className="mt-12 grid gap-10 sm:grid-cols-3 sm:gap-8">
              {STEPS.map((step, index) => (
                <li key={step.title}>
                  <span className="font-mono text-sm text-muted-foreground tabular-nums">0{index + 1}</span>
                  <h3 className="mt-3 text-base font-medium">{step.title}</h3>
                  <p className="mx-auto mt-1.5 max-w-xs text-sm leading-relaxed text-pretty text-muted-foreground">{step.body}</p>
                </li>
              ))}
            </ol>
            <h2 className="mt-24 text-2xl font-medium tracking-tight">Questions</h2>
            <BouncyAccordion items={FAQ} defaultValue="prices" className="mx-auto mt-10 max-w-2xl text-left" />
          </div>
        </section>
      </main>
      <footer className="border-t border-border">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-8 text-xs text-muted-foreground">
          <span>Fareline</span>
          <span>Not affiliated with Skyscanner</span>
        </div>
      </footer>
    </>
  );
}
