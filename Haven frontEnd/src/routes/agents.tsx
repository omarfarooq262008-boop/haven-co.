import { createFileRoute } from "@tanstack/react-router";
import { Agents } from "@/components/site/sections";

export const Route = createFileRoute("/agents")({
  head: () => ({ meta: [
    { title: "Our Agents — Haven & Co." },
    { name: "description", content: "Meet the Haven & Co. residential, luxury and commercial real estate specialists." },
    { property: "og:title", content: "Our Agents — Haven & Co." },
    { property: "og:description", content: "Meet the Haven & Co. residential, luxury and commercial real estate specialists." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary_large_image" },
  ] }),
  component: AgentsPage,
});

function AgentsPage() { return (<><Agents /></>); }
