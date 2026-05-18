import { ModalManager } from "../../core/modal-manager.js";
import { escapeHTML } from "../../core/dom.js";
import { fmtNum } from "../../utils/numbers.js";
import { syncPointerFromAyah } from "../../services/quran-service.js";

const HIZB_PART_LABELS = ["ربع", "نصف", "ثلاثة أرباع", "حزب كامل"];

export function openPicker({ state, onChange }) {
  const content = document.getElementById("pickerContent");
  const mode = state.settings.mode;

  if (mode === "ayah") renderAyahPicker(content, state, onChange);
  else if (mode === "surah") renderSurahPicker(content, state, onChange);
  else if (mode === "page") renderPagePicker(content, state, onChange);
  else if (mode === "juz") renderJuzPicker(content, state, onChange);
  else if (mode === "hizb") renderHizbPicker(content, state, onChange);
  else content.innerHTML = `<p class="muted-text">وضع العرض الحالي لا يدعم التنقل السريع.</p>`;

  ModalManager.open("pickerModal", { closeOnBackdrop: true, closeOnBack: true });
}

function renderAyahPicker(content, state, onChange) {
  const currentSurah = state.pointer.surah || 1;
  const currentAyah = state.pointer.numberInSurah || 1;
  content.innerHTML = `
    <div class="picker-form">
      <div class="field">
        <label for="pickerSurah">السورة</label>
        <select id="pickerSurah">
          ${state.data.map(s => `<option value="${s.number}" ${s.number === currentSurah ? "selected" : ""}>${fmtNum(s.number)} - ${escapeHTML(s.name)}</option>`).join("")}
        </select>
      </div>
      <div class="field">
        <label for="pickerAyah">الآية</label>
        <select id="pickerAyah"></select>
      </div>
      <div class="modal-actions">
        <button id="pickerOk" class="navbtn primary" type="button">انتقال</button>
      </div>
    </div>
  `;
  const surahSelect = content.querySelector("#pickerSurah");
  const ayahSelect = content.querySelector("#pickerAyah");
  const fillAyahs = () => {
    const surah = state.data[Number(surahSelect.value) - 1];
    ayahSelect.innerHTML = (surah?.ayahs || []).map(a => `<option value="${a.numberInSurah}">آية ${fmtNum(a.numberInSurah)}</option>`).join("");
    const max = surah?.ayahs?.length || 1;
    ayahSelect.value = String(Math.min(currentAyah, max));
  };
  fillAyahs();
  surahSelect.addEventListener("change", fillAyahs);
  content.querySelector("#pickerOk").onclick = () => {
    const s = Number(surahSelect.value);
    const a = Number(ayahSelect.value);
    const ayah = state.data[s - 1]?.ayahs?.[a - 1];
    if (ayah) {
      syncPointerFromAyah(state, { ...ayah, surah: s, sName: state.data[s - 1]?.name });
      state.settings.mode = "ayah";
      ModalManager.close("pickerModal", { source: "button" });
      onChange?.();
    }
  };
}

function renderSurahPicker(content, state, onChange) {
  content.innerHTML = `
    <div class="picker-list">
      ${state.data.map(s => `<button class="picker-item ${s.number === state.pointer.surah ? "active" : ""}" data-surah="${s.number}" type="button"><span>${fmtNum(s.number)}</span><strong>${escapeHTML(s.name)}</strong></button>`).join("")}
    </div>
  `;
  content.onclick = (event) => {
    const btn = event.target.closest("[data-surah]");
    if (!btn) return;
    const s = Number(btn.dataset.surah);
    const first = state.data[s - 1]?.ayahs?.[0];
    if (first) syncPointerFromAyah(state, { ...first, surah: s, sName: state.data[s - 1]?.name });
    state.settings.mode = "surah";
    ModalManager.close("pickerModal", { source: "button" });
    onChange?.();
  };
}

function renderPagePicker(content, state, onChange) {
  const pages = [...state.indexByPage.keys()].sort((a, b) => a - b);
  renderNumberGrid(content, pages, state.pointer.page, "صفحة", "page", (page) => {
    const first = state.indexByPage.get(page)?.[0];
    if (first) syncPointerFromAyah(state, first);
    state.pointer.page = page;
    state.settings.mode = "page";
    ModalManager.close("pickerModal", { source: "button" });
    onChange?.();
  });
}

function renderJuzPicker(content, state, onChange) {
  const juz = [...state.indexByJuz.keys()].sort((a, b) => a - b);
  renderNumberGrid(content, juz, state.pointer.juz, "جزء", "juz", (num) => {
    const first = state.indexByJuz.get(num)?.[0];
    if (first) syncPointerFromAyah(state, first);
    state.pointer.juz = num;
    state.settings.mode = "juz";
    ModalManager.close("pickerModal", { source: "button" });
    onChange?.();
  });
}

function renderHizbPicker(content, state, onChange) {
  const currentHizb = Math.ceil((state.pointer.hizbQuarter || 1) / 4);
  content.innerHTML = `
    <div class="picker-form">
      <div class="field">
        <label for="pickerHizb">الحزب</label>
        <select id="pickerHizb">
          ${Array.from({ length: 60 }, (_, i) => i + 1).map(h => `<option value="${h}" ${h === currentHizb ? "selected" : ""}>حزب ${fmtNum(h)}</option>`).join("")}
        </select>
      </div>
      <div class="field">
        <label for="pickerHizbPart">الجزء داخل الحزب</label>
        <select id="pickerHizbPart">
          ${HIZB_PART_LABELS.map((label, i) => `<option value="${i + 1}" ${state.settings.hizbPart === i + 1 ? "selected" : ""}>${label}</option>`).join("")}
        </select>
      </div>
      <div class="modal-actions"><button id="pickerOk" class="navbtn primary" type="button">انتقال</button></div>
    </div>
  `;
  content.querySelector("#pickerOk").onclick = () => {
    const hizb = Number(content.querySelector("#pickerHizb").value);
    const part = Number(content.querySelector("#pickerHizbPart").value);
    state.settings.hizbPart = part;
    state.pointer.hizbQuarter = ((hizb - 1) * 4) + 1;
    const first = state.indexByHizbQuarter.get(state.pointer.hizbQuarter)?.[0];
    if (first) syncPointerFromAyah(state, first);
    state.pointer.hizbQuarter = ((hizb - 1) * 4) + 1;
    state.settings.mode = "hizb";
    ModalManager.close("pickerModal", { source: "button" });
    onChange?.();
  };
}

function renderNumberGrid(content, values, current, label, datasetName, onPick) {
  content.innerHTML = `
    <div class="picker-grid">
      ${values.map(v => `<button class="picker-number ${v === current ? "active" : ""}" data-${datasetName}="${v}" type="button">${label} ${fmtNum(v)}</button>`).join("")}
    </div>
  `;
  content.onclick = (event) => {
    const btn = event.target.closest(`[data-${datasetName}]`);
    if (!btn) return;
    onPick(Number(btn.dataset[datasetName]));
  };
}
