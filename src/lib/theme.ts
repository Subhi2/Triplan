/** Where the rider's light or dark choice is kept (this browser only). */
export const THEME_KEY = "theme";
export type Theme = "light" | "dark";

/**
 * Runs in <head> before the first paint so the page never flashes the wrong theme: the saved
 * choice, else the device's setting. It sets data-theme on <html>, which globals.css reads.
 * Kept free of backslashes: it is a string, written into the page.
 */
export const THEME_SCRIPT = `try{var t=localStorage.getItem("${THEME_KEY}");if(t!=="light"&&t!=="dark"){t=matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light"}document.documentElement.dataset.theme=t}catch(e){}`;
