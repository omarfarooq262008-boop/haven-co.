import { createFileRoute } from "@tanstack/react-router";
import { Why, How, Reviews } from "@/components/site/sections";

export const Route = createFileRoute("/about")({
  head: () => ({ meta: [
    { title: "About Haven & Co. — Local Expertise, Lasting Trust" },
    { name: "description", content: "Get to know Haven & Co., our approach, buying process, and client experiences." },
    { property: "og:title", content: "About Haven & Co. — Local Expertise, Lasting Trust" },
    { property: "og:description", content: "Get to know Haven & Co., our approach, buying process, and client experiences." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary_large_image" },
  ] }),
  component: AboutPage,
});

function AboutPage() { return (<><Why /><How /><Reviews /></>); }
