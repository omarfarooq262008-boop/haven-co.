import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { useState, type ReactNode } from "react";
import { z } from "zod";
import {
  Search, BedDouble, Bath, Maximize, MapPin, Home, Award, Smile, Users,
  CalendarCheck, KeyRound, Star, Phone, Mail, Clock, ArrowRight,
} from "lucide-react";
import hero from "@/assets/hero.jpg";
import villa from "@/assets/villa.jpg";
import apartment from "@/assets/apartment.jpg";
import commercial from "@/assets/commercial.jpg";
import rental from "@/assets/rental.jpg";
import agent1 from "@/assets/agent1.jpg";
import agent2 from "@/assets/agent2.jpg";
import agent3 from "@/assets/agent3.jpg";

export function SectionHead({ eyebrow, title, light, motion = "m-up" }: { eyebrow: string; title: string; light?: boolean; motion?: "m-up" | "m-left" | "m-fade" }) {
  return (
    <div className={`reveal ${motion} mb-14 max-w-2xl`}>
      <p className="eyebrow mb-4">{eyebrow}</p>
      <h2 className={`text-4xl font-bold md:text-5xl ${light ? "text-primary-foreground" : "text-primary"}`}>{title}</h2>
      <div className="accent-rule mt-6 h-1 w-16 bg-accent" />
    </div>
  );
}

export function Section({ id, children, className = "" }: { id?: string; children: ReactNode; className?: string }) {
  return (
    <section id={id} className={`px-6 py-20 md:py-24 ${className}`}>
      <div className="mx-auto max-w-7xl">{children}</div>
    </section>
  );
}

export const listings = [
  { img: villa, price: "$2,450,000", title: "Palm Grove Villa", beds: 5, baths: 4, sqft: "4,800", loc: "Beverly Hills" },
  { img: apartment, price: "$1,180,000", title: "Skyline Residence", beds: 3, baths: 2, sqft: "2,100", loc: "Manhattan" },
  { img: hero, price: "$3,900,000", title: "Ocean Crest Estate", beds: 6, baths: 5, sqft: "6,200", loc: "Malibu" },
  { img: rental, price: "$4,200 / mo", title: "Willow Townhouse", beds: 3, baths: 2, sqft: "1,850", loc: "Austin" },
  { img: commercial, price: "$5,750,000", title: "Meridian Office Tower", beds: 0, baths: 8, sqft: "18,000", loc: "Chicago" },
  { img: apartment, price: "$860,000", title: "Harbor View Loft", beds: 2, baths: 2, sqft: "1,400", loc: "Seattle" },
];

const stats = [
  { icon: Home, t: "500+ Properties Sold", d: "A proven record of closing deals across premium markets." },
  { icon: Award, t: "12 Years Experience", d: "Over a decade guiding buyers, sellers and investors." },
  { icon: Smile, t: "98% Client Satisfaction", d: "Our clients return — and refer their friends." },
  { icon: Users, t: "Expert Local Agents", d: "Specialists who know every street and every market shift." },
];

const cats = [
  { img: apartment, l: "Apartments", n: "124 listings" },
  { img: villa, l: "Villas", n: "86 listings" },
  { img: commercial, l: "Commercial", n: "42 listings" },
  { img: rental, l: "Rentals", n: "158 listings" },
];

const steps = [
  { icon: Search, t: "Search Properties", d: "Browse curated listings filtered to your exact needs." },
  { icon: CalendarCheck, t: "Schedule a Viewing", d: "Book a private tour with one of our agents in minutes." },
  { icon: KeyRound, t: "Close the Deal", d: "We negotiate and handle the paperwork — you get the keys." },
];

const agents = [
  { img: agent1, n: "Sophia Bennett", r: "Senior Luxury Advisor" },
  { img: agent2, n: "Daniel Reyes", r: "Residential Specialist" },
  { img: agent3, n: "Imran Malik", r: "Commercial Director" },
];

const reviews = [
  { q: "Haven & Co. found us a home we didn't think existed. Calm, sharp and always one step ahead.", n: "Emily Carter", l: "Malibu, CA" },
  { q: "Professional from first call to closing. They negotiated a price well below asking.", n: "James Whitfield", l: "Chicago, IL" },
  { q: "Renting through them was effortless. Every detail was handled with real care.", n: "Aisha Rahman", l: "Austin, TX" },
];

