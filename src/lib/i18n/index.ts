import { derived, get, writable } from "svelte/store"
// Custom-control labels include translations from the VIA app locale catalogs (GPL-3.0).
import zhCN from "./zh-CN.json"
import ja from "./ja.json"
import ko from "./ko.json"
import es from "./es.json"

export const languageNames = {
  en: "English",
  "zh-CN": "简体中文",
  ja: "日本語",
  ko: "한국어",
  es: "Español",
} as const
export type Language = keyof typeof languageNames
export const language = writable<Language>("en")
const messages: Record<Language, Record<string, string>> = { en: {}, "zh-CN": zhCN, ja, ko, es }
export function translateFor(
  locale: Language,
  text: string,
  values: Record<string, string | number> = {},
) {
  const dictionary = messages[locale]
  const translated = Object.hasOwn(dictionary, text) ? dictionary[text] : text
  return translated.replace(/\{(\w+)\}/g, (match, key) =>
    String(values[key] ?? match),
  )
}
export const t = derived(
  language,
  (locale) =>
    (text: string, values: Record<string, string | number> = {}) =>
      translateFor(locale, text, values),
)
export function translate(
  text: string,
  values: Record<string, string | number> = {},
) {
  return translateFor(get(language), text, values)
}
export function setLanguage(locale: Language) {
  language.set(locale)
  if (typeof document !== "undefined") document.documentElement.lang = locale
  try {
    localStorage.setItem("hmkconf-language", locale)
  } catch {
    /* Storage may be unavailable. */
  }
}
export function initializeLanguage() {
  let saved: string | null = null
  try {
    saved = localStorage.getItem("hmkconf-language")
  } catch {
    /* Use browser preference. */
  }
  if (saved && Object.hasOwn(languageNames, saved)) {
    setLanguage(saved as Language)
    return
  }
  for (const preference of navigator.languages?.length ? navigator.languages : [navigator.language]) {
    const base = preference.toLowerCase().split("-")[0]
    const locale = base === "zh" ? "zh-CN" : base
    if (Object.hasOwn(languageNames, locale)) {
      setLanguage(locale as Language)
      return
    }
  }
  setLanguage("en")
}
