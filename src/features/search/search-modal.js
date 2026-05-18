import { ModalManager } from "../../core/modal-manager.js";
import { toast } from "../../core/dom.js";
import { scopeAyahs, searchQuran } from "../../services/search-service.js";
import { renderSearchResults } from "./search-renderer.js";

const SEARCH_DEBOUNCE_MS = 180;
const RESULT_LIMIT = 200;
let debounceTimer = null;

export function initSearch({ state, onGoToAyah }) {
  document.getElementById("btnSearch").addEventListener("click", () => openSearch(state, onGoToAyah));
}

function openSearch(state, onGoToAyah) {
  const content = document.getElementById("searchContent");
  content.innerHTML = `
    <div class="search-controls">
      <div class="field search-term-field">
        <label>عبارة البحث</label>
        <input id="searchTerm" type="text" placeholder="أدخل عبارة البحث مثال: كتب" autocomplete="off" />
      </div>

      <div class="field">
        <label>النطاق</label>
        <select id="searchScope">
          <option value="all">كل القرآن</option>
          <option value="surah">السورة الحالية</option>
          <option value="page">الصفحة الحالية</option>
          <option value="juz">الجزء الحالي</option>
        </select>
      </div>

      <div class="field">
        <label>الموضع في المقطع</label>
        <select id="searchPosition">
          <option title="أي موضع في المقطع" value="any" selected>أي موضع</option>
          <option title="عبارة البحث لا تتصل بما قبلها ولا بما بعدها" value="isolated">منفصل</option>
          <option title="عبارة البحث لا تتصل بما قبلها وتتصل بما بعدها" value="initial">مبتدئ</option>
          <option title="عبارة البحث تتصل بما قبلها وما بعدها" value="medial">متوسط</option>
          <option title="عبارة البحث تتصل بما قبلها ولا تتصل بما بعدها" value="final">منتهي</option>
        </select>
      </div>
    </div>

    <div class="search-options" aria-label="خيارات البحث">
      <label title="تجاهل الحركات أثناء البحث"><input id="ignoreMarks" type="checkbox" checked /> تجاهل الحركات</label>
      <label title="تجاهل نقاط الحروف أثناء البحث"><input id="ignoreDots" type="checkbox" checked /> تجاهل النقاط</label>
      <label title="تجاهل الحروف الصغيرة أثناء البحث"><input id="ignoreSmallLetters" type="checkbox" checked /> تجاهل الحروف الصغيرة</label>
      <button id="runSearch" class="navbtn" type="button">ابحث</button>
    </div>

    <div id="searchResults" class="search-results modal-scroll" aria-live="polite">
      <p class="muted-text">اكتب عبارة للبحث.</p>
    </div>
  `;

  const input = content.querySelector("#searchTerm");
  const runButton = content.querySelector("#runSearch");
  const controls = content.querySelectorAll("#searchScope, #searchPosition, #ignoreMarks, #ignoreDots, #ignoreSmallLetters");
  const results = content.querySelector("#searchResults");

  const run = () => runSearch(state, content, results, onGoToAyah);
  const debouncedRun = () => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(run, SEARCH_DEBOUNCE_MS);
  };

  input.addEventListener("input", debouncedRun);
  input.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      clearTimeout(debounceTimer);
      run();
    }
  });
  runButton.addEventListener("click", run);
  controls.forEach(el => el.addEventListener("change", debouncedRun));

  ModalManager.open("searchModal", { closeOnBackdrop: true, closeOnBack: true });
  setTimeout(() => input.focus(), 50);
}

function runSearch(state, root, resultsEl, onGoToAyah) {
  if (!state?.indexByGlobal?.length) {
    resultsEl.innerHTML = `<p class="muted-text">لم يتم تحميل بيانات القرآن بعد.</p>`;
    return;
  }

  const term = root.querySelector("#searchTerm").value.trim();
  if (!term) {
    resultsEl.innerHTML = `<p class="muted-text">اكتب عبارة للبحث.</p>`;
    return;
  }

  const options = {
    ignoreMarks: root.querySelector("#ignoreMarks").checked,
    ignoreDots: root.querySelector("#ignoreDots").checked,
    ignoreSmallLetters: root.querySelector("#ignoreSmallLetters").checked,
    position: root.querySelector("#searchPosition").value,
  };
  const scope = root.querySelector("#searchScope").value;
  const ayahs = scopeAyahs(state, scope);

  const startedAt = performance.now();
  const result = searchQuran({ ayahs, term, options, limit: RESULT_LIMIT });
  const elapsed = Math.round(performance.now() - startedAt);

  renderSearchResults(result, resultsEl, (ayah) => {
    onGoToAyah(ayah);
    ModalManager.close("searchModal", { source: "button" });
    toast(`تم الانتقال إلى ${ayah.sName} - آية ${ayah.numberInSurah}`);
  });

  if (elapsed > 120) {
    console.debug(`Quran search took ${elapsed}ms for ${ayahs.length} ayahs.`);
  }
}
