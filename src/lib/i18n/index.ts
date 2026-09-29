import { derived, get, writable } from "svelte/store"
import zhCN from "./zh-CN.json"

export type Language = "en" | "zh-CN"
export const language = writable<Language>("en")
const messages: Record<string, string> = zhCN
export function translateFor(
  locale: Language,
  text: string,
  values: Record<string, string | number> = {},
) {
  const translated = locale === "zh-CN" ? (messages[text] ?? text) : text
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
  const locale =
    saved === "en" || saved === "zh-CN"
      ? saved
      : navigator.language.toLowerCase().startsWith("zh")
        ? "zh-CN"
        : "en"
  setLanguage(locale)
}
