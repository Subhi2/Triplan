"use client";

import { createContext, useCallback, useContext } from "react";
import { translate, type Lang, type MessageKey } from "@/lib/i18n";

const LangContext = createContext<Lang>("en");

/** The language for this screen, read from the `lang` cookie by its server page (G12). */
export function LangProvider({ lang, children }: { lang: Lang; children: React.ReactNode }) {
  return (
    <LangContext.Provider value={lang}>
      {/* The screen's language for screen readers and fonts; the page itself stays lang="en". */}
      <div lang={lang} className="contents">
        {children}
      </div>
    </LangContext.Provider>
  );
}

export function useLang(): Lang {
  return useContext(LangContext);
}

/** t("trip.start"), t("trip.stop", { n: 2 }): in the screen's language, English outside a provider. */
export function useT() {
  const lang = useContext(LangContext);
  return useCallback(
    (key: MessageKey, vars?: Record<string, string | number>) => translate(lang, key, vars),
    [lang],
  );
}
