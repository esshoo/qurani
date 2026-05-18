import { DEFAULT_SETTINGS } from "./state.js";
import {
  clearAllUserData,
  deleteBookmark,
  deleteExport,
  deleteNote,
  deleteTestResult,
  exportAllUserData,
  getBookmarks,
  getExports,
  getNotes,
  getTestResults,
  importNotes,
  importUserData,
  migrateLegacyUserData,
  saveExportRecord,
  saveNote,
  saveTestResult,
  toggleBookmark
} from "../storage/user-data-store.js";
import {
  addReadingSeconds,
  calculateKhatmaStats,
  calculateWirdStats,
  getDailyProgressHistory,
  getKhatmaProgress,
  getTodayProgress,
  recordReadingProgress,
  resetTodayProgress,
  saveKhatmaProgress,
  TOTAL_AYAHS,
  TOTAL_PAGES
} from "../storage/progress-store.js";

const SETTINGS_KEY = "qapp.v01.settings";
const POINTER_KEY = "qapp.v01.pointer";

function deepMergeSettings(defaults, incoming = {}) {
  return {
    ...defaults,
    ...incoming,
    notifications: { ...defaults.notifications, ...(incoming.notifications || {}) },
    wird: { ...defaults.wird, ...(incoming.wird || {}) },
    khatma: { ...defaults.khatma, ...(incoming.khatma || {}) },
    home: { ...defaults.home, ...(incoming.home || {}) }
  };
}

export function loadSettings() {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    return raw ? deepMergeSettings(DEFAULT_SETTINGS, JSON.parse(raw)) : deepMergeSettings(DEFAULT_SETTINGS);
  } catch {
    return deepMergeSettings(DEFAULT_SETTINGS);
  }
}

export function saveSettings(settings) {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}

export function loadPointer() {
  try {
    const raw = localStorage.getItem(POINTER_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function savePointer(pointer) {
  localStorage.setItem(POINTER_KEY, JSON.stringify(pointer));
}

export {
  addReadingSeconds,
  calculateKhatmaStats,
  calculateWirdStats,
  clearAllUserData,
  deleteBookmark,
  deleteExport,
  deleteNote,
  deleteTestResult,
  exportAllUserData,
  getBookmarks,
  getDailyProgressHistory,
  getExports,
  getKhatmaProgress,
  getNotes,
  getTestResults,
  getTodayProgress,
  importNotes,
  importUserData,
  migrateLegacyUserData,
  recordReadingProgress,
  resetTodayProgress,
  saveExportRecord,
  saveKhatmaProgress,
  saveNote,
  saveTestResult,
  toggleBookmark,
  TOTAL_AYAHS,
  TOTAL_PAGES
};
