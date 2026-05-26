import { state } from "./core/state.js";
import { addReadingSeconds, loadSettings, saveSettings, loadPointer, savePointer, migrateLegacyUserData } from "./core/storage.js";
import { ModalManager } from "./core/modal-manager.js";
import { toast } from "./core/dom.js";
import { initPWA } from "./core/pwa.js";
import { initNotifications, refreshNotificationSchedule } from "./core/notifications.js";
import { initUpdateManager } from "./core/update-manager.js";
import { loadQuranData, buildIndexes, getCurrentUnitAyahs, stepPointer, syncPointerFromAyah } from "./services/quran-service.js";
import { AudioService } from "./services/audio-service.js";
import { renderReader, renderFocusReader, appendFocusUnit, markSelectedAyah, markPlayingAyah } from "./features/reader/reader-renderer.js";
import { initAyahActions } from "./features/reader/ayah-actions.js";
import { showTafsir, resetTafsirPanel } from "./features/tafsir/tafsir-panel.js";
import { initSettings } from "./features/settings/settings-modal.js";
import { openTextNote, openDrawingNote, initNotesLibrary } from "./features/notes/notes-modal.js";
import { openShareModal } from "./features/sharing/share-modal.js";
import { initSearch } from "./features/search/search-modal.js";
import { openPicker } from "./features/navigation/picker-modal.js";
import { initWird, recordCurrentReadingProgress, refreshWirdWidget } from "./features/wird/daily-wird.js";
import { initTestMode, openTestMode } from "./features/test/test-mode.js";

let audioService = null;
let lastReadingSecondsFlush = Date.now();
let focusScrollState = null;
let focusScrollHandler = null;

async function init() {
  ModalManager.init();
  state.settings = loadSettings();
  state.pointer = { ...state.pointer, ...(loadPointer() || {}) };
  try {
    const migrated = await migrateLegacyUserData();
    if (migrated.notes || migrated.bookmarks) {
      toast(`تم نقل بياناتك القديمة: ${migrated.notes} ملاحظات و ${migrated.bookmarks} علامات.`);
    }
  } catch (error) {
    console.warn("IndexedDB migration skipped", error);
  }
  updateReadingModeChip();
  attachGlobalEvents();
  initPWA();
  initUpdateManager();
  initNotifications({ state, onSave: () => saveSettings(state.settings) });

  try {
    state.data = await loadQuranData();
    const indexes = buildIndexes(state.data);
    Object.assign(state, indexes);
    normalizePointer();
    renderAndSave();
  } catch (err) {
    console.error(err);
    document.getElementById("content").innerHTML = `
      <p class="muted-text">تعذر تحميل بيانات القرآن.</p>
      <p class="muted-text">انسخ ملف <strong>quran.json</strong> بجوار index.html أو داخل <strong>data/quran.json</strong>.</p>
    `;
    document.getElementById("locator").textContent = "لا يوجد ملف بيانات";
  }

  audioService = new AudioService(
    document.getElementById("player"),
    state,
    (ayah) => {
      markPlayingAyah(ayah);
      if (ayah) resetTafsirPanel();
    },
    async () => {
      const moved = step(+1, { fromAudio: true });
      if (!moved) {
        audioService.stop();
        toast("تم الوصول إلى نهاية القراءة الحالية.");
        return;
      }
      await audioService.playUnit(getCurrentUnitAyahs(state), 0);
    }
  );
  initAyahActions({
    state,
    onTafsir: (ayah) => { markSelectedAyah(ayah); showTafsir(state, ayah); },
    onPlay: (ayah) => audioService.playAyah(ayah),
    onNote: (ayah) => openTextNote(ayah),
    onDrawing: (ayah) => openDrawingNote(ayah),
    onShare: (ayah) => openShareModal(ayah, state),
    onTest: (ayah) => openTestMode({ state, ayah })
  });
  initSettings({ state, onChange: () => { renderAndSave(); resetTafsirPanel(); } });
  initSearch({ state, onGoToAyah });
  initNotesLibrary();
  initTestMode({ state });
  initWird({
    state,
    onSettingsChange: () => { saveSettings(state.settings); refreshNotificationSchedule(); },
    onRefresh: () => renderAndSave()
  });
  startReadingTimer();

}

