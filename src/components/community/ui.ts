// Classes shared by the community screens (docs/08-design.md: buttons, chips, fields), so clubs and
// group rides look like the rest of the app. 44 px targets and 16 px inputs below 768 px.

export const primaryButton =
  "bg-brand hover:bg-brand-dark inline-flex min-h-12 items-center justify-center rounded-xl px-4 text-base font-bold text-white disabled:cursor-not-allowed disabled:opacity-50 md:min-h-10 md:text-sm";
export const secondaryButton =
  "inline-flex min-h-11 items-center justify-center rounded-xl border border-stone-300 bg-(--surface) px-3 text-sm font-bold hover:border-stone-500 disabled:opacity-50 md:min-h-9 dark:border-stone-600";
export const softButton =
  "bg-brand-tint text-brand-dark inline-flex min-h-11 items-center justify-center rounded-xl px-3 text-sm font-bold disabled:opacity-50 md:min-h-9 dark:bg-teal-950 dark:text-teal-200";
export const dangerButton =
  "text-ghat-dark inline-flex min-h-11 items-center justify-center rounded-xl border border-orange-200 px-3 text-sm font-bold hover:border-orange-400 disabled:opacity-50 md:min-h-9 dark:border-orange-900 dark:text-orange-300";
export const linkButton =
  "text-brand-dark inline-flex min-h-11 items-center font-bold hover:underline md:min-h-0 dark:text-teal-300";

export const chip =
  "inline-flex min-h-11 shrink-0 items-center rounded-full px-3.5 text-sm whitespace-nowrap md:min-h-9";
export const chipOn = "bg-stone-900 font-bold text-white dark:bg-stone-100 dark:text-stone-900";
export const chipOff = "bg-stone-100 hover:bg-stone-200 dark:bg-stone-800 dark:hover:bg-stone-700";

export const field =
  "min-h-11 w-full rounded-lg border border-stone-300 bg-(--surface) px-2 text-base md:min-h-9 md:text-sm dark:border-stone-700";
export const label = "flex flex-col gap-1 text-sm font-bold";
export const hint = "text-xs font-normal text-stone-600 dark:text-stone-400";

export const card = "rounded-2xl border border-stone-200 bg-(--surface) p-4 dark:border-stone-700";
export const muted = "text-stone-600 dark:text-stone-400";
export const errorText = "text-sm font-bold text-red-700 dark:text-red-400";
