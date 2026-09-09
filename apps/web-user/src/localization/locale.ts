import { englishMessages, type MessageKey } from "./catalog";

export const supportedLocales = ["en"] as const;

export type SupportedLocale = (typeof supportedLocales)[number];
export type Translate = (key: MessageKey) => string;

const catalogs: Record<SupportedLocale, Partial<Record<MessageKey, string>>> = {
  en: englishMessages
};

export function resolveLocale(candidate?: unknown): SupportedLocale {
  return typeof candidate === "string" && supportedLocales.some((locale) => locale === candidate)
    ? (candidate as SupportedLocale)
    : "en";
}

export function translateMessage(locale: SupportedLocale, key: MessageKey): string {
  const message = catalogs[locale][key];

  if (message === undefined) {
    throw new Error("Missing localization message for the resolved locale.");
  }

  return message;
}