export function Listings({ items = listings }: { items?: typeof listings }) { return (<Section id="listings">
        <SectionHead eyebrow="Featured Listings" title="Handpicked properties of distinction" />
        <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((p, i) => (
            <article key={p.title} style={{ transitionDelay: `${(i % 3) * 130}ms` }}
              className="reveal m-card lift group bg-card shadow-card">
              <div className="relative aspect-[4/3] overflow-hidden">
                <img src={p.img} alt={p.title} loading="lazy" width={1024} height={768} className="img-a h-full w-full object-cover group-hover:scale-105" />
                <span className="absolute left-4 top-4 flex items-center gap-1 bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground">
                  <MapPin className="h-3.5 w-3.5 text-accent" /> {p.loc}
                </span>
              </div>
              <div className="card-copy p-6">
                <p className="font-display text-2xl font-bold text-primary">{p.price}</p>
                <h3 className="mt-1 text-lg font-medium text-muted-foreground">{p.title}</h3>
                <div className="mt-5 flex gap-5 border-t border-border pt-5 text-sm text-foreground/80">
                  {p.beds > 0 && <span className="flex items-center gap-1.5"><BedDouble className="h-4 w-4 text-accent" />{p.beds} Beds</span>}
                  <span className="flex items-center gap-1.5"><Bath className="h-4 w-4 text-accent" />{p.baths} Baths</span>
                  <span className="flex items-center gap-1.5"><Maximize className="h-4 w-4 text-accent" />{p.sqft} sqft</span>
                </div>
                <Button asChild variant="outline" className="mt-6 flex w-full items-center justify-center gap-2 border-2 border-primary py-3 font-display text-sm font-semibold text-primary transition-colors hover:bg-primary hover:text-primary-foreground">
                  <Link to="/contact">View Details <ArrowRight className="h-4 w-4" /></Link>
                </Button>
              </div>
            </article>
          ))}
        </div>
      </Section>); }

export function Why() { return (<Section className="bg-primary">
        <SectionHead light eyebrow="Why Choose Us" title="Trust built one key at a time" motion="m-left" />
        <div className="grid gap-px bg-primary-foreground/10 sm:grid-cols-2 lg:grid-cols-4">
          {stats.map(({ icon: I, t, d }, i) => (
            <div key={t} style={{ transitionDelay: `${i * 45}ms` }} className="reveal m-left group bg-primary p-8 transition-colors hover:bg-navy-deep">
              <I className="h-10 w-10 text-accent transition-transform duration-300 group-hover:scale-110" strokeWidth={1.5} />
              <h3 className="mt-6 text-2xl font-bold text-primary-foreground">{t}</h3>
              <p className="mt-3 text-primary-foreground/65">{d}</p>
            </div>
          ))}
        </div>
      </Section>); }

export function Categories() { return (<Section id="categories">
        <SectionHead eyebrow="Property Categories" title="Explore by what moves you" motion="m-fade" />
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {cats.map((c, i) => (
            <Link to="/properties" search={{ category: c.l, location: "Any location", transaction: "All" }} key={c.l} style={{ transitionDelay: `${i * 45}ms` }} className="reveal m-scale group relative block aspect-[3/4] overflow-hidden">
              <img src={c.img} alt={c.l} loading="lazy" width={1024} height={768} className="img-b absolute inset-0 h-full w-full object-cover group-hover:scale-110" />
              <div className="absolute inset-0 bg-tile-overlay" />
              <div className="absolute inset-x-0 bottom-0 p-6">
                <p className="text-sm text-accent">{c.n}</p>
                <h3 className="mt-1 flex items-center justify-between text-2xl font-bold text-primary-foreground">
                  {c.l} <ArrowRight className="h-5 w-5 -translate-x-2 opacity-0 transition-all group-hover:translate-x-0 group-hover:opacity-100" />
                </h3>
                <div className="mt-4 h-0.5 w-0 bg-accent transition-all duration-300 group-hover:w-full" />
              </div>
            </Link>
          ))}
        </div>
      </Section>); }

export function How() { return (<Section className="bg-secondary">
        <SectionHead eyebrow="How It Works" title="Three steps to your new address" />
        <div className="grid gap-12 md:grid-cols-3">
          {steps.map(({ icon: I, t, d }, i) => (
            <div key={t} style={{ transitionDelay: `${i * 50}ms` }} className="reveal m-tilt relative">
              <span className="font-display text-8xl font-extrabold text-primary/10">0{i + 1}</span>
              <div className="-mt-10 flex h-16 w-16 items-center justify-center bg-primary">
                <I className="h-7 w-7 text-accent" />
              </div>
              <h3 className="mt-6 text-2xl font-bold text-primary">{t}</h3>
              <p className="mt-2 text-muted-foreground">{d}</p>
            </div>
          ))}
        </div>
      </Section>); }

