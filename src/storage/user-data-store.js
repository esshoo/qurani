import { bulkPut, clearStore, deleteRecord, getAllRecords, getRecord, putRecord, STORES } from "./db.js";
import { clearProgressData, exportProgressData, importProgressData } from "./progress-store.js";

const LEGACY_NOTES_KEY = "qapp.v01.notes";
const LEGACY_BOOKMARKS_KEY = "qapp.v01.bookmarks";
const MIGRATION_KEY = "qapp.v027.indexeddb.migrated";

function nowIso() {
  return new Date().toISOString();
}

function safeJsonParse(value, fallback) {
  try { return JSON.parse(value); }
  catch { return fallback; }
}

function makeId(prefix = "item") {
  return `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

function normalizeNote(note) {
  const date = nowIso();
  return {
    ...note,
    id: note.id || makeId(note.type || "note"),
    type: note.type || "text",
    title: note.title || (note.type === "drawing" ? "رسم بالقلم" : "ملاحظة بدون عنوان"),
    createdAt: note.createdAt || date,
    updatedAt: date
  };
}

function normalizeBookmark(bookmark) {
  const key = bookmark.key || `${bookmark.surah}:${bookmark.numberInSurah || bookmark.ayah}`;
  return {
    ...bookmark,
    key,
    ayah: bookmark.ayah || bookmark.numberInSurah,
    numberInSurah: bookmark.numberInSurah || bookmark.ayah,
    createdAt: bookmark.createdAt || nowIso()
  };
}

function normalizeExport(record) {
  const date = nowIso();
  return {
    ...record,
    id: record.id || makeId("export"),
    kind: record.kind || "image",
    createdAt: record.createdAt || date,
    updatedAt: date
  };
}

function normalizeTestResult(result) {
  const date = nowIso();
  return {
    ...result,
    id: result.id || makeId("test"),
    kind: result.kind || "memorization-test",
    createdAt: result.createdAt || date,
    updatedAt: date,
    score: Number(result.score || 0),
    ayahs: Array.isArray(result.ayahs) ? result.ayahs : [],
    wrongWords: Array.isArray(result.wrongWords) ? result.wrongWords : []
  };
}

export async function migrateLegacyUserData() {
  if (localStorage.getItem(MIGRATION_KEY) === "1") return { notes: 0, bookmarks: 0 };

  const legacyNotes = safeJsonParse(localStorage.getItem(LEGACY_NOTES_KEY) || "[]", []);
  const legacyBookmarks = safeJsonParse(localStorage.getItem(LEGACY_BOOKMARKS_KEY) || "[]", []);
  const notes = Array.isArray(legacyNotes) ? legacyNotes.map(normalizeNote) : [];
  const bookmarks = Array.isArray(legacyBookmarks) ? legacyBookmarks.map(normalizeBookmark) : [];

  if (notes.length) await bulkPut(STORES.notes, notes);
  if (bookmarks.length) await bulkPut(STORES.bookmarks, bookmarks);

  localStorage.setItem(MIGRATION_KEY, "1");
  return { notes: notes.length, bookmarks: bookmarks.length };
}

export async function getNotes() {
  const notes = await getAllRecords(STORES.notes);
  return notes.sort((a, b) => String(b.updatedAt || b.createdAt || "").localeCompare(String(a.updatedAt || a.createdAt || "")));
}

export async function saveNote(note) {
  const finalNote = normalizeNote(note);
  await putRecord(STORES.notes, finalNote);
  return finalNote;
}

export async function deleteNote(id) {
  await deleteRecord(STORES.notes, id);
}

export async function importNotes(payload) {
  const incoming = Array.isArray(payload) ? payload : [payload];
  const notes = incoming.filter(item => item && typeof item === "object").map(normalizeNote);
  if (notes.length) await bulkPut(STORES.notes, notes);
  return notes.length;
}

export async function getBookmarks() {
  const bookmarks = await getAllRecords(STORES.bookmarks);
  return bookmarks.sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")));
}

export async function toggleBookmark(ref) {
  const key = `${ref.surah}:${ref.numberInSurah}`;
  const existing = await getRecord(STORES.bookmarks, key);
  if (existing) {
    await deleteRecord(STORES.bookmarks, key);
    return false;
  }
  await putRecord(STORES.bookmarks, normalizeBookmark({
    key,
    surah: ref.surah,
    ayah: ref.numberInSurah,
    numberInSurah: ref.numberInSurah,
    ayahGlobal: ref.number,
    page: ref.page,
    juz: ref.juz,
    hizbQuarter: ref.hizbQuarter,
    text: ref.text,
    surahName: ref.sName || ref.name || ""
  }));
  return true;
}

export async function deleteBookmark(key) {
  await deleteRecord(STORES.bookmarks, key);
}

export async function saveExportRecord(record) {
  const finalRecord = normalizeExport(record);
  await putRecord(STORES.exports, finalRecord);
  return finalRecord;
}

export async function getExports() {
  const exportsList = await getAllRecords(STORES.exports);
  return exportsList.sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")));
}

export async function deleteExport(id) {
  await deleteRecord(STORES.exports, id);
}

export async function saveTestResult(result) {
  const finalResult = normalizeTestResult(result);
  await putRecord(STORES.testResults, finalResult);
  return finalResult;
}

export async function getTestResults() {
  const tests = await getAllRecords(STORES.testResults);
  return tests.sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")));
}

export async function deleteTestResult(id) {
  await deleteRecord(STORES.testResults, id);
}

export async function importTestResults(payload) {
  const incoming = Array.isArray(payload) ? payload : [payload];
  const tests = incoming.filter(item => item && typeof item === "object").map(normalizeTestResult);
  if (tests.length) await bulkPut(STORES.testResults, tests);
  return tests.length;
}

export async function exportAllUserData() {
  const [notes, bookmarks, exportsList, progress, tests] = await Promise.all([getNotes(), getBookmarks(), getExports(), exportProgressData(), getTestResults()]);
  return {
    app: "quran-app",
    version: "0.8",
    exportedAt: nowIso(),
    notes,
    bookmarks,
    exports: exportsList,
    progress,
    tests
  };
}

export async function importUserData(payload) {
  if (!payload || typeof payload !== "object") throw new Error("Invalid backup payload.");
  let notes = 0;
  let bookmarks = 0;
  let exportsCount = 0;
  let progress = 0;
  let tests = 0;

  if (Array.isArray(payload.notes)) {
    notes = await importNotes(payload.notes);
  } else if (Array.isArray(payload)) {
    notes = await importNotes(payload);
  }

  if (Array.isArray(payload.bookmarks)) {
    const normalized = payload.bookmarks.filter(Boolean).map(normalizeBookmark);
    if (normalized.length) bookmarks = await bulkPut(STORES.bookmarks, normalized);
  }

  if (Array.isArray(payload.exports)) {
    const normalized = payload.exports.filter(Boolean).map(normalizeExport);
    if (normalized.length) exportsCount = await bulkPut(STORES.exports, normalized);
  }

  if (Array.isArray(payload.progress)) {
    progress = await importProgressData(payload.progress);
  }

  if (Array.isArray(payload.tests)) {
    tests = await importTestResults(payload.tests);
  }

  return { notes, bookmarks, exports: exportsCount, progress, tests };
}

export async function clearAllUserData() {
  await Promise.all([clearStore(STORES.notes), clearStore(STORES.bookmarks), clearStore(STORES.exports), clearStore(STORES.testResults), clearProgressData()]);
}
