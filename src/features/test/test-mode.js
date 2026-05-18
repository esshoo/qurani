import { ModalManager } from "../../core/modal-manager.js";
import { escapeHTML, toast } from "../../core/dom.js";
import { saveTestResult } from "../../core/storage.js";
import { getCurrentUnitAyahs } from "../../services/quran-service.js";
import { fmtNum } from "../../utils/numbers.js";
import { normalize } from "../../utils/arabic-normalizer.js";

let appState = null;
let currentAyahs = [];
let latestResults = null;

export function initTestMode({ state } = {}) {
  appState = state;
  document.getElementById("btnTest")?.addEventListener("click", () => openTestMode({ state: appState }));
}

export function openTestMode({ state = appState, ayah = null } = {}) {
  appState = state || appState;
  if (!appState?.data) return;
  const content = document.getElementById("testContent");
  if (!content) return;
  const startAyah = ayah || getCurrentUnitAyahs(appState)[0] || appState.indexByGlobal[appState.pointer.ayahGlobal - 1];
  if (!startAyah) {
    toast("لا توجد آية متاحة للاختبار.");
    return;
  }

  content.innerHTML = renderSetup(startAyah);
  wireSetup(content, startAyah);
  ModalManager.open("testModal", { closeOnBackdrop: true, closeOnBack: true });
}

function renderSetup(startAyah) {
  return `
    <div class="test-mode-shell">
      <section class="test-card test-intro-card">
        <div class="test-card-head">
          <h4>وضع الاختبار</h4>
          <span class="status-pill">${escapeHTML(startAyah.sName || "")} • آية ${fmtNum(startAyah.numberInSurah)}</span>
        </div>
        <p class="muted-text">اختر نطاق الاختبار. سيظهر شكل ومكان الآيات بدون نص، ثم تكتب من حفظك وتضغط تصحيح.</p>
        <div class="settings-grid compact-grid">
          <div class="field">
            <label>نطاق الاختبار</label>
            <select id="testScope">
              <option value="ayah">الآية المحددة فقط</option>
              <option value="count">عدد آيات من الآية المحددة</option>
              <option value="page">الصفحة كاملة</option>
              <option value="current">المعروض على الشاشة</option>
            </select>
          </div>
          <div class="field" id="testCountField" hidden>
            <label>عدد الآيات</label>
            <input id="testAyahCount" type="number" min="1" max="40" value="3">
          </div>
          <div class="field">
            <label>طريقة التصحيح</label>
            <select id="testStrictness">
              <option value="flexible" selected>مرن: يتجاهل التشكيل وبعض فروق الكتابة</option>
              <option value="strict">صارم: أقرب للنص كما هو</option>
            </select>
          </div>
          <label class="field checkbox-field">
            <input id="testShowFirstWord" type="checkbox">
            <span>إظهار أول كلمة كتلميح</span>
          </label>
          <label class="field checkbox-field">
            <input id="testShowWordCount" type="checkbox" checked>
            <span>إظهار عدد الكلمات</span>
          </label>
          <label class="field checkbox-field" title="يتجاهل اختلاف المسافات بين الكلمات، مفيد لو التصقت كلمتان أثناء الكتابة">
            <input id="testIgnoreSpaces" type="checkbox" checked>
            <span>تجاهل المسافات في التصحيح</span>
          </label>
        </div>
        <div class="modal-actions sticky-actions-inline">
          <button id="btnBuildTest" class="navbtn primary" type="button">ابدأ الاختبار</button>
        </div>
      </section>
      <div id="testWorkspace"></div>
    </div>
  `;
}

function wireSetup(content, startAyah) {
  const scopeEl = content.querySelector("#testScope");
  const countField = content.querySelector("#testCountField");
  scopeEl.onchange = () => {
    countField.hidden = scopeEl.value !== "count";
  };
  content.querySelector("#btnBuildTest").onclick = () => {
    const options = readOptions(content);
    currentAyahs = buildAyahSelection(startAyah, options);
    latestResults = null;
    renderWorkspace(content.querySelector("#testWorkspace"), currentAyahs, options);
  };
}