function attachGlobalEvents() {
  document.getElementById("btnNext").addEventListener("click", () => step(+1));
  document.getElementById("btnPrev").addEventListener("click", () => step(-1));
  document.getElementById("btnPlay").addEventListener("click", () => audioService?.toggle(getCurrentUnitAyahs(state)));
  document.getElementById("btnFocus").addEventListener("click", () => setFocusMode(true));
  document.getElementById("btnExitFocus").addEventListener("click", () => setFocusMode(false));
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && document.body.classList.contains("focus-mode")) setFocusMode(false);
  });
  document.getElementById("readingModeChip").addEventListener("click", () => {
    state.settings.readingMode = state.settings.readingMode === "continuous" ? "repeat" : "continuous";
    updateReadingModeChip();
    renderAndSave();
  });
  document.getElementById("expandTafsir").addEventListener("click", (event) => {
    event.stopPropagation();
    document.getElementById("mainArea").classList.toggle("tafsir-expanded");
  });
  document.getElementById("locator").addEventListener("click", () => openPicker({ state, onChange: () => { renderAndSave(); resetTafsirPanel(); } }));
}

function setFocusMode(enabled) {
  document.body.classList.toggle("focus-mode", enabled);
  document.documentElement.classList.toggle("focus-mode", enabled);
  const controls = document.getElementById("focusControls");
  if (controls) controls.hidden = !enabled;
  refreshWirdWidget().catch?.(console.warn);
  if (enabled) {
    document.getElementById("mainArea")?.classList.remove("tafsir-expanded");
    resetTafsirPanel();
    initFocusInfiniteScroll();
    toast("تم تفعيل وضع التركيز. القراءة الآن بالتمرير المستمر.");
  } else {
    destroyFocusInfiniteScroll();
    renderAndSave();
  }
}

function initFocusInfiniteScroll() {
  if (!state.data) return;
  destroyFocusInfiniteScroll(false);
  const reader = document.getElementById("reader");
  const currentUnit = getCurrentUnitAyahs(state);
  renderFocusReader(state, currentUnit);

  focusScrollState = {
    startPointer: clonePointer(state.pointer),
    endPointer: clonePointer(state.pointer),
    loadingNext: false,
    loadingPrev: false,
    reachedEnd: false,
    reachedStart: false,
    loadedKeys: new Set([unitKey(currentUnit)])
  };

  focusScrollHandler = () => {
    if (!document.body.classList.contains("focus-mode")) return;
    const nearBottom = reader.scrollTop + reader.clientHeight >= reader.scrollHeight - Math.max(420, reader.clientHeight * 0.45);
    const nearTop = reader.scrollTop <= 80;
    if (nearBottom) loadNextFocusUnit();
    if (nearTop) loadPreviousFocusUnit();
  };

  reader.addEventListener("scroll", focusScrollHandler, { passive: true });
  reader.addEventListener("wheel", focusScrollHandler, { passive: true });
  reader.addEventListener("touchmove", focusScrollHandler, { passive: true });

  requestAnimationFrame(() => {
    reader.scrollTop = 0;
    fillFocusViewport();
  });
}

function destroyFocusInfiniteScroll(shouldNull = true) {
  const reader = document.getElementById("reader");
  if (focusScrollHandler) {
    reader.removeEventListener("scroll", focusScrollHandler);
    reader.removeEventListener("wheel", focusScrollHandler);
    reader.removeEventListener("touchmove", focusScrollHandler);
  }
  focusScrollHandler = null;
  if (shouldNull) focusScrollState = null;
}

async function fillFocusViewport() {
  const reader = document.getElementById("reader");
  let guard = 0;
  while (document.body.classList.contains("focus-mode") && reader.scrollHeight <= reader.clientHeight + 160 && guard < 8) {
    const loaded = await loadNextFocusUnit();
    if (!loaded) break;
    guard++;
  }
}

async function loadNextFocusUnit() {
  if (!focusScrollState || focusScrollState.loadingNext || focusScrollState.reachedEnd) return false;
  focusScrollState.loadingNext = true;
  try {
    const tempState = cloneStateForPointer(focusScrollState.endPointer);
    const before = JSON.stringify(tempState.pointer);
    stepPointer(tempState, +1);
    if (before === JSON.stringify(tempState.pointer)) {
      focusScrollState.reachedEnd = true;
      return false;
    }
    const unit = getCurrentUnitAyahs(tempState);
    const key = unitKey(unit);
    if (!unit.length || focusScrollState.loadedKeys.has(key)) {
      focusScrollState.reachedEnd = true;
      return false;
    }
    appendFocusUnit(state, unit, "end");
    focusScrollState.loadedKeys.add(key);
    focusScrollState.endPointer = clonePointer(tempState.pointer);
    state.pointer = clonePointer(tempState.pointer);
    savePointer(state.pointer);
    resetTafsirPanel();
    recordCurrentReadingProgress().catch(console.warn);
    requestAnimationFrame(() => fillFocusViewport());
    return true;
  } finally {
    focusScrollState.loadingNext = false;
  }
}

