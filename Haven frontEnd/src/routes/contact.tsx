import { createFileRoute } from "@tanstack/react-router";
import { Contact } from "@/components/site/sections";

export const Route = createFileRoute("/contact")({
  head: () => ({ meta: [
    { title: "Contact Haven & Co. — Find Your Next Home" },
    { name: "description", content: "Contact Haven & Co. about buying, renting, selling, or arranging a private property viewing." },
    { property: "og:title", content: "Contact Haven & Co. — Find Your Next Home" },
    { property: "og:description", content: "Contact Haven & Co. about buying, renting, selling, or arranging a private property viewing." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary_large_image" },
  ] }),
  component: ContactPage,
});

function ContactPage() { return (<><Contact /></>); }