function readOptions(root) {
  return {
    scope: root.querySelector("#testScope")?.value || "ayah",
    count: Math.max(1, Math.min(40, Number(root.querySelector("#testAyahCount")?.value || 3))),
    strictness: root.querySelector("#testStrictness")?.value || "flexible",
    ignoreSpaces: !!root.querySelector("#testIgnoreSpaces")?.checked,
    showFirstWord: !!root.querySelector("#testShowFirstWord")?.checked,
    showWordCount: !!root.querySelector("#testShowWordCount")?.checked
  };
}

function buildAyahSelection(startAyah, options) {
  if (!appState?.indexByGlobal?.length) return [startAyah];
  if (options.scope === "page") return appState.indexByPage.get(startAyah.page) || [startAyah];
  if (options.scope === "current") return getCurrentUnitAyahs(appState).slice(0, 80);
  if (options.scope === "count") {
    const start = Math.max(0, Number(startAyah.number || 1) - 1);
    return appState.indexByGlobal.slice(start, start + options.count).filter(Boolean);
  }
  return [startAyah];
}

function renderWorkspace(target, ayahs, options) {
  if (!target) return;
  const label = getSelectionLabel(ayahs, options);
  target.innerHTML = `
    <section class="test-workspace-card">
      <div class="test-toolbar">
        <div>
          <h4>اختبار ${escapeHTML(label)}</h4>
          <p class="muted-text">اضغط داخل مكان كل آية واكتبها من حفظك. النص الصحيح مخفي لكنه يحافظ على مساحة الآية تقريبًا.</p>
        </div>
        <div class="test-toolbar-actions">
          <button id="btnCorrectTest" class="navbtn primary" type="button">تصحيح</button>
          <button id="btnRetryTest" class="navbtn" type="button">إعادة المحاولة</button>
          <button id="btnRevealTest" class="navbtn" type="button">إظهار الإجابة</button>
          <button id="btnSaveTest" class="navbtn" type="button" disabled>حفظ النتيجة</button>
        </div>
      </div>
      <div id="testSummary" class="test-summary" hidden></div>
      <div class="test-ayahs">
        ${ayahs.map(ayah => renderTestAyah(ayah, options)).join("")}
      </div>
    </section>
  `;

  target.querySelectorAll(".test-ayah-box").forEach(box => {
    box.addEventListener("click", () => box.querySelector("textarea")?.focus());
  });
  target.querySelector("#btnCorrectTest").onclick = () => correctTest(target, ayahs, options);
  target.querySelector("#btnRetryTest").onclick = () => renderWorkspace(target, ayahs, options);
  target.querySelector("#btnRevealTest").onclick = () => revealAnswers(target, ayahs);
  target.querySelector("#btnSaveTest").onclick = async () => saveLatestResult();
}

function renderTestAyah(ayah, options) {
  const words = tokenize(sourceTextForTest(ayah));
  const firstWord = words[0]?.display || "";
  const ghost = words.map(w => `<span class="ghost-word" style="inline-size:${Math.max(2, Math.min(14, w.display.length * 0.8))}em"></span>`).join(" ");
  return `
    <article class="test-ayah-box" data-global="${ayah.number}">
      <div class="test-ayah-meta">
        <strong>${escapeHTML(ayah.sName || "سورة")} • آية ${fmtNum(ayah.numberInSurah)}</strong>
        <span>${options.showWordCount ? `${fmtNum(words.length)} كلمة` : ""}</span>
      </div>
      <div class="test-hidden-layout" aria-hidden="true">
        ${options.showFirstWord ? `<span class="test-first-word">${escapeHTML(firstWord)}</span>` : ""}
        ${ghost}
        <span class="ayah-num">${fmtNum(ayah.numberInSurah)}</span>
      </div>
      <textarea class="test-answer" dir="rtl" rows="3" placeholder="اكتب الآية هنا من حفظك..."></textarea>
      <div class="test-result" hidden></div>
    </article>
  `;
}

