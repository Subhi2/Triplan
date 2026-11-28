// Chip colours shared by every chip row (docs/08-design.md, "Chips"), defined once.

/** A picked chip: ink on paper, reversed in dark mode. */
export const chipOn = "bg-stone-900 font-bold text-white dark:bg-stone-100 dark:text-stone-900";

/**
 * A chip not picked: a see-through ink tint, so it reads on white panels and on the page
 * background alike. A solid stone-100 fill matched the page (--background) and the chips on
 * content pages looked like plain text.
 */
export const chipOff =
  "bg-stone-900/[0.07] hover:bg-stone-900/[0.12] dark:bg-white/[0.08] dark:hover:bg-white/[0.14]";
