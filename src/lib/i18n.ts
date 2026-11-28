import { en, type Messages } from "./messages/en";
import { hi } from "./messages/hi";
import { kn } from "./messages/kn";
import { ml } from "./messages/ml";
import { mr } from "./messages/mr";
import { ta } from "./messages/ta";

// Languages (G12, B6): the app's own words in Kannada, Hindi, Tamil, Malayalam and Marathi.
// The other languages are first drafts written by AI and not yet checked by native speakers;
// the menu says so. Place names and our data stay as they are stored.
// Chosen with the `lang` cookie (no /hi/ addresses, so search engines see the same pages).
// Screens that already render per request (the planner, Near me) read it on the server; other
// pages stay in English.

export const LANGS = ["en", "kn", "hi", "ta", "ml", "mr"] as const;
export type Lang = (typeof LANGS)[number];

/** Each language's name in its own script, for the switcher. */
export const LANG_NAMES: Record<Lang, string> = {
  en: "English",
  kn: "ಕನ್ನಡ",
  hi: "हिन्दी",
  ta: "தமிழ்",
  ml: "മലയാളം",
  mr: "मराठी",
};

export const LANG_COOKIE = "lang";

/** Every language but English is an unchecked draft. */
export const DRAFT_LANGS: ReadonlySet<Lang> = new Set(["kn", "hi", "ta", "ml", "mr"]);

const MESSAGES: Record<Lang, Partial<Messages>> = { en, kn, hi, ta, ml, mr };

export function parseLang(value: string | null | undefined): Lang {
  return (LANGS as readonly string[]).includes(value ?? "") ? (value as Lang) : "en";
}

export type MessageKey = keyof Messages;

/** The text for a key in a language, English when the draft lacks it, with {name} filled in. */
export function translate(
  lang: Lang,
  key: MessageKey,
  vars: Record<string, string | number> = {},
): string {
  const text = MESSAGES[lang][key] ?? en[key];
  return text.replace(/\{(\w+)\}/g, (m, name: string) => (name in vars ? String(vars[name]) : m));
}
