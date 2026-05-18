// Advanced Arabic normalizer/search helpers adapted for Quran search.
// Keeps a map from normalized characters back to original indices for accurate highlighting.

export const CH = {
  ALEF: "\u0627",
  ALEF_WITH_HAMZA_ABOVE: "\u0623",
  ALEF_WITH_HAMZA_BELOW: "\u0625",
  ALEF_WITH_MADDA_ABOVE: "\u0622",
  ALEF_WASLA: "\u0671",
  BEH: "\u0628",
  DOTLESS_BEH: "\u066E",
  TEH: "\u062A",
  THEH: "\u062B",
  JEEM: "\u062C",
  HAH: "\u062D",
  KHAH: "\u062E",
  DAL: "\u062F",
  THAL: "\u0630",
  REH: "\u0631",
  ZAIN: "\u0632",
  SEEN: "\u0633",
  SHEEN: "\u0634",
  SAD: "\u0635",
  DAD: "\u0636",
  TAH: "\u0637",
  ZAH: "\u0638",
  AIN: "\u0639",
  GHAIN: "\u063A",
  FEH: "\u0641",
  DOTLESS_FEH: "\u06A1",
  QAF: "\u0642",
  DOTLESS_QAF: "\u066F",
  KAF: "\u0643",
  LAM: "\u0644",
  MEEM: "\u0645",
  NOON: "\u0646",
  DOTLESS_NOON: "\u06BA",
  TEH_MARBUTA: "\u0629",
  HEH: "\u0647",
  WAW: "\u0648",
  WAW_WITH_HAMZA_ABOVE: "\u0624",
  YEH: "\u064A",
  YEH_WITH_HAMZA_ABOVE: "\u0626",
  DOTLESS_YEH: "\u0649",
  FARSI_YEH: "\u06CC",
  SMALL_ALEF: "\u0670",
  SMALL_WAW: "\u06E5",
  SMALL_YEH: "\u06E6",
  HAMZA_BELOW: "\u0655",
  NARROW_NBSP: "\u202F",
  SUPERSCRIPT_ALEF: "\u0670",
  HAMZA: "\u0621",
  KASHIDA: "\u0640",
};

const DUAL_JOINING = new Set([
  CH.DOTLESS_BEH,
  CH.HAH,
  CH.SEEN,
  CH.SAD,
  CH.TAH,
  CH.AIN,
  CH.DOTLESS_FEH,
  CH.DOTLESS_QAF,
  CH.KAF,
  CH.LAM,
  CH.MEEM,
  CH.DOTLESS_NOON,
  CH.HEH,
  CH.DOTLESS_YEH,
  CH.KASHIDA,
]);

const RIGHT_JOINING_ONLY = new Set([CH.ALEF, CH.DAL, CH.REH, CH.WAW]);
const LEFT_JOINING = DUAL_JOINING;
const RIGHT_JOINING = new Set([...DUAL_JOINING, ...RIGHT_JOINING_ONLY]);

const DOTLESS_MAP = new Map([
  [CH.ALEF_WITH_HAMZA_ABOVE, CH.ALEF],
  [CH.ALEF_WITH_HAMZA_BELOW, CH.ALEF],
  [CH.ALEF_WITH_MADDA_ABOVE, CH.ALEF],
  [CH.ALEF_WASLA, CH.ALEF],
  [CH.BEH, CH.DOTLESS_BEH],
  [CH.TEH, CH.DOTLESS_BEH],
  [CH.THEH, CH.DOTLESS_BEH],
  [CH.JEEM, CH.HAH],
  [CH.KHAH, CH.HAH],
  [CH.THAL, CH.DAL],
  [CH.ZAIN, CH.REH],
  [CH.SHEEN, CH.SEEN],
  [CH.DAD, CH.SAD],
  [CH.ZAH, CH.TAH],
  [CH.GHAIN, CH.AIN],
  [CH.FEH, CH.DOTLESS_FEH],
  [CH.QAF, CH.DOTLESS_QAF],
  [CH.NOON, CH.DOTLESS_NOON],
  [CH.TEH_MARBUTA, CH.HEH],
  [CH.WAW_WITH_HAMZA_ABOVE, CH.WAW],
  [CH.YEH_WITH_HAMZA_ABOVE, CH.DOTLESS_YEH],
  [CH.YEH, CH.DOTLESS_YEH],
  [CH.FARSI_YEH, CH.DOTLESS_YEH],
  [CH.HAMZA_BELOW, ""],
]);

