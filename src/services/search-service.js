import {
  normalize,
  normalizeDots,
  previousNonMark,
  nextNonMark,
  isInitial,
  isMedial,
  isFinal,
  isIsolated,
} from "../utils/arabic-normalizer.js";

const DEFAULT_LIMIT = 200;

const cache = new WeakMap();

function sourceTextForAyah(ayah) {
  // Use the simplified imlaei text when it exists because it matches the old search behavior.
  return ayah.imlaei_simple_text || ayah.imlaei || ayah.cleanText || ayah.text || "";
}

function getCacheForAyah(ayah) {
  let entry = cache.get(ayah);
  if (!entry) {
    entry = new Map();
    cache.set(ayah, entry);
  }
  return entry;
}

function optionsKey(options) {
  return [
    options.ignoreMarks ? "m1" : "m0",
    options.ignoreDots ? "d1" : "d0",
    options.ignoreSmallLetters ? "s1" : "s0",
  ].join("|");
}

function normalizedAyahText(ayah, options) {
  const text = sourceTextForAyah(ayah);
  const entry = getCacheForAyah(ayah);
  const key = optionsKey(options);
  if (!entry.has(key)) entry.set(key, normalize(text, options));
  return entry.get(key);
}

export function searchAyah(ayah, term, options = {}) {
  const searchOptions = normalizeSearchOptions(options);
  const rawText = sourceTextForAyah(ayah);
  const { text: normalizedAyah, indexMap } = normalizedAyahText(ayah, searchOptions);
  const normalizedTerm = normalize(term, searchOptions).text;

  if (!normalizedTerm) return null;

  const processedTerm = normalize(normalizedTerm, {
    ignoreMarks: true,
    ignoreDots: true,
    ignoreSmallLetters: false,
  }).text;
  const first = processedTerm[0] || "";
  const last = processedTerm[processedTerm.length - 1] || first;

  const matches = [];
  let index = 0;

  while (index < normalizedAyah.length) {
    const pos = normalizedAyah.indexOf(normalizedTerm, index);
    if (pos === -1) break;

    const end = pos + normalizedTerm.length;
    const prev = normalizeDots(previousNonMark(normalizedAyah, pos));
    const next = normalizeDots(nextNonMark(normalizedAyah, end - 1));

    let accepted = false;
    switch (searchOptions.position) {
      case "initial": accepted = isInitial(first, prev, last, next); break;
      case "final": accepted = isFinal(first, prev, last, next); break;
      case "medial": accepted = isMedial(first, prev, last, next); break;
      case "isolated": accepted = isIsolated(first, prev, last, next); break;
      case "any":
      default: accepted = true; break;
    }

    if (accepted) {
      const originalStart = indexMap[pos] ?? 0;
      const originalEnd = end < indexMap.length ? indexMap[end] : rawText.length;
      matches.push({ start: originalStart, end: originalEnd });
    }

    index = pos + 1;
  }

  return matches.length ? matches : null;
}

export function searchQuran({ ayahs, term, options = {}, limit = DEFAULT_LIMIT }) {
  const searchOptions = normalizeSearchOptions(options);
  const normalizedTerm = normalize(term, searchOptions).text;
  if (!normalizedTerm) {
    return { groups: [], totalMatches: 0, totalAyahs: 0, truncated: false };
  }

  const groupsMap = new Map();
  let totalMatches = 0;
  let totalAyahs = 0;
  let truncated = false;

  for (const ayah of ayahs) {
    if (!ayah) continue;
    const matches = searchAyah(ayah, normalizedTerm, searchOptions);
    if (!matches) continue;

    totalMatches += matches.length;
    totalAyahs += 1;

    const surahNumber = ayah.surah;
    if (!groupsMap.has(surahNumber)) {
      groupsMap.set(surahNumber, {
        surah: surahNumber,
        name: ayah.sName || ayah.name || `سورة ${surahNumber}`,
        ayat: [],
      });
    }

    groupsMap.get(surahNumber).ayat.push({
      ayah,
      displayText: sourceTextForAyah(ayah),
      matches,
    });

    if (totalAyahs >= limit) {
      truncated = true;
      break;
    }
  }

  return {
    groups: [...groupsMap.values()],
    totalMatches,
    totalAyahs,
    truncated,
  };
}

export function scopeAyahs(state, scope) {
  let list = state.indexByGlobal.filter(Boolean);
  if (scope === "surah") list = list.filter(a => a.surah === state.pointer.surah);
  if (scope === "page") list = list.filter(a => a.page === state.pointer.page);
  if (scope === "juz") list = list.filter(a => a.juz === state.pointer.juz);
  return list;
}

export function normalizeSearchOptions(options = {}) {
  return {
    ignoreMarks: options.ignoreMarks !== false,
    ignoreDots: options.ignoreDots !== false,
    ignoreSmallLetters: options.ignoreSmallLetters !== false,
    position: options.position || "any",
  };
}
