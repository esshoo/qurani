import { APP_CONFIG } from "../core/config.js";

async function fetchJsonCandidates(urls) {
  let lastError = null;
  for (const url of urls) {
    try {
      const res = await fetch(url, { cache: "no-cache" });
      if (res.ok) return await res.json();
      lastError = new Error(`${url}: ${res.status}`);
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError || new Error("No data url configured");
}

export async function loadQuranData() {
  if (APP_CONFIG.dataMode === "single") {
    return fetchJsonCandidates(APP_CONFIG.paths.quranSingleCandidates);
  }
  const surahs = [];
  for (let i = 1; i <= 114; i++) {
    const id = String(i).padStart(3, "0");
    const res = await fetch(`${APP_CONFIG.paths.surahDir}surah_${id}.json`);
    if (!res.ok) throw new Error(`تعذر تحميل السورة ${i}`);
    surahs.push(await res.json());
  }
  return surahs;
}

export function buildIndexes(data) {
  const indexByGlobal = [];
  const indexByPage = new Map();
  const indexByJuz = new Map();
  const indexByHizbQuarter = new Map();

  for (const surah of data) {
    for (const ayah of surah.ayahs || []) {
      const normalized = {
        ...ayah,
        surah: surah.number,
        sName: surah.name,
        numberInSurah: ayah.numberInSurah,
        number: ayah.number
      };
      indexByGlobal[ayah.number - 1] = normalized;
      pushMap(indexByPage, ayah.page || 1, normalized);
      pushMap(indexByJuz, ayah.juz || 1, normalized);
      pushMap(indexByHizbQuarter, ayah.hizbQuarter || 1, normalized);
    }
  }

  return { indexByGlobal, indexByPage, indexByJuz, indexByHizbQuarter };
}

function pushMap(map, key, val) {
  if (!map.has(key)) map.set(key, []);
  map.get(key).push(val);
}

export function getCurrentUnitAyahs(state) {
  const mode = state.settings.mode;
  if (!state.data) return [];
  if (mode === "ayah") {
    const ref = state.indexByGlobal[state.pointer.ayahGlobal - 1];
    return ref ? [ref] : [];
  }
  if (mode === "surah") {
    const surah = state.data[state.pointer.surah - 1];
    return (surah?.ayahs || []).map(a => ({ ...a, surah: surah.number, sName: surah.name }));
  }
  if (mode === "page") return state.indexByPage.get(state.pointer.page) || [];
  if (mode === "juz") return state.indexByJuz.get(state.pointer.juz) || [];
  if (mode === "hizb") {
    const q = state.pointer.hizbQuarter;
    const span = Math.max(1, Math.min(4, state.settings.hizbPart));
    const arr = [];
    for (let i = q; i <= Math.min(240, q + span - 1); i++) {
      arr.push(...(state.indexByHizbQuarter.get(i) || []));
    }
    return arr;
  }
  return [];
}

export function syncPointerFromAyah(state, ayah) {
  if (!ayah) return;
  state.pointer.ayahGlobal = ayah.number;
  state.pointer.surah = ayah.surah;
  state.pointer.page = ayah.page || state.pointer.page;
  state.pointer.juz = ayah.juz || state.pointer.juz;
  state.pointer.hizbQuarter = ayah.hizbQuarter || state.pointer.hizbQuarter;
  state.pointer.numberInSurah = ayah.numberInSurah;
}

export function stepPointer(state, dir) {
  const mode = state.settings.mode;
  if (mode === "ayah") {
    state.pointer.ayahGlobal = clamp(state.pointer.ayahGlobal + dir, 1, state.indexByGlobal.length);
    syncPointerFromAyah(state, state.indexByGlobal[state.pointer.ayahGlobal - 1]);
  } else if (mode === "surah") {
    state.pointer.surah = clamp(state.pointer.surah + dir, 1, state.data.length);
    const first = state.data[state.pointer.surah - 1]?.ayahs?.[0];
    if (first) syncPointerFromAyah(state, { ...first, surah: state.pointer.surah });
  } else if (mode === "page") {
    const pages = [...state.indexByPage.keys()].sort((a, b) => a - b);
    const i = Math.max(0, pages.indexOf(state.pointer.page));
    state.pointer.page = pages[clamp(i + dir, 0, pages.length - 1)];
    syncPointerFromAyah(state, state.indexByPage.get(state.pointer.page)?.[0]);
  } else if (mode === "juz") {
    const juz = [...state.indexByJuz.keys()].sort((a, b) => a - b);
    const i = Math.max(0, juz.indexOf(state.pointer.juz));
    state.pointer.juz = juz[clamp(i + dir, 0, juz.length - 1)];
    syncPointerFromAyah(state, state.indexByJuz.get(state.pointer.juz)?.[0]);
  } else if (mode === "hizb") {
    state.pointer.hizbQuarter = clamp(state.pointer.hizbQuarter + dir * state.settings.hizbPart, 1, 240);
    syncPointerFromAyah(state, state.indexByHizbQuarter.get(state.pointer.hizbQuarter)?.[0]);
  }
}

function clamp(x, a, b) { return Math.max(a, Math.min(b, x)); }