const POSITIONAL_DOTLESS_FORM = new Set([
  CH.DOTLESS_NOON,
  CH.DOTLESS_YEH,
  CH.DOTLESS_QAF,
]);

const SMALL_LETTERS_MAP = new Map([
  [CH.SMALL_ALEF, CH.ALEF],
  [CH.SMALL_WAW, CH.WAW],
  [CH.SMALL_YEH, CH.YEH],
]);

const MARK_RE = /[\p{M}\u0640\u202F]/u;

export function canJoin(prev, next) {
  return LEFT_JOINING.has(prev) && RIGHT_JOINING.has(next) && !RIGHT_JOINING_ONLY.has(prev);
}

export function isInitial(first, prev, last, next) {
  return !canJoin(prev, first) && canJoin(last, next);
}

export function isMedial(first, prev, last, next) {
  return canJoin(prev, first) && canJoin(last, next);
}

export function isFinal(first, prev, last, next) {
  return canJoin(prev, first) && !canJoin(last, next);
}

export function isIsolated(first, prev, last, next) {
  return !canJoin(prev, first) && !canJoin(last, next);
}

export function previousNonMark(text, index) {
  if (index <= 0) return "";
  for (let i = index - 1; i >= 0; i--) {
    const char = text[i];
    if (!MARK_RE.test(char)) return char;
  }
  return "";
}

export function nextNonMark(text, index) {
  if (index >= text.length - 1) return "";
  for (let i = index + 1; i < text.length; i++) {
    const char = text[i];
    if (!MARK_RE.test(char)) return char;
  }
  return "";
}

function normalizeDotsChar(char) {
  return DOTLESS_MAP.get(char) ?? char;
}

export function normalizeDots(text) {
  return normalize(text, { ignoreMarks: false, ignoreDots: true, ignoreSmallLetters: false }).text;
}

function applyPositionalDotlessReplacement(char, originalChars, originalIndex) {
  if (!POSITIONAL_DOTLESS_FORM.has(char)) return char;

  const prev = normalizeDotsChar(previousNonMark(originalChars, originalIndex));
  const next = normalizeDotsChar(nextNonMark(originalChars, originalIndex));

  if (isInitial(char, prev, char, next) || isMedial(char, prev, char, next)) {
    if (char === CH.DOTLESS_NOON || char === CH.DOTLESS_YEH) return CH.DOTLESS_BEH;
    if (char === CH.DOTLESS_QAF) return CH.DOTLESS_FEH;
  }
  return char;
}

export function normalize(text, options = {}) {
  const {
    ignoreMarks = true,
    ignoreDots = false,
    ignoreSmallLetters = true,
  } = options;

  if (!text) return { text: "", indexMap: [] };

  const chars = [...String(text)];
  const processed = [];
  const indexMap = [];

  chars.forEach((originalChar, i) => {
    let char = originalChar;
    let keep = true;

    if (ignoreSmallLetters) {
      const replacement = SMALL_LETTERS_MAP.get(char);
      if (replacement !== undefined) char = replacement;
    } else {
      const replacement = SMALL_LETTERS_MAP.get(char);
      if (replacement !== undefined && chars[i - 1] === CH.KASHIDA) char = replacement;
    }

    if (ignoreMarks && MARK_RE.test(char) && char !== CH.HAMZA_BELOW) {
      keep = false;
    }

    if (keep && ignoreDots) {
      const replacement = DOTLESS_MAP.get(char);
      if (replacement !== undefined) {
        char = replacement;
        if (char === "") keep = false;
      }
      if (keep) char = applyPositionalDotlessReplacement(char, chars, i);
    }

    if (keep) {
      processed.push(char);
      indexMap.push(i);
    }
  });

  return { text: processed.join(""), indexMap };
}

export function highlightByRanges(text, ranges, className = "search-mark") {
  const raw = String(text ?? "");
  if (!ranges || !ranges.length) return escapeMinimal(raw);

  const safeRanges = [...ranges]
    .filter(range => range.start >= 0 && range.end <= raw.length && range.start < range.end)
    .sort((a, b) => a.start - b.start);

  let cursor = 0;
  let html = "";
  for (const range of safeRanges) {
    if (range.start < cursor) continue;
    html += escapeMinimal(raw.slice(cursor, range.start));
    html += `<mark class="${className}">${escapeMinimal(raw.slice(range.start, range.end))}</mark>`;
    cursor = range.end;
  }
  html += escapeMinimal(raw.slice(cursor));
  return html;
}

function escapeMinimal(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