function correctTest(target, ayahs, options) {
  const perAyah = ayahs.map(ayah => {
    const box = target.querySelector(`.test-ayah-box[data-global="${ayah.number}"]`);
    const userText = box?.querySelector("textarea")?.value || "";
    const result = compareAyah(ayah, userText, options);
    renderAyahCorrection(box, result);
    return {
      surah: ayah.surah,
      surahName: ayah.sName || "",
      ayah: ayah.numberInSurah,
      ayahGlobal: ayah.number,
      page: ayah.page,
      score: result.score,
      correctWords: result.correctCount,
      totalWords: result.totalExpected,
      wrongWords: result.wrongWords,
      missingWords: result.missingWords,
      extraWords: result.extraWords,
      userText
    };
  });

  const totalWords = perAyah.reduce((sum, item) => sum + item.totalWords, 0);
  const correctWords = perAyah.reduce((sum, item) => sum + item.correctWords, 0);
  const score = totalWords ? Math.round((correctWords / totalWords) * 100) : 0;
  const needsReview = perAyah.filter(item => item.score < 85).length;
  const allWrong = uniqueWords(perAyah.flatMap(item => item.wrongWords));
  latestResults = {
    id: `test_${Date.now()}_${Math.random().toString(16).slice(2)}`,
    kind: "memorization-test",
    scope: options.scope,
    strictness: options.strictness,
    ignoreSpaces: !!options.ignoreSpaces,
    label: getSelectionLabel(ayahs, options),
    score,
    totalWords,
    correctWords,
    ayahs: perAyah,
    wrongWords: allWrong,
    createdAt: new Date().toISOString()
  };

  const summary = target.querySelector("#testSummary");
  if (summary) {
    summary.hidden = false;
    summary.innerHTML = `
      <div class="stats-grid compact-stats">
        <div class="stat-tile"><strong>${fmtNum(score)}%</strong><span>إجمالي الاختبار</span></div>
        <div class="stat-tile"><strong>${fmtNum(correctWords)} / ${fmtNum(totalWords)}</strong><span>كلمات صحيحة</span></div>
        <div class="stat-tile"><strong>${fmtNum(needsReview)}</strong><span>آيات تحتاج مراجعة</span></div>
        <div class="stat-tile"><strong>${fmtNum(allWrong.length)}</strong><span>كلمات أخطأت فيها</span></div>
      </div>
      ${allWrong.length ? `<p class="muted-text">أكثر كلمات تحتاج مراجعة: ${allWrong.slice(0, 12).map(escapeHTML).join("، ")}</p>` : `<p class="muted-text">ما شاء الله، لا توجد كلمات خاطئة واضحة في هذا الاختبار.</p>`}
    `;
  }
  target.querySelector("#btnSaveTest").disabled = false;
  toast("تم التصحيح. راجع النتائج واحفظها إذا أردت.");
}

function renderAyahCorrection(box, result) {
  if (!box) return;
  const holder = box.querySelector(".test-result");
  if (!holder) return;
  holder.hidden = false;
  const feedback = result.segments.map(seg => {
    if (seg.type === "correct") return `<span class="word-chip correct">${escapeHTML(seg.expected)}</span>`;
    if (seg.type === "wrong") return `<span class="word-chip wrong"><span>${escapeHTML(seg.user || "—")}</span><small>الصحيح: ${escapeHTML(seg.expected)}</small></span>`;
    if (seg.type === "missing") return `<span class="word-chip missing"><span>ناقص</span><small>${escapeHTML(seg.expected)}</small></span>`;
    if (seg.type === "extra") return `<span class="word-chip extra"><span>زائد</span><small>${escapeHTML(seg.user)}</small></span>`;
    return "";
  }).join(" ");
  holder.innerHTML = `
    <div class="test-ayah-score ${result.score >= 90 ? "good" : result.score >= 70 ? "mid" : "low"}">
      نسبة الآية: ${fmtNum(result.score)}% • الصحيح ${fmtNum(result.correctCount)} / ${fmtNum(result.totalExpected)} كلمة
    </div>
    <div class="test-word-feedback">${feedback}</div>
  `;
}

function revealAnswers(target, ayahs) {
  ayahs.forEach(ayah => {
    const box = target.querySelector(`.test-ayah-box[data-global="${ayah.number}"]`);
    const holder = box?.querySelector(".test-result");
    if (!holder) return;
    holder.hidden = false;
    holder.innerHTML = `
      <div class="test-ayah-score mid">الإجابة الصحيحة</div>
      <p class="test-correct-text">${escapeHTML(ayah.text || "")}</p>
      <p class="muted-text">النص المستخدم في التصحيح: ${escapeHTML(sourceTextForTest(ayah))}</p>
    `;
  });
}

