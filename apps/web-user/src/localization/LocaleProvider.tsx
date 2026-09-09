import { createContext, useContext, useEffect, useMemo } from "react";
import type { ReactNode } from "react";
import { resolveLocale, translateMessage, type SupportedLocale, type Translate } from "./locale";

interface LocaleContextValue {
  locale: SupportedLocale;
  t: Translate;
}

const LocaleContext = createContext<LocaleContextValue | null>(null);

export function LocaleProvider({ children, requestedLocale }: { children: ReactNode; requestedLocale?: unknown }) {
  const locale = resolveLocale(requestedLocale);
  const value = useMemo<LocaleContextValue>(
    () => ({
      locale,
      t: (key) => translateMessage(locale, key)
    }),
    [locale]
  );

  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export function useLocalization(): LocaleContextValue {
  const context = useContext(LocaleContext);

  if (context === null) {
    throw new Error("useLocalization must be used within LocaleProvider.");
  }

  return context;
}