export function Agents() { return (<Section id="agents">
        <SectionHead eyebrow="Meet the Agents" title="The people behind every perfect match" motion="m-left" />
        <div className="grid gap-8 md:grid-cols-3">
          {agents.map((a, i) => (
            <div key={a.n} style={{ transitionDelay: `${i * 130}ms` }} className="reveal m-card lift group bg-card shadow-card">
              <div className="aspect-[4/5] overflow-hidden">
                <img src={a.img} alt={a.n} loading="lazy" width={768} height={960} className="img-c h-full w-full object-cover group-hover:scale-105" />
              </div>
              <div className="p-6">
                <h3 className="text-xl font-bold text-primary">{a.n}</h3>
                <p className="text-sm text-accent">{a.r}</p>
                <Link to="/contact" className="mt-5 flex items-center justify-center gap-2 bg-primary py-3 font-display text-sm font-semibold text-primary-foreground transition hover:bg-navy-deep">
                  <Phone className="h-4 w-4 text-accent" /> Contact Agent
                </Link>
              </div>
            </div>
          ))}
        </div>
      </Section>); }

export function Reviews() { return (<Section id="reviews" className="bg-navy-deep">
        <SectionHead light eyebrow="Testimonials" title="Words from our clients" motion="m-fade" />
        <div className="grid gap-8 md:grid-cols-3">
          {reviews.map((r, i) => (
            <figure key={r.n} style={{ transitionDelay: `${i * 45}ms` }} className="reveal m-right border border-primary-foreground/10 p-8 transition-colors hover:border-accent">
              <div className="flex gap-1">{Array.from({ length: 5 }).map((_, k) => <Star key={k} className="h-4 w-4 fill-accent text-accent" />)}</div>
              <blockquote className="mt-6 text-lg leading-relaxed text-primary-foreground/90">“{r.q}”</blockquote>
              <figcaption className="mt-8 border-t border-primary-foreground/10 pt-5">
                <p className="font-display font-semibold text-primary-foreground">{r.n}</p>
                <p className="text-sm text-primary-foreground/50">{r.l}</p>
              </figcaption>
            </figure>
          ))}
        </div>
      </Section>); }
const schema = z.object({
  name: z.string().trim().min(1, "Please enter your name").max(100),
  email: z.string().trim().email("Enter a valid email").max(255),
  phone: z.string().trim().max(30).regex(/^[0-9+()\-\s]*$/, "Enter a valid phone number"),
  message: z.string().trim().min(1, "Please write a message").max(1000),
});

export function Contact() {
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [sent, setSent] = useState(false);
  const field = "w-full border border-input bg-card px-4 py-3.5 outline-none transition focus:border-accent";

  return (
    <Section id="contact">
      <div className="grid gap-16 lg:grid-cols-2">
        <div>
          <SectionHead eyebrow="Contact" title="Let's find your haven together" motion="m-left" />
          <div className="reveal m-left space-y-6" style={{ transitionDelay: "40ms" }}>
            {[
              [Phone, "Call us", "+1 (310) 555-0142"],
              [Mail, "Email", "hello@havenandco.com"],
              [MapPin, "Office", "820 Sunset Blvd, Los Angeles, CA"],
              [Clock, "Hours", "Mon – Sat, 9am – 7pm"],
            ].map(([I, l, v]) => {
              const Icon = I as typeof Phone;
              return (
                <div key={l as string} className="flex items-center gap-5">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center bg-primary"><Icon className="h-5 w-5 text-accent" /></div>
                  <div><p className="text-sm text-muted-foreground">{l as string}</p><p className="font-display font-semibold text-primary">{v as string}</p></div>
                </div>
              );
            })}
          </div>
        </div>
        <form noValidate className="reveal m-right space-y-5 bg-secondary p-8 md:p-10"
          onSubmit={(e) => {
            e.preventDefault();
            const fd = Object.fromEntries(new FormData(e.currentTarget));
            const r = schema.safeParse(fd);
            if (!r.success) {
              setErrors(Object.fromEntries(r.error.issues.map((i) => [String(i.path[0]), i.message])));
              return;
            }
            setErrors({}); setSent(true); e.currentTarget.reset();
          }}>
          {sent && <p className="bg-primary p-4 text-primary-foreground">Thank you — an agent will be in touch shortly.</p>}
          {[
            ["name", "Full name", "text"], ["email", "Email address", "email"], ["phone", "Phone number", "tel"],
          ].map(([n = "", p, t]) => (
            <div key={n}>
              <input name={n} type={t} placeholder={p} maxLength={255} className={field} />
              {errors[n] && <p className="mt-1 text-sm text-destructive">{errors[n]}</p>}
            </div>
          ))}
          <div>
            <textarea name="message" rows={5} placeholder="Tell us what you're looking for" maxLength={1000} className={field} />
            {errors["message"] && <p className="mt-1 text-sm text-destructive">{errors["message"]}</p>}
          </div>
          <Button type="submit" className="flex w-full items-center justify-center gap-2 h-auto bg-primary py-4 font-display font-bold text-primary-foreground transition hover:bg-navy-deep">
            Send Inquiry <ArrowRight className="h-4 w-4 text-accent" />
          </Button>
        </form>
      </div>
    </Section>
  );
}
