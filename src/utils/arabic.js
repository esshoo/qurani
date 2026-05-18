const MARKS = /[\u064B-\u065F\u0670\u06D6-\u06ED]/g;
export function normalizeArabic(text) {
  return String(text || "")
    .replace(MARKS, "")
    .replace(/[إأآٱ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ؤ/g, "و")
    .replace(/ئ/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/ـ/g, "")
    .trim();
}
export function sanitizedTaj(html) {
  return String(html || "").replace(/\s*[\u0660-\u0669]+\s*$/, "");
}