async function saveLatestResult() {
  if (!latestResults) return;
  try {
    await saveTestResult(latestResults);
    toast("تم حفظ نتيجة الاختبار في مكتبتي.");
  } catch (error) {
    console.error(error);
    toast("تعذر حفظ نتيجة الاختبار.");
  }
}

function compareAyah(ayah, userText, options = {}) {
  const expectedSource = sourceTextForTest(ayah);
  const expected = tokenize(expectedSource);
  const user = tokenize(userText);

  if (options.ignoreSpaces) {
    return compareAyahIgnoringSpaces({ expectedSource, expected, user, userText, options });
  }

  const expectedNorm = expected.map(w => normalizeWord(w.display, options));
  const userNorm = user.map(w => normalizeWord(w.display, options));
  const matches = lcsMatches(expectedNorm, userNorm);
  const segments = [];
  let eCursor = 0;
  let uCursor = 0;
  let correctCount = 0;

  for (const match of matches) {
    flushUnmatchedSegment(segments, expected, user, eCursor, match.i, uCursor, match.j);
    segments.push({ type: "correct", expected: expected[match.i].display, user: user[match.j].display });
    correctCount++;
    eCursor = match.i + 1;
    uCursor = match.j + 1;
  }
  flushUnmatchedSegment(segments, expected, user, eCursor, expected.length, uCursor, user.length);

  return buildCompareResult({ expected, segments, correctCount, expectedSource });
}

function compareAyahIgnoringSpaces({ expectedSource, expected, user, userText, options }) {
  const expectedNorm = expected.map(w => normalizeWord(w.display, options)).filter(Boolean);
  const userNormWords = user.map(w => normalizeWord(w.display, options)).filter(Boolean);
  const userCompact = userNormWords.join("");
  const expectedCompact = expectedNorm.join("");

  if (!expected.length) {
    return { score: 0, correctCount: 0, totalExpected: 0, segments: [], wrongWords: [], missingWords: [], extraWords: [], expectedSource };
  }

  if (expectedCompact && expectedCompact === userCompact) {
    const segments = expected.map(w => ({ type: "correct", expected: w.display, user: w.display }));
    return buildCompareResult({ expected, segments, correctCount: expected.length, expectedSource });
  }

  const segments = [];
  let pos = 0;
  let correctCount = 0;

  for (let i = 0; i < expected.length; i++) {
    const word = expectedNorm[i] || "";
    if (!word) continue;

    if (userCompact.startsWith(word, pos)) {
      segments.push({ type: "correct", expected: expected[i].display, user: expected[i].display });
      pos += word.length;
      correctCount++;
      continue;
    }

    const futureAtCurrent = findFutureWordAtPosition(expectedNorm, i + 1, userCompact, pos);
    if (futureAtCurrent !== -1) {
      segments.push({ type: "missing", expected: expected[i].display });
      continue;
    }

    const sameWordLater = userCompact.indexOf(word, pos + 1);
    if (sameWordLater !== -1 && sameWordLater - pos <= 24) {
      const extra = userCompact.slice(pos, sameWordLater);
      if (extra) segments.push({ type: "extra", user: extra });
      segments.push({ type: "correct", expected: expected[i].display, user: expected[i].display });
      pos = sameWordLater + word.length;
      correctCount++;
      continue;
    }

    const nextAnchor = findNextAnchorPosition(expectedNorm, i + 1, userCompact, pos);
    const end = nextAnchor === -1 ? Math.min(userCompact.length, pos + Math.max(word.length, 1)) : nextAnchor;
    const wrongSlice = userCompact.slice(pos, end);
    segments.push({ type: "wrong", expected: expected[i].display, user: wrongSlice || "—" });
    pos = end;
  }

  if (pos < userCompact.length) {
    segments.push({ type: "extra", user: userCompact.slice(pos) });
  }

  return buildCompareResult({ expected, segments, correctCount, expectedSource });
}

function findFutureWordAtPosition(expectedNorm, startIndex, userCompact, pos) {
  for (let i = startIndex; i < expectedNorm.length; i++) {
    if (expectedNorm[i] && userCompact.startsWith(expectedNorm[i], pos)) return i;
  }
  return -1;
}

