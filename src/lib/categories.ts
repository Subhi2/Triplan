/** Display names and map colours for place categories (slugs match the category table). */
const CATEGORIES: Record<string, { name: string; color: string }> = {
  temple: { name: "Temple", color: "#c2410c" },
  heritage: { name: "Heritage", color: "#a16207" },
  fort: { name: "Fort", color: "#7c2d12" },
  viewpoint: { name: "Viewpoint", color: "#7c3aed" },
  waterfall: { name: "Waterfall", color: "#0284c7" },
  trek: { name: "Trek", color: "#15803d" },
  lake: { name: "Lake", color: "#0e7490" },
  beach: { name: "Beach", color: "#ca8a04" },
  food: { name: "Food", color: "#dc2626" },
  coffee: { name: "Coffee", color: "#78350f" },
  fuel: { name: "Fuel", color: "#475569" },
  stay: { name: "Stay", color: "#db2777" },
  town: { name: "Town", color: "#334155" },
};

export function categoryStyle(slug: string): { name: string; color: string } {
  return (
    CATEGORIES[slug] ?? {
      name: slug.charAt(0).toUpperCase() + slug.slice(1).replace(/_/g, " "),
      color: "#64748b",
    }
  );
}
