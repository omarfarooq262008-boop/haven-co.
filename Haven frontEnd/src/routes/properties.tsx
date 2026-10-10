import { createFileRoute, Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Listings, Categories, listings } from "@/components/site/sections";

export const Route = createFileRoute("/properties")({
  validateSearch: (search: Record<string, unknown>) => ({
    category: typeof search["category"] === "string" ? search["category"] : "All",
    location: typeof search["location"] === "string" ? search["location"] : "Any location",
    transaction: typeof search["transaction"] === "string" ? search["transaction"] : "All",
  }),
  head: () => ({ meta: [
    { title: "Properties for Sale & Rent — Haven & Co." },
    { name: "description", content: "Explore Haven & Co. apartments, villas, rentals and commercial properties by location and category." },
    { property: "og:title", content: "Properties for Sale & Rent — Haven & Co." },
    { property: "og:description", content: "Browse curated homes and commercial spaces for sale or rent." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary_large_image" },
  ] }),
  component: PropertiesPage,
});

function PropertiesPage() {
  const search = Route.useSearch();
  const category = search.category.replace(/s$/, "");
  const items = listings.filter((property) => {
    const rental = property.price.includes("/ mo");
    const matchesCategory = ["All", "Any type"].includes(search.category)
      || (category === "Rental" && rental)
      || (category === "Apartment" && ["Skyline Residence", "Harbor View Loft"].includes(property.title))
      || (category === "Villa" && ["Palm Grove Villa", "Ocean Crest Estate"].includes(property.title))
      || (category === "Commercial" && property.beds === 0)
      || (category === "Townhouse" && property.title === "Willow Townhouse");
    return matchesCategory
      && (search.location === "Any location" || property.loc === search.location)
      && (search.transaction === "All" || (search.transaction === "Rent" ? rental : !rental));
  });

  return (<>
    <div className="reveal m-fade mx-auto max-w-7xl px-6 pt-14">
      <nav aria-label="Property categories" className="flex flex-wrap gap-2">
        {["All", "Apartments", "Villas", "Commercial", "Rentals"].map((value) => <Button key={value} asChild variant={search.category === value ? "default" : "outline"}><Link to="/properties" search={{ category: value, location: "Any location", transaction: "All" }}>{value === "All" ? "All properties" : value}</Link></Button>)}
      </nav>
      {(search.location !== "Any location" || search.transaction !== "All") && <div className="mt-5 flex flex-wrap items-center gap-4 text-sm text-muted-foreground"><p>{search.location} · {search.transaction}</p><Button asChild variant="link"><Link to="/properties" search={{ category: "All", location: "Any location", transaction: "All" }}>Clear filters</Link></Button></div>}
    </div>
    <Listings items={items} />
    {items.length === 0 && <div className="mx-auto -mt-12 mb-20 max-w-7xl px-6"><p className="text-xl font-medium text-primary">No properties match this selection.</p><Button asChild variant="link" className="mt-3 px-0"><Link to="/properties" search={{ category: "All", location: "Any location", transaction: "All" }}>View all properties</Link></Button></div>}
    <Categories />
  </>);
}