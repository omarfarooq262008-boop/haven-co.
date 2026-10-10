import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Search, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import hero from "@/assets/hero.jpg";
import { Listings, listings } from "@/components/site/sections";
import { TypingHeadline } from "@/components/site/typing-headline";
export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Haven & Co. — Find Your Perfect Haven" },
      { name: "description", content: "Discover premium villas, apartments and commercial spaces with Haven & Co., trusted local real estate experts." },
      { property: "og:title", content: "Haven & Co. — Find Your Perfect Haven" },
      { property: "og:description", content: "Premium real estate listings and expert local agents." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: HomePage,
});

function HomePage() {
const navigate = useNavigate();
return (<>
<section className="relative flex min-h-[min(820px,90svh)] items-center overflow-hidden px-6 pt-28 pb-16">
        <img src={hero} alt="Luxury villa with infinity pool at sunset" width={1920} height={1088} className="absolute inset-0 h-full w-full object-cover hero-photo" />
        <div className="absolute inset-0 bg-hero-overlay" />
        <div className="relative mx-auto w-full max-w-7xl">
          <p className="eyebrow reveal m-up mb-6" style={{ transitionDelay: "80ms" }}>Premium Real Estate Agency</p>
          <h1 className="max-w-4xl text-5xl font-extrabold leading-[1.02] text-primary-foreground sm:text-6xl md:text-8xl">
            <TypingHeadline />
          </h1>
          <p className="reveal m-up mt-6 max-w-xl text-lg text-primary-foreground/80" style={{ transitionDelay: "200ms" }}>
            Exceptional homes, curated for the way you live. Discover properties that feel like they were made for you.
          </p>
          <form onSubmit={(e) => { e.preventDefault(); const data = new FormData(e.currentTarget); navigate({ to: "/properties", search: { category: String(data.get("Property Type") || "All"), location: String(data.get("Location") || "Any location"), transaction: String(data.get("Buy or Rent") || "Buy") } }); }}
            className="reveal m-form mt-12 grid max-w-5xl gap-px bg-border shadow-lift md:grid-cols-[1fr_1fr_1fr_auto]" style={{ transitionDelay: "320ms" }}>
            {[
              ["Location", ["Any location", "Beverly Hills", "Manhattan", "Malibu", "Austin", "Chicago", "Seattle"]],
              ["Buy or Rent", ["Buy", "Rent"]],
              ["Property Type", ["Any type", "Apartment", "Villa", "Commercial", "Townhouse"]],
            ].map(([label, opts]) => (
              <label key={label as string} className="flex flex-col bg-card px-6 py-4">
                <span className="text-[11px] font-semibold uppercase tracking-normal text-muted-foreground">{label as string}</span>
                <select name={label as string} className="mt-1 cursor-pointer bg-transparent font-display text-base font-semibold text-primary outline-none">
                  {(opts as string[]).map((o) => <option key={o}>{o}</option>)}
                </select>
              </label>
            ))}
            <Button type="submit" className="flex items-center justify-center gap-2 h-auto rounded-none bg-accent px-10 py-5 font-display font-bold text-accent-foreground transition hover:brightness-110">
              <Search className="h-5 w-5" /> Search
            </Button>
          </form>
        </div>
      </section>
<Listings items={listings.slice(0, 3)} />
<div className="mx-auto -mt-12 mb-20 flex max-w-7xl justify-center px-6"><Button asChild variant="outline" size="lg"><Link to="/properties" search={{ category: "All", location: "Any location", transaction: "All" }}>Explore all properties <ArrowRight /></Link></Button></div>
<section className="bg-primary px-6 py-16"><div className="reveal m-right mx-auto flex max-w-7xl flex-col items-start justify-between gap-8 md:flex-row md:items-center"><div><p className="eyebrow mb-3">Your next chapter</p><h2 className="text-3xl font-bold text-primary-foreground">Let's find your haven together.</h2></div><Button asChild size="lg" className="bg-accent text-accent-foreground hover:bg-accent/90"><Link to="/contact">Get in touch <ArrowRight /></Link></Button></div></section>
</>);
}
