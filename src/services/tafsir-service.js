import { APP_CONFIG } from "../core/config.js";

const memoryCache = new Map();
const localSurahCache = new Map();

export async function getTafsir(ayah, tafsirKey) {
  const key = `${tafsirKey}:${ayah.surah}:${ayah.numberInSurah}`;
  if (memoryCache.has(key)) return memoryCache.get(key);

  if (APP_CONFIG.offline?.tryLocalTafsir) {
    const localText = await tryLocalTafsir(ayah, tafsirKey);
    if (localText) {
      memoryCache.set(key, localText);
      return localText;
    }
  }

  if (!navigator.onLine) {
    throw new Error("التفسير غير محفوظ محليًا ويحتاج اتصالًا بالإنترنت.");
  }

  const url = `${APP_CONFIG.tafsirOnline}${ayah.surah}:${ayah.numberInSurah}/${tafsirKey}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error("تعذر تحميل التفسير");
  const json = await res.json();
  const text = json?.data?.text || "لا يوجد تفسير متاح لهذه الآية.";
  memoryCache.set(key, text);
  return text;
}

async function tryLocalTafsir(ayah, tafsirKey) {
  const surahNo = String(ayah.surah).padStart(3, "0");
  const pattern = APP_CONFIG.paths.tafsirLocalPattern || "./data/tafsir/{tafsir}/surah_{surah}.json";
  const url = pattern.replace("{tafsir}", tafsirKey).replace("{surah}", surahNo);
  const cacheKey = `${tafsirKey}:${surahNo}`;

  try {
    if (!localSurahCache.has(cacheKey)) {
      const res = await fetch(url);
      if (!res.ok) {
        localSurahCache.set(cacheKey, null);
        return null;
      }
      localSurahCache.set(cacheKey, await res.json());
    }
    return extractTafsirText(localSurahCache.get(cacheKey), ayah);
  } catch {
    localSurahCache.set(cacheKey, null);
    return null;
  }
}

function extractTafsirText(data, ayah) {
  if (!data) return null;
  const n = Number(ayah.numberInSurah);

  if (Array.isArray(data)) {
    const item = data.find(x => Number(x.numberInSurah ?? x.ayah ?? x.number) === n);
    return item?.text || item?.tafsir || item?.content || null;
  }

  if (Array.isArray(data.ayahs)) {
    const item = data.ayahs.find(x => Number(x.numberInSurah ?? x.ayah ?? x.number) === n);
    return item?.text || item?.tafsir || item?.content || null;
  }

  if (data[String(n)]) {
    const item = data[String(n)];
    return typeof item === "string" ? item : (item.text || item.tafsir || item.content || null);
  }

  return null;
}
