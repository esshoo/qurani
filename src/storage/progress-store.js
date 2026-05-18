import { bulkPut, clearStore, getAllRecords, getRecord, putRecord, STORES } from "./db.js";

const TOTAL_AYAHS = 6236;
const TOTAL_PAGES = 604;
const KHATMA_KEY = "khatma";
const SESSION_KEY = "reading-session";

function nowIso() {
  return new Date().toISOString();
}

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

function uniqueNumbers(values) {
  return [...new Set((values || []).map(Number).filter(Number.isFinite))].sort((a, b) => a - b);
}

function emptyDaily(date = todayKey()) {
  const dateIso = nowIso();
  return {
    key: `daily-${date}`,
    kind: "daily",
    date,
    ayahGlobals: [],
    pages: [],
    seconds: 0,
    units: 0,
    lastPointer: null,
    lastAyah: null,
    createdAt: dateIso,
    updatedAt: dateIso
  };
}

function normalizePointer(pointer = {}) {
  return {
    ayahGlobal: Number(pointer.ayahGlobal || 1),
    surah: Number(pointer.surah || 1),
    page: Number(pointer.page || 1),
    juz: Number(pointer.juz || 1),
    hizbQuarter: Number(pointer.hizbQuarter || 1),
    numberInSurah: Number(pointer.numberInSurah || 1)
  };
}

export function getTodayDateKey() {
  return todayKey();
}

export async function getTodayProgress() {
  const date = todayKey();
  return (await getRecord(STORES.progress, `daily-${date}`)) || emptyDaily(date);
}


export async function resetTodayProgress() {
  const date = todayKey();
  const fresh = emptyDaily(date);
  await putRecord(STORES.progress, fresh);
  return fresh;
}

export async function getDailyProgressHistory(limit = 14) {
  const all = await getAllRecords(STORES.progress);
  return all
    .filter(item => item?.kind === "daily")
    .sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")))
    .slice(0, limit);
}

export async function recordReadingProgress({ ayahs = [], pointer = null, seconds = 0 } = {}) {
  const current = await getTodayProgress();
  const incomingAyahs = ayahs.filter(Boolean);
  const ayahGlobals = uniqueNumbers([
    ...current.ayahGlobals,
    ...incomingAyahs.map(a => a.number || a.ayahGlobal)
  ]);
  const pages = uniqueNumbers([
    ...current.pages,
    ...incomingAyahs.map(a => a.page),
    pointer?.page
  ]);
  const lastAyah = incomingAyahs[0] ? {
    surah: incomingAyahs[0].surah,
    surahName: incomingAyahs[0].sName || incomingAyahs[0].name || "",
    ayah: incomingAyahs[0].numberInSurah,
    ayahGlobal: incomingAyahs[0].number,
    page: incomingAyahs[0].page,
    text: incomingAyahs[0].text || ""
  } : current.lastAyah;

  const updated = {
    ...current,
    ayahGlobals,
    pages,
    seconds: Math.max(0, Number(current.seconds || 0) + Math.max(0, Number(seconds || 0))),
    units: Math.max(0, Number(current.units || 0) + (incomingAyahs.length ? 1 : 0)),
    lastPointer: pointer ? normalizePointer(pointer) : current.lastPointer,
    lastAyah,
    updatedAt: nowIso()
  };
  await putRecord(STORES.progress, updated);
  await updateKhatmaFromPointer(pointer, incomingAyahs[0]);
  return updated;
}

export async function addReadingSeconds(seconds) {
  const n = Math.max(0, Math.round(Number(seconds || 0)));
  if (!n) return getTodayProgress();
  return recordReadingProgress({ seconds: n });
}

export async function getKhatmaProgress() {
  const existing = await getRecord(STORES.progress, KHATMA_KEY);
  if (existing) return existing;
  const created = {
    key: KHATMA_KEY,
    kind: "khatma",
    enabled: true,
    startedAt: nowIso(),
    startAyahGlobal: 1,
    currentAyahGlobal: 1,
    targetAyahGlobal: TOTAL_AYAHS,
    targetDays: 30,
    planType: "timed",
    completedAt: "",
    updatedAt: nowIso()
  };
  await putRecord(STORES.progress, created);
  return created;
}

export async function saveKhatmaProgress(record) {
  const previous = await getKhatmaProgress();
  const updated = {
    ...previous,
    ...record,
    key: KHATMA_KEY,
    kind: "khatma",
    updatedAt: nowIso()
  };
  await putRecord(STORES.progress, updated);
  return updated;
}

async function updateKhatmaFromPointer(pointer, ayah) {
  const candidate = Number(ayah?.number || pointer?.ayahGlobal || 0);
  if (!candidate) return;
  const khatma = await getKhatmaProgress();
  if (!khatma.enabled) return;
  const current = Math.max(Number(khatma.currentAyahGlobal || 1), candidate);
  const completedAt = current >= Number(khatma.targetAyahGlobal || TOTAL_AYAHS) ? (khatma.completedAt || nowIso()) : "";
  await putRecord(STORES.progress, {
    ...khatma,
    currentAyahGlobal: Math.min(TOTAL_AYAHS, current),
    completedAt,
    updatedAt: nowIso()
  });
}

export function calculateWirdStats(daily, settings = {}) {
  const wird = settings.wird || {};
  const goalType = wird.goalType || "ayahs";
  const goalValue = Math.max(1, Number(wird.goalValue || (goalType === "pages" ? 1 : goalType === "minutes" ? 15 : 10)));
  const done = goalType === "pages"
    ? uniqueNumbers(daily?.pages).length
    : goalType === "minutes"
      ? Math.floor(Number(daily?.seconds || 0) / 60)
      : uniqueNumbers(daily?.ayahGlobals).length;
  const ratio = Math.min(1, done / goalValue);
  return { goalType, goalValue, done, ratio, completed: done >= goalValue };
}

export function calculateKhatmaStats(khatma) {
  const start = Math.max(1, Number(khatma?.startAyahGlobal || 1));
  const current = Math.max(start, Number(khatma?.currentAyahGlobal || start));
  const target = Math.max(start, Number(khatma?.targetAyahGlobal || TOTAL_AYAHS));
  const total = Math.max(1, target - start + 1);
  const done = Math.max(0, Math.min(total, current - start + 1));
  const ratio = Math.min(1, done / total);
  const remainingAyahs = Math.max(0, target - current);
  const approxRemainingPages = Math.ceil((remainingAyahs / TOTAL_AYAHS) * TOTAL_PAGES);
  return { start, current, target, total, done, ratio, remainingAyahs, approxRemainingPages, completed: ratio >= 1 };
}

export async function exportProgressData() {
  const progress = await getAllRecords(STORES.progress);
  return progress;
}

export async function importProgressData(records = []) {
  const valid = records.filter(item => item && typeof item === "object" && item.key);
  if (valid.length) await bulkPut(STORES.progress, valid);
  return valid.length;
}

export async function clearProgressData() {
  await clearStore(STORES.progress);
}

export { TOTAL_AYAHS, TOTAL_PAGES };
