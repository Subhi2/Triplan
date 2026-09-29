/** "Manjarabad Fort" -> "manjarabad-fort". Non-Latin characters are dropped. */
export function slugify(s: string): string {
  return s
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "") // strip accents: "Mormugão" -> "Mormugao"
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}
