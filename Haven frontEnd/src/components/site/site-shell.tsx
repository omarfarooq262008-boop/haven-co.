import { Link, useRouterState } from "@tanstack/react-router";
import { useEffect, useState, type ReactNode } from "react";
import { Menu, X, ArrowUpRight } from "lucide-react";
import { Button } from "@/components/ui/button";

const navigation = [
  { label: "Home", to: "/" },
  { label: "Properties", to: "/properties" },
  { label: "About us", to: "/about" },
  { label: "Our agents", to: "/agents" },
] as const;

export function SiteShell({ children }: { children: ReactNode }) {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const home = pathname === "/";
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 40);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  useEffect(() => { setOpen(false); }, [pathname]);
  useEffect(() => {
    const root = document.querySelector("main") ?? document.body;
    // Clean leftover attrs from the broken observer so nothing stays stuck hidden
    root.querySelectorAll(".reveal[data-io]").forEach((el) => el.removeAttribute("data-io"));

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      root.querySelectorAll(".reveal").forEach((el) => el.classList.add("is-visible"));
      return;
    }

    const io = new IntersectionObserver((entries) => {
      for (const e of entries) {
        if (e.isIntersecting) requestAnimationFrame(() => e.target.classList.add("is-visible"));
        else e.target.classList.remove("is-visible");
      }
    }, { threshold: 0.12, rootMargin: "0px 0px -10% 0px" });

    const seen = new WeakSet<Element>();
    const watch = () => {
      root.querySelectorAll(".reveal").forEach((el) => {
        if (seen.has(el)) return;
        seen.add(el);
        io.observe(el);
      });
    };
    watch();
    const mo = new MutationObserver(watch);
    mo.observe(root, { childList: true, subtree: true });
    return () => { io.disconnect(); mo.disconnect(); };
  }, [pathname]);

  return (<div className="bg-background text-foreground">
    <header className={`fixed inset-x-0 top-0 z-50 transition-[background-color,padding] duration-200 ${!home || scrolled || open ? "bg-primary/95 py-4 backdrop-blur" : "py-6"}`}>
      <div className="mx-auto flex max-w-7xl items-center justify-between px-6">
        <Link to="/" className="font-display text-2xl font-bold text-primary-foreground">Haven <span className="text-accent">&</span> Co.</Link>
        <nav aria-label="Main navigation" className="hidden items-center gap-5 md:flex">
          {navigation.map(({ label, to }) => <Button asChild key={to} variant="link" className="px-1 text-primary-foreground/80 hover:text-accent hover:no-underline"><Link to={to} search={{ category: "All", location: "Any location", transaction: "All" }} activeProps={{ className: "text-accent" }} activeOptions={{ exact: true }}>{label}</Link></Button>)}
          <Button asChild className="bg-accent text-accent-foreground hover:bg-accent/90"><Link to="/contact">Get in touch <ArrowUpRight /></Link></Button>
        </nav>
        <Button variant="ghost" size="icon" aria-label={open ? "Close menu" : "Open menu"} aria-expanded={open} aria-controls="mobile-navigation" className="text-primary-foreground md:hidden" onClick={() => setOpen((value) => !value)}>{open ? <X /> : <Menu />}</Button>
      </div>
      {open && <nav id="mobile-navigation" aria-label="Mobile navigation" className="mobile-nav mx-auto mt-4 flex max-w-7xl flex-col gap-2 border-t border-primary-foreground/15 px-6 pt-4 md:hidden">{navigation.map(({ label, to }) => <Button asChild key={to} variant="ghost" className="justify-start text-primary-foreground"><Link to={to} search={{ category: "All", location: "Any location", transaction: "All" }} onClick={() => setOpen(false)}>{label}</Link></Button>)}<Button asChild variant="ghost" className="justify-start text-accent"><Link to="/contact" onClick={() => setOpen(false)}>Contact</Link></Button></nav>}
    </header>
    <main className={home ? "" : "pt-20"} data-page={home ? "home" : undefined}>{children}</main>
    <footer className="bg-primary px-6 pt-12 pb-6">
      <div className="mx-auto flex max-w-7xl flex-col justify-between gap-8 md:flex-row">
        <div><Link to="/" className="font-display text-2xl font-bold text-primary-foreground">Haven <span className="text-accent">&</span> Co.</Link><p className="mt-3 max-w-sm text-sm text-primary-foreground/60">Where every key opens a new chapter.</p></div>
        <nav aria-label="Footer navigation" className="flex flex-wrap items-start gap-5">{navigation.slice(1).map(({label,to}) => <Link key={to} to={to} search={{ category: "All", location: "Any location", transaction: "All" }} className="text-sm text-primary-foreground/70 hover:text-accent">{label}</Link>)}<Link to="/contact" className="text-sm text-primary-foreground/70 hover:text-accent">Contact</Link></nav>
      </div>
      <p className="mx-auto mt-10 max-w-7xl border-t border-primary-foreground/10 pt-5 text-xs text-primary-foreground/40">© {new Date().getFullYear()} Haven & Co. All rights reserved.</p>
    </footer>
  </div>);
}