import { getCurrentUnitAyahs } from "../../services/quran-service.js";
import { escapeHTML } from "../../core/dom.js";
import { fmtNum } from "../../utils/numbers.js";
import { sanitizedTaj } from "../../utils/arabic.js";

export function applyTheme(settings) {
  const root = document.documentElement;
  root.style.setProperty("--quran-font", settings.quranFont);
  root.style.setProperty("--quran-size", `${settings.quranSize}px`);
  root.classList.remove("theme-paper", "theme-amoled", "theme-green");
  root.style.removeProperty("--bg");
  root.style.removeProperty("--paper");
  root.style.removeProperty("--ink");
  root.style.removeProperty("--muted");
  root.style.removeProperty("--card");
  root.style.removeProperty("--line");
  root.style.removeProperty("--soft");
  root.style.removeProperty("--soft-strong");
  root.style.removeProperty("--surface");
  root.style.removeProperty("--surface-2");
  root.style.removeProperty("--field-bg");
  root.style.removeProperty("--field-ink");
  root.style.removeProperty("--field-muted");
  root.style.removeProperty("--option-bg");
  root.style.removeProperty("--option-ink");
  root.style.removeProperty("--overlay");
  root.style.colorScheme = "dark";

  if (settings.theme !== "dark") root.classList.add(`theme-${settings.theme}`);

  if (settings.paperColor) {
    applyCustomPaperColor(root, settings.paperColor);
  } else {
    root.style.colorScheme = settings.theme === "paper" ? "light" : "dark";
  }
}

function applyCustomPaperColor(root, hex) {
  const dark = isDarkColor(hex);
  root.style.colorScheme = dark ? "dark" : "light";
  root.style.setProperty("--paper", hex);
  root.style.setProperty("--bg", dark ? "#07090c" : "#d9cfbc");
  root.style.setProperty("--ink", dark ? "#f7f9fc" : "#14120f");
  root.style.setProperty("--muted", dark ? "#aeb8c5" : "#665b49");
  root.style.setProperty("--card", dark ? "#0d1014" : "#fff9ed");
  root.style.setProperty("--line", dark ? "rgba(255,255,255,.14)" : "rgba(32,24,15,.16)");
  root.style.setProperty("--soft", dark ? "rgba(255,255,255,.06)" : "rgba(32,24,15,.055)");
  root.style.setProperty("--soft-strong", dark ? "rgba(255,255,255,.14)" : "rgba(32,24,15,.12)");
  root.style.setProperty("--surface", dark ? "rgba(255,255,255,.075)" : "rgba(255,255,255,.46)");
  root.style.setProperty("--surface-2", dark ? "rgba(255,255,255,.115)" : "rgba(255,255,255,.66)");
  root.style.setProperty("--field-bg", dark ? "#151922" : "#fffaf0");
  root.style.setProperty("--field-ink", dark ? "#f8fafc" : "#20180f");
  root.style.setProperty("--field-muted", dark ? "#aab4c3" : "#75634c");
  root.style.setProperty("--option-bg", dark ? "#151922" : "#fffaf0");
  root.style.setProperty("--option-ink", dark ? "#f8fafc" : "#20180f");
  root.style.setProperty("--overlay", dark ? "rgba(0,0,0,.68)" : "rgba(32,24,15,.34)");
}

function isDarkColor(hex) {
  const normalized = String(hex || "#000000").replace("#", "");
  if (normalized.length !== 6) return true;
  const r = parseInt(normalized.slice(0, 2), 16);
  const g = parseInt(normalized.slice(2, 4), 16);
  const b = parseInt(normalized.slice(4, 6), 16);
  const luminance = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  return luminance < 0.52;
}

export function renderReader(state) {
  applyTheme(state.settings);
  const content = document.getElementById("content");
  const bismillah = document.getElementById("bismillah");
  const surahTitle = document.getElementById("surahTitle");
  const locator = document.getElementById("locator");
  const reader = document.getElementById("reader");
  reader.scrollTop = 0;
  content.innerHTML = "";
  bismillah.hidden = true;
  surahTitle.hidden = true;

  const unit = getCurrentUnitAyahs(state);
  if (!unit.length) {
    content.innerHTML = `<p class="muted-text">لم يتم العثور على بيانات للعرض.</p>`;
    locator.textContent = "لا توجد بيانات";
    return;
  }

  const first = unit[0];
  updateLocator(state, unit, locator);
  if (shouldShowBismillah(state, unit)) bismillah.hidden = false;
  if (state.settings.mode === "surah") {
    surahTitle.textContent = state.data[state.pointer.surah - 1]?.name || first.sName || "سورة";
    surahTitle.hidden = false;
  }

  const wrapperClass = state.settings.mode === "ayah" ? "ayah" : "unit-block";
  content.innerHTML = `<div class="${wrapperClass}">${unit.map(a => renderAyahSpan(a, state.settings.showTajweed)).join(" ")}</div>`;
}

export function renderAyahSpan(ayah, showTajweed) {
  const raw = showTajweed ? sanitizedTaj(ayah.qpc_tajweed_text || ayah.text) : escapeHTML(ayah.text || "");
  return `<span class="ayah-item" data-surah="${ayah.surah}" data-ayah="${ayah.numberInSurah}" data-global="${ayah.number}">${raw}<span class="ayah-num">${fmtNum(ayah.numberInSurah)}</span></span>`;
}