function findNextAnchorPosition(expectedNorm, startIndex, userCompact, pos) {
  let best = -1;
  for (let i = startIndex; i < expectedNorm.length; i++) {
    const word = expectedNorm[i];
    if (!word) continue;
    const found = userCompact.indexOf(word, pos + 1);
    if (found !== -1 && (best === -1 || found < best)) best = found;
  }
  return best;
}

function buildCompareResult({ expected, segments, correctCount, expectedSource }) {
  const wrongWords = segments.filter(s => s.type === "wrong").map(s => s.expected);
  const missingWords = segments.filter(s => s.type === "missing").map(s => s.expected);
  const extraWords = segments.filter(s => s.type === "extra").map(s => s.user);
  const totalExpected = expected.length;
  const score = totalExpected ? Math.max(0, Math.round((correctCount / totalExpected) * 100)) : 0;
  return { score, correctCount, totalExpected, segments, wrongWords, missingWords, extraWords, expectedSource };
}

function flushUnmatchedSegment(segments, expected, user, eStart, eEnd, uStart, uEnd) {
  const eLen = Math.max(0, eEnd - eStart);
  const uLen = Math.max(0, uEnd - uStart);
  const pairs = Math.min(eLen, uLen);
  for (let k = 0; k < pairs; k++) {
    segments.push({ type: "wrong", expected: expected[eStart + k]?.display || "", user: user[uStart + k]?.display || "" });
  }
  for (let i = eStart + pairs; i < eEnd; i++) segments.push({ type: "missing", expected: expected[i]?.display || "" });
  for (let j = uStart + pairs; j < uEnd; j++) segments.push({ type: "extra", user: user[j]?.display || "" });
}

function lcsMatches(a, b) {
  const rows = a.length + 1;
  const cols = b.length + 1;
  const dp = Array.from({ length: rows }, () => Array(cols).fill(0));
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      dp[i][j] = a[i] && a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  const matches = [];
  let i = 0, j = 0;
  while (i < a.length && j < b.length) {
    if (a[i] && a[i] === b[j]) {
      matches.push({ i, j });
      i++; j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) i++;
    else j++;
  }
  return matches;
}

function sourceTextForTest(ayah) {
  return String(
    ayah?.imlaei_simple_text ||
    ayah?.imlaei ||
    ayah?.simpleText ||
    ayah?.cleanText ||
    ayah?.text ||
    ""
  ).replace(/<[^>]*>/g, " ");
}

function tokenize(text) {
  return String(text || "")
    .replace(/<[^>]*>/g, " ")
    .replace(/[\u06D6-\u06ED۝﴾﴿()\[\]{}.,،؛:!؟\-ـ\u0640\u202F]/g, " ")
    .split(/\s+/)
    .map(w => w.trim())
    .filter(Boolean)
    .map(display => ({ display }));
}

function normalizeWord(word, options = {}) {
  let value = String(word || "").trim();
  const strict = options.strictness === "strict";

  if (strict) {
    return value
      .replace(/<[^>]*>/g, "")
      .replace(/[\u06D6-\u06ED۝﴾﴿()\[\]{}.,،؛:!؟\-ـ\u0640\u202F\s]/g, "");
  }

  value = normalize(value, {
    ignoreMarks: true,
    ignoreDots: false,
    ignoreSmallLetters: true,
  }).text;

  return value
    .replace(/<[^>]*>/g, "")
    .replace(/[\u06D6-\u06ED۝﴾﴿()\[\]{}.,،؛:!؟\-ـ\u0640\u202F\s]/g, "")
    .replace(/[أإآٱ]/g, "ا")
    .replace(/ؤ/g, "و")
    .replace(/ئ/g, "ي")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه");
}

function getSelectionLabel(ayahs, options) {
  if (!ayahs.length) return "اختبار";
  if (options.scope === "page") return `صفحة ${fmtNum(ayahs[0].page || 1)}`;
  if (ayahs.length === 1) return `${ayahs[0].sName || "سورة"} - آية ${fmtNum(ayahs[0].numberInSurah)}`;
  return `${fmtNum(ayahs.length)} آيات من ${ayahs[0].sName || "سورة"} آية ${fmtNum(ayahs[0].numberInSurah)}`;
}

function uniqueWords(words) {
  return [...new Set((words || []).filter(Boolean).map(String))];
}