async function loadPreviousFocusUnit() {
  if (!focusScrollState || focusScrollState.loadingPrev || focusScrollState.reachedStart) return false;
  const reader = document.getElementById("reader");
  if (reader.scrollTop > 80) return false;
  focusScrollState.loadingPrev = true;
  try {
    const tempState = cloneStateForPointer(focusScrollState.startPointer);
    const before = JSON.stringify(tempState.pointer);
    stepPointer(tempState, -1);
    if (before === JSON.stringify(tempState.pointer)) {
      focusScrollState.reachedStart = true;
      return false;
    }
    const unit = getCurrentUnitAyahs(tempState);
    const key = unitKey(unit);
    if (!unit.length || focusScrollState.loadedKeys.has(key)) {
      focusScrollState.reachedStart = true;
      return false;
    }
    const oldHeight = reader.scrollHeight;
    appendFocusUnit(state, unit, "start");
    focusScrollState.loadedKeys.add(key);
    focusScrollState.startPointer = clonePointer(tempState.pointer);
    requestAnimationFrame(() => {
      const delta = reader.scrollHeight - oldHeight;
      reader.scrollTop = delta + 4;
    });
    return true;
  } finally {
    focusScrollState.loadingPrev = false;
  }
}

function cloneStateForPointer(pointer) {
  return {
    ...state,
    pointer: clonePointer(pointer),
    settings: state.settings,
    data: state.data,
    indexByGlobal: state.indexByGlobal,
    indexByPage: state.indexByPage,
    indexByJuz: state.indexByJuz,
    indexByHizbQuarter: state.indexByHizbQuarter
  };
}

function clonePointer(pointer) {
  return { ...pointer };
}

function unitKey(unit) {
  if (!unit?.length) return "empty";
  return `${state.settings.mode}:${unit[0].number}-${unit[unit.length - 1].number}`;
}

function step(dir, options = {}) {
  if (!state.data) return false;
  const before = JSON.stringify(state.pointer);
  stepPointer(state, dir);
  const moved = before !== JSON.stringify(state.pointer);
  renderAndSave();
  if (moved) {
    resetTafsirPanel();
    recordCurrentReadingProgress().catch(console.warn);
  }

  // Manual next/previous while audio is running should restart playback from the new unit,
  // regardless of continuous/repeat mode. Audio-driven stepping handles playback itself.
  if (!options.fromAudio && state.isPlaying) {
    audioService.playUnit(getCurrentUnitAyahs(state), 0);
  }
  return moved;
}

function onGoToAyah(ayah) {
  if (!ayah) return;
  state.settings.mode = "ayah";
  syncPointerFromAyah(state, ayah);
  renderAndSave();
  resetTafsirPanel();
  recordCurrentReadingProgress().catch(console.warn);
  setTimeout(() => markSelectedAyah(ayah), 0);
}

function normalizePointer() {
  const max = state.indexByGlobal.length || 1;
  state.pointer.ayahGlobal = Math.max(1, Math.min(max, state.pointer.ayahGlobal || 1));
  const ayah = state.indexByGlobal[state.pointer.ayahGlobal - 1];
  if (ayah) syncPointerFromAyah(state, ayah);
}

function renderAndSave() {
  if (document.body.classList.contains("focus-mode")) {
    saveSettings(state.settings);
    savePointer(state.pointer);
    updateReadingModeChip();
    refreshNotificationSchedule();
    refreshWirdWidget().catch?.(console.warn);
    return;
  }
  renderReader(state);
  saveSettings(state.settings);
  savePointer(state.pointer);
  updateReadingModeChip();
  refreshNotificationSchedule();
  refreshWirdWidget().catch?.(console.warn);
}

function startReadingTimer() {
  setInterval(async () => {
    if (document.hidden || !state.data) return;
    const now = Date.now();
    const seconds = Math.round((now - lastReadingSecondsFlush) / 1000);
    lastReadingSecondsFlush = now;
    if (seconds < 20) return;
    try {
      await addReadingSeconds(Math.min(seconds, 90));
      await refreshWirdWidget();
    } catch (error) {
      console.warn("Unable to update reading time", error);
    }
  }, 30000);

  document.addEventListener("visibilitychange", () => {
    lastReadingSecondsFlush = Date.now();
  });
}

function updateReadingModeChip() {
  const chip = document.getElementById("readingModeChip");
  if (!chip) return;
  const text = state.settings.readingMode === "repeat" ? `تكرار الوحدة (×${state.settings.repeat})` : "قراءة مستمرة";
  chip.textContent = `وضع: ${text}`;
}

init();