function updateLocator(state, unit, locator) {
  const mode = state.settings.mode;
  const first = unit[0];
  if (mode === "ayah") locator.textContent = `${first.sName || state.data[first.surah - 1]?.name || "سورة"} • آية ${fmtNum(first.numberInSurah)}`;
  else if (mode === "surah") locator.textContent = `${state.data[state.pointer.surah - 1]?.name || first.sName} • سورة كاملة`;
  else if (mode === "page") locator.textContent = `صفحة ${fmtNum(state.pointer.page)}`;
  else if (mode === "juz") locator.textContent = `جزء ${fmtNum(state.pointer.juz)}`;
  else if (mode === "hizb") {
    const labels = ["ربع", "نصف", "ثلاثة أرباع", "حزب كامل"];
    const label = labels[(state.settings.hizbPart || 1) - 1] || "حزب";
    locator.textContent = `حزب ${fmtNum(Math.ceil(state.pointer.hizbQuarter / 4))} • ${label}`;
  }
}

function shouldShowBismillah(state, unit) {
  const first = unit[0];
  if (!first) return false;
  if (state.settings.mode === "surah") return state.pointer.surah !== 1 && state.pointer.surah !== 9;
  return first.numberInSurah === 1 && first.surah !== 1 && first.surah !== 9;
}


export function renderFocusUnitHTML(state, unit) {
  if (!unit?.length) return "";
  const first = unit[0];
  const mode = state.settings.mode;
  const label = getFocusUnitLabel(state, unit);
  const bismillah = shouldShowBismillahForUnit(unit) ? `<div class="bismillah focus-bismillah">﷽</div>` : "";
  const wrapperClass = mode === "ayah" ? "ayah" : "unit-block";
  return `
    <article class="focus-unit" data-mode="${mode}" data-start="${first.number}" data-end="${unit[unit.length - 1]?.number || first.number}">
      <div class="focus-unit-label">${escapeHTML(label)}</div>
      ${bismillah}
      <div class="${wrapperClass}">${unit.map(a => renderAyahSpan(a, state.settings.showTajweed)).join(" ")}</div>
    </article>
  `;
}

export function renderFocusReader(state, unit) {
  applyTheme(state.settings);
  const content = document.getElementById("content");
  const bismillah = document.getElementById("bismillah");
  const surahTitle = document.getElementById("surahTitle");
  const locator = document.getElementById("locator");
  const reader = document.getElementById("reader");
  bismillah.hidden = true;
  surahTitle.hidden = true;
  if (!unit?.length) {
    content.innerHTML = `<p class="muted-text">لم يتم العثور على بيانات للعرض.</p>`;
    return;
  }
  updateLocator(state, unit, locator);
  content.innerHTML = renderFocusUnitHTML(state, unit);
  reader.scrollTop = 0;
}

export function appendFocusUnit(state, unit, position = "end") {
  const content = document.getElementById("content");
  const html = renderFocusUnitHTML(state, unit);
  if (!html) return;
  if (position === "start") content.insertAdjacentHTML("afterbegin", html);
  else content.insertAdjacentHTML("beforeend", html);
}

function getFocusUnitLabel(state, unit) {
  const first = unit[0];
  const last = unit[unit.length - 1] || first;
  const mode = state.settings.mode;
  const surahName = first.sName || state.data?.[first.surah - 1]?.name || "سورة";
  if (mode === "ayah") return `${surahName} • آية ${fmtNum(first.numberInSurah)}`;
  if (mode === "surah") return `${surahName} • سورة كاملة`;
  if (mode === "page") return `صفحة ${fmtNum(first.page || state.pointer.page)}`;
  if (mode === "juz") return `جزء ${fmtNum(first.juz || state.pointer.juz)}`;
  if (mode === "hizb") {
    const labels = ["ربع", "نصف", "ثلاثة أرباع", "حزب كامل"];
    const label = labels[(state.settings.hizbPart || 1) - 1] || "حزب";
    return `حزب ${fmtNum(Math.ceil((first.hizbQuarter || state.pointer.hizbQuarter) / 4))} • ${label}`;
  }
  if (first.surah === last.surah && first.numberInSurah !== last.numberInSurah) {
    return `${surahName} • من آية ${fmtNum(first.numberInSurah)} إلى ${fmtNum(last.numberInSurah)}`;
  }
  return `${surahName} • آية ${fmtNum(first.numberInSurah)}`;
}

function shouldShowBismillahForUnit(unit) {
  const first = unit?.[0];
  return !!first && first.numberInSurah === 1 && first.surah !== 1 && first.surah !== 9;
}

export function markSelectedAyah(ayah) {
  document.querySelectorAll(".ayah-item.selected").forEach(el => el.classList.remove("selected"));
  if (!ayah) return;
  document.querySelector(`.ayah-item[data-surah="${ayah.surah}"][data-ayah="${ayah.numberInSurah}"]`)?.classList.add("selected");
}

export function markPlayingAyah(ayah) {
  document.querySelectorAll(".ayah-item.playing").forEach(el => el.classList.remove("playing"));
  if (!ayah) return;
  const el = document.querySelector(`.ayah-item[data-surah="${ayah.surah}"][data-ayah="${ayah.numberInSurah}"]`);
  if (!el) return;
  el.classList.add("playing");
  // Keep the currently recited ayah visible during page/surah/juz playback.
  el.scrollIntoView({ block: "center", inline: "nearest", behavior: "smooth" });
}
