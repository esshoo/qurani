import { ModalManager } from "../../core/modal-manager.js";
import { escapeHTML, toast } from "../../core/dom.js";
import {
  calculateKhatmaStats,
  calculateWirdStats,
  getDailyProgressHistory,
  getKhatmaProgress,
  getTodayProgress,
  recordReadingProgress,
  resetTodayProgress,
  saveKhatmaProgress
} from "../../core/storage.js";
import { refreshNotificationSchedule } from "../../core/notifications.js";
import { fmtNum } from "../../utils/numbers.js";

let appState = null;
let saveSettingsCallback = null;
let completedToastShownFor = "";
let saveTimer = null;

export function initWird({ state, onSettingsChange } = {}) {
  appState = state;
  saveSettingsCallback = onSettingsChange;
  document.getElementById("btnWird")?.addEventListener("click", () => openWirdModal());
  refreshWirdWidget();
}

function normalizeWirdSettings() {
  appState.settings.wird = {
    enabled: true,
    goalType: "ayahs",
    goalValue: 10,
    showWidget: true,
    ...(appState.settings.wird || {})
  };
  appState.settings.khatma = {
    enabled: true,
    targetDays: 30,
    planType: "timed",
    showWidget: true,
    ...(appState.settings.khatma || {})
  };
}

function persistWirdSettings({ immediate = false } = {}) {
  if (!appState?.settings) return;
  normalizeWirdSettings();
  if (saveTimer) window.clearTimeout(saveTimer);
  const run = () => {
    saveSettingsCallback?.();
    refreshNotificationSchedule();
    refreshWirdWidget().catch(console.warn);
  };
  if (immediate) run();
  else saveTimer = window.setTimeout(run, 180);
}

export async function refreshWirdWidget() {
  const widget = document.getElementById("wirdWidget");
  if (!widget) return;

  const hideWidget = () => {
    widget.hidden = true;
    widget.innerHTML = "";
  };

  if (!appState?.settings || document.body.classList.contains("focus-mode")) {
    hideWidget();
    return;
  }

  normalizeWirdSettings();

  try {
    const [daily, khatma] = await Promise.all([getTodayProgress(), getKhatmaProgress()]);
    const wird = calculateWirdStats(daily, appState.settings);
    const khatmaStats = calculateKhatmaStats(khatma);
    const khatmaPlan = calculateKhatmaPlan(khatma, khatmaStats, appState.settings);

    const showWirdCard = appState.settings.wird.enabled !== false
      && appState.settings.wird.showWidget !== false
      && !wird.completed;

    const showKhatmaCard = appState.settings.khatma.enabled !== false
      && appState.settings.khatma.showWidget !== false
      && khatma?.enabled !== false
      && !khatmaStats.completed;

    maybeToastWirdCompleted(wird);

    if (!showWirdCard && !showKhatmaCard) {
      hideWidget();
      return;
    }

    widget.hidden = false;
    widget.innerHTML = `
      <button class="wird-mini-card" id="openWirdFromWidget" type="button" aria-label="فتح الورد والختمة">
        ${showWirdCard ? `
          <span class="wird-mini-section">
            <span class="wird-mini-title">ورد اليوم</span>
            <span class="wird-mini-progress">${fmtNum(wird.done)} / ${fmtNum(wird.goalValue)} ${goalTypeLabel(wird.goalType)}</span>
            <span class="wird-mini-bar" aria-hidden="true"><span style="inline-size:${Math.round(wird.ratio * 100)}%"></span></span>
          </span>
        ` : ""}
        ${showKhatmaCard ? `
          <span class="wird-mini-section">
            <span class="wird-mini-title">الختمة</span>
            <span class="wird-mini-khatma">${fmtPercent(khatmaStats.ratio)} • المتبقي تقريبًا ${fmtNum(khatmaStats.approxRemainingPages)} صفحة</span>
            ${khatmaPlan.dailyPages ? `<span class="wird-mini-khatma">ورد الختمة اليوم: ${fmtNum(khatmaPlan.dailyPages)} صفحة تقريبًا</span>` : ""}
            <span class="wird-mini-bar" aria-hidden="true"><span style="inline-size:${Math.round(khatmaStats.ratio * 100)}%"></span></span>
          </span>
        ` : ""}
      </button>
    `;
    widget.querySelector("#openWirdFromWidget")?.addEventListener("click", () => openWirdModal());
  } catch (error) {
    console.warn("Unable to refresh wird widget", error);
    hideWidget();
  }
}

export async function recordCurrentReadingProgress() {
  if (!appState?.data) return;
  const ayahs = getAyahsToRecord();
  if (!ayahs.length) return;
  await recordReadingProgress({ ayahs, pointer: appState.pointer });
  await refreshWirdWidget();
}

export async function openWirdModal() {
  if (!appState?.settings) return;
  normalizeWirdSettings();

  const content = document.getElementById("wirdContent");
  if (!content) return;

  const [daily, khatma, history] = await Promise.all([
    getTodayProgress(),
    getKhatmaProgress(),
    getDailyProgressHistory(10)
  ]);
  const wird = calculateWirdStats(daily, appState.settings);
  const khatmaStats = calculateKhatmaStats(khatma);
  const khatmaPlan = calculateKhatmaPlan(khatma, khatmaStats, appState.settings);
  const readingStats = calculateReadingStats(history, appState.settings);

  content.innerHTML = `
    <div class="wird-dashboard">
      <section class="wird-card primary-wird-card">
        <div class="wird-card-head">
          <h4>ورد اليوم</h4>
          <span class="status-pill">${wird.completed ? "مكتمل" : "قيد القراءة"}</span>
        </div>
        <div class="wird-big-number">${fmtNum(wird.done)} / ${fmtNum(wird.goalValue)} <span>${goalTypeLabel(wird.goalType)}</span></div>
        ${progressBar(wird.ratio)}
        <p class="muted-text">آخر موضع: ${formatLastAyah(daily.lastAyah)}</p>
        ${wird.completed ? `<div class="achievement-card">ما شاء الله، أتممت ورد اليوم. يمكنك مشاركة الإنجاز لاحقًا من قسم الصور بعد تجهيز قالب الإنجاز.</div>` : ""}
        <div class="modal-actions">
          <button id="btnStartWird" class="navbtn primary" type="button">ابدأ / تابع الورد</button>
          <button id="btnMarkCurrent" class="navbtn" type="button">تسجيل الموضع الحالي</button>
          <button id="btnResetTodayWird" class="navbtn danger" type="button">بدء ورد جديد اليوم</button>
        </div>
      </section>

      <section class="wird-card">
        <div class="wird-card-head">
          <h4>إحصائيات سريعة</h4>
          <span class="status-pill">${fmtNum(readingStats.streak)} يوم متتالي</span>
        </div>
        <div class="stats-grid">
          <div class="stat-tile"><strong>${fmtNum(readingStats.todayAyahs)}</strong><span>آيات اليوم</span></div>
          <div class="stat-tile"><strong>${fmtNum(readingStats.todayPages)}</strong><span>صفحات اليوم</span></div>
          <div class="stat-tile"><strong>${fmtNum(readingStats.weekPages)}</strong><span>صفحات هذا الأسبوع</span></div>
          <div class="stat-tile"><strong>${fmtNum(readingStats.weekMinutes)}</strong><span>دقائق هذا الأسبوع</span></div>
        </div>
      </section>

      <section class="wird-card">
        <div class="wird-card-head">
          <h4>إعداد الهدف اليومي</h4>
          <span class="status-pill auto-save-pill">حفظ تلقائي</span>
        </div>
        <div class="settings-grid compact-grid">
          <div class="field"><label>نوع الهدف</label><select id="wirdGoalType"><option value="ayahs">آيات</option><option value="pages">صفحات</option><option value="minutes">دقائق قراءة</option></select></div>
          <div class="field"><label>قيمة الهدف</label><input id="wirdGoalValue" type="number" min="1" max="300" value="${escapeHTML(appState.settings.wird.goalValue || 10)}"></div>
          <div class="field"><label>إظهار كارت الورد</label><select id="wirdShowWidget"><option value="true">ظاهر</option><option value="false">مخفي</option></select></div>
        </div>
        <p class="muted-text small-note">هذه القيم تُحفظ تلقائيًا فور تغييرها. إذا كان الورد مكتملًا ثم جعلت الهدف أكبر من المنجز، سيظهر الكارت مرة أخرى.</p>
      </section>

      <section class="wird-card khatma-card">
        <div class="wird-card-head">
          <h4>الختمة</h4>
          <span class="status-pill">${khatmaStats.completed ? "مكتملة" : fmtPercent(khatmaStats.ratio)}</span>
        </div>
        <div class="khatma-progress-line">
          <span>بدأت: ${formatDate(khatma.startedAt)}</span>
          <span>المتوقع: ${khatmaPlan.expectedEndLabel}</span>
        </div>
        <div class="khatma-progress-line">
          <span>الموضع الحالي: ${fmtNum(khatmaStats.current)} / ${fmtNum(khatmaStats.target)} آية</span>
          <span>المتبقي تقريبًا: ${fmtNum(khatmaStats.approxRemainingPages)} صفحة • ${fmtNum(khatmaStats.remainingAyahs)} آية</span>
        </div>
        ${progressBar(khatmaStats.ratio)}
        ${khatmaPlan.dailyPages ? `<p class="khatma-plan-box">ورد الختمة المقترح اليوم: <strong>${fmtNum(khatmaPlan.dailyPages)} صفحة</strong> تقريبًا، أو <strong>${fmtNum(khatmaPlan.dailyAyahs)} آية</strong>.</p>` : `<p class="muted-text">الختمة المفتوحة لا تحسب وردًا يوميًا تلقائيًا.</p>`}
        <div class="settings-grid compact-grid">
          <div class="field"><label>نوع الختمة</label><select id="khatmaPlanType"><option value="timed">بمدة محددة</option><option value="open">مفتوحة</option></select></div>
          <div class="field"><label>اختيار سريع</label><select id="khatmaPresetDays"><option value="7">7 أيام</option><option value="15">15 يوم</option><option value="30">30 يوم</option><option value="60">60 يوم</option><option value="custom">مدة مخصصة</option></select></div>
          <div class="field"><label>مدة الختمة بالأيام</label><input id="khatmaTargetDays" type="number" min="1" max="365" value="${escapeHTML(appState.settings.khatma.targetDays || khatma.targetDays || 30)}"></div>
          <div class="field"><label>حالة الختمة</label><select id="khatmaEnabled"><option value="true">مفعّلة</option><option value="false">متوقفة</option></select></div>
          <div class="field"><label>إظهار كارت الختمة</label><select id="khatmaShowWidget"><option value="true">ظاهر</option><option value="false">مخفي</option></select></div>
        </div>
        <p class="muted-text small-note">يمكنك بدء ختمة من البداية أو من الموضع الحالي. الختمة المفتوحة تعرض النسبة فقط بدون ورد يومي محسوب.</p>
        <div class="modal-actions">
          <button id="btnRestartKhatma" class="navbtn danger" type="button">بدء ختمة جديدة من الموضع الحالي</button>
          <button id="btnStartKhatmaFromBeginning" class="navbtn" type="button">بدء ختمة من الفاتحة</button>
          <button id="btnFinishKhatma" class="navbtn primary" type="button">إنهاء الختمة</button>
        </div>
      </section>

      <section class="wird-card">
        <h4>آخر الأيام</h4>
        ${renderHistory(history)}
      </section>
    </div>
  `;

  const setValue = (selector, value) => {
    const el = content.querySelector(selector);
    if (el) el.value = String(value);
  };

  setValue("#wirdGoalType", appState.settings.wird.goalType || "ayahs");
  setValue("#wirdShowWidget", appState.settings.wird.showWidget !== false);
  setValue("#khatmaPlanType", appState.settings.khatma.planType || khatma.planType || "timed");
  setValue("#khatmaPresetDays", presetForDays(appState.settings.khatma.targetDays || khatma.targetDays || 30));
  setValue("#khatmaEnabled", appState.settings.khatma.enabled !== false && khatma.enabled !== false);
  setValue("#khatmaShowWidget", appState.settings.khatma.showWidget !== false);

  const applyWirdFields = async ({ refreshModal = false } = {}) => {
    const goalType = content.querySelector("#wirdGoalType")?.value || "ayahs";
    const defaultGoal = goalType === "pages" ? 1 : goalType === "minutes" ? 15 : 10;
    const goalValue = Math.max(1, Number(content.querySelector("#wirdGoalValue")?.value || defaultGoal));

    appState.settings.wird = {
      ...appState.settings.wird,
      enabled: true,
      goalType,
      goalValue,
      showWidget: content.querySelector("#wirdShowWidget")?.value === "true"
    };

    appState.settings.khatma = {
      ...appState.settings.khatma,
      enabled: content.querySelector("#khatmaEnabled")?.value === "true",
      planType: content.querySelector("#khatmaPlanType")?.value || "timed",
      targetDays: Math.max(1, Number(content.querySelector("#khatmaTargetDays")?.value || 30)),
      showWidget: content.querySelector("#khatmaShowWidget")?.value === "true"
    };

    await saveKhatmaProgress({
      enabled: appState.settings.khatma.enabled,
      planType: appState.settings.khatma.planType,
      targetDays: appState.settings.khatma.targetDays
    });

    persistWirdSettings({ immediate: true });
    if (refreshModal) openWirdModal();
  };

  content.querySelector("#wirdGoalType")?.addEventListener("change", async () => {
    const type = content.querySelector("#wirdGoalType").value;
    const input = content.querySelector("#wirdGoalValue");
    if (input && (!input.value || Number(input.value) <= 0 || Number(input.value) === 10)) {
      input.value = type === "pages" ? 1 : type === "minutes" ? 15 : 10;
    }
    await applyWirdFields({ refreshModal: true });
  });

  content.querySelector("#khatmaPresetDays")?.addEventListener("change", async () => {
    const value = content.querySelector("#khatmaPresetDays")?.value || "custom";
    if (value !== "custom") {
      const input = content.querySelector("#khatmaTargetDays");
      if (input) input.value = value;
    }
    await applyWirdFields({ refreshModal: true });
  });

  ["#wirdGoalValue", "#wirdShowWidget", "#khatmaTargetDays", "#khatmaEnabled", "#khatmaShowWidget", "#khatmaPlanType"].forEach(selector => {
    const el = content.querySelector(selector);
    if (!el) return;
    el.addEventListener("input", () => applyWirdFields());
    el.addEventListener("change", () => applyWirdFields({ refreshModal: selector !== "#wirdGoalValue" }));
  });

  content.querySelector("#btnStartWird")?.addEventListener("click", async () => {
    await applyWirdFields();
    ModalManager.close("wirdModal");
    toast("ابدأ القراءة، وسيتم تسجيل تقدمك تلقائيًا.");
  });

  content.querySelector("#btnMarkCurrent")?.addEventListener("click", async () => {
    await recordCurrentReadingProgress();
    toast("تم تسجيل الموضع الحالي في ورد اليوم.");
    openWirdModal();
  });

  content.querySelector("#btnResetTodayWird")?.addEventListener("click", async () => {
    const ok = await ModalManager.askConfirm("بدء ورد جديد اليوم؟", "سيتم تصفير تقدم ورد اليوم فقط، ولن يتم حذف الملاحظات أو الختمة.");
    if (!ok) return;
    await resetTodayProgress();
    completedToastShownFor = "";
    await refreshWirdWidget();
    toast("تم بدء ورد جديد لهذا اليوم.");
    openWirdModal();
  });

  content.querySelector("#btnRestartKhatma")?.addEventListener("click", async () => {
    await applyWirdFields();
    const ok = await ModalManager.askConfirm("بدء ختمة جديدة؟", "سيتم اعتبار الموضع الحالي بداية الختمة الجديدة.");
    if (!ok) return;
    const current = Number(appState.pointer.ayahGlobal || 1);
    await saveKhatmaProgress({
      enabled: true,
      startedAt: new Date().toISOString(),
      startAyahGlobal: current,
      currentAyahGlobal: current,
      targetAyahGlobal: 6236,
      targetDays: Math.max(1, Number(content.querySelector("#khatmaTargetDays")?.value || 30)),
      planType: content.querySelector("#khatmaPlanType")?.value || "timed",
      completedAt: ""
    });
    appState.settings.khatma.enabled = true;
    persistWirdSettings({ immediate: true });
    toast("تم بدء ختمة جديدة من الموضع الحالي.");
    openWirdModal();
  });

  content.querySelector("#btnStartKhatmaFromBeginning")?.addEventListener("click", async () => {
    await applyWirdFields();
    const ok = await ModalManager.askConfirm("بدء ختمة من البداية؟", "سيتم تصفير تقدم الختمة فقط وبدء ختمة من الفاتحة.");
    if (!ok) return;
    await saveKhatmaProgress({
      enabled: true,
      startedAt: new Date().toISOString(),
      startAyahGlobal: 1,
      currentAyahGlobal: 1,
      targetAyahGlobal: 6236,
      targetDays: Math.max(1, Number(content.querySelector("#khatmaTargetDays")?.value || 30)),
      planType: content.querySelector("#khatmaPlanType")?.value || "timed",
      completedAt: ""
    });
    appState.settings.khatma.enabled = true;
    persistWirdSettings({ immediate: true });
    toast("تم بدء ختمة جديدة من الفاتحة.");
    openWirdModal();
  });

  content.querySelector("#btnFinishKhatma")?.addEventListener("click", async () => {
    const ok = await ModalManager.askConfirm("إنهاء الختمة؟", "سيتم تسجيل الختمة كمكتملة اليوم.");
    if (!ok) return;
    await saveKhatmaProgress({
      enabled: false,
      currentAyahGlobal: 6236,
      targetAyahGlobal: 6236,
      completedAt: new Date().toISOString()
    });
    appState.settings.khatma.enabled = false;
    persistWirdSettings({ immediate: true });
    toast("ما شاء الله، تم تسجيل اكتمال الختمة.");
    openWirdModal();
  });

  ModalManager.open("wirdModal", { closeOnBackdrop: true, closeOnBack: true });
}

function calculateKhatmaPlan(khatma, stats, settings = {}) {
  const planType = settings.khatma?.planType || khatma?.planType || "timed";
  const targetDays = Math.max(1, Number(settings.khatma?.targetDays || khatma?.targetDays || 30));
  const started = khatma?.startedAt ? new Date(khatma.startedAt) : new Date();
  const expectedEnd = new Date(started);
  expectedEnd.setDate(expectedEnd.getDate() + targetDays - 1);
  const elapsedDays = Math.max(1, Math.floor((Date.now() - started.getTime()) / 86400000) + 1);
  const remainingDays = Math.max(1, targetDays - elapsedDays + 1);
  if (planType === "open" || stats.completed) {
    return { planType, targetDays, elapsedDays, remainingDays, dailyPages: 0, dailyAyahs: 0, expectedEndLabel: planType === "open" ? "ختمة مفتوحة" : formatDate(expectedEnd.toISOString()) };
  }
  return {
    planType,
    targetDays,
    elapsedDays,
    remainingDays,
    dailyPages: Math.max(1, Math.ceil(stats.approxRemainingPages / remainingDays)),
    dailyAyahs: Math.max(1, Math.ceil(stats.remainingAyahs / remainingDays)),
    expectedEndLabel: formatDate(expectedEnd.toISOString())
  };
}

function calculateReadingStats(history = [], settings = {}) {
  const days = [...history].sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")));
  const today = days[0] || {};
  const week = days.slice(0, 7);
  const dayHasReading = (day) => {
    const ayahs = new Set((day.ayahGlobals || []).map(Number).filter(Number.isFinite)).size;
    const pages = new Set((day.pages || []).map(Number).filter(Number.isFinite)).size;
    const seconds = Number(day.seconds || 0);
    return ayahs > 0 || pages > 0 || seconds >= 60;
  };
  let streak = 0;
  const cursor = new Date();
  for (const day of days) {
    const expected = cursor.toISOString().slice(0, 10);
    if (day.date !== expected || !dayHasReading(day)) break;
    streak++;
    cursor.setDate(cursor.getDate() - 1);
  }
  const countUnique = (items, key) => new Set((items || []).map(Number).filter(Number.isFinite)).size;
  return {
    streak,
    todayAyahs: countUnique(today.ayahGlobals),
    todayPages: countUnique(today.pages),
    weekPages: week.reduce((sum, day) => sum + countUnique(day.pages), 0),
    weekAyahs: week.reduce((sum, day) => sum + countUnique(day.ayahGlobals), 0),
    weekMinutes: week.reduce((sum, day) => sum + Math.floor(Number(day.seconds || 0) / 60), 0)
  };
}

function formatDate(value) {
  if (!value) return "غير محدد";
  try {
    return new Intl.DateTimeFormat("ar-EG", { year: "numeric", month: "short", day: "numeric" }).format(new Date(value));
  } catch {
    return "غير محدد";
  }
}

function presetForDays(days) {
  const n = Number(days || 30);
  return [7, 15, 30, 60].includes(n) ? String(n) : "custom";
}

function getAyahsToRecord() {
  const mode = appState.settings.mode;
  if (mode === "ayah") {
    const ayah = appState.indexByGlobal[appState.pointer.ayahGlobal - 1];
    return ayah ? [ayah] : [];
  }
  if (mode === "page") return appState.indexByPage.get(appState.pointer.page) || [];
  if (mode === "surah") {
    const surah = appState.data?.[appState.pointer.surah - 1];
    return (surah?.ayahs || []).map(a => ({ ...a, surah: surah.number, sName: surah.name }));
  }
  if (mode === "juz") return appState.indexByJuz.get(appState.pointer.juz) || [];
  if (mode === "hizb") {
    const out = [];
    const span = Math.max(1, Math.min(4, Number(appState.settings.hizbPart || 4)));
    for (let q = appState.pointer.hizbQuarter; q < appState.pointer.hizbQuarter + span; q++) {
      out.push(...(appState.indexByHizbQuarter.get(q) || []));
    }
    return out;
  }
  return [];
}

function maybeToastWirdCompleted(wird) {
  if (!wird.completed) return;
  const today = new Date().toISOString().slice(0, 10);
  if (completedToastShownFor === today) return;
  completedToastShownFor = today;
  toast("ما شاء الله، أنهيت ورد اليوم.");
}

function goalTypeLabel(type) {
  return type === "pages" ? "صفحة" : type === "minutes" ? "دقيقة" : "آية";
}

function fmtPercent(ratio) {
  return `${fmtNum(Math.round((ratio || 0) * 100))}%`;
}

function progressBar(ratio) {
  const pct = Math.round(Math.min(1, Math.max(0, ratio || 0)) * 100);
  return `<div class="progress-bar"><span style="inline-size:${pct}%"></span></div>`;
}

function formatLastAyah(lastAyah) {
  if (!lastAyah) return "لم يتم تسجيل قراءة اليوم بعد";
  return `${escapeHTML(lastAyah.surahName || "سورة")} • آية ${fmtNum(lastAyah.ayah || 1)}`;
}

function renderHistory(history) {
  if (!history.length) return `<p class="muted-text">لا يوجد سجل بعد.</p>`;
  return `<div class="wird-history">${history.map(day => {
    const ayahs = (day.ayahGlobals || []).length;
    const pages = (day.pages || []).length;
    const mins = Math.floor(Number(day.seconds || 0) / 60);
    return `<div class="wird-history-row"><strong>${escapeHTML(day.date || "")}</strong><span>${fmtNum(ayahs)} آية</span><span>${fmtNum(pages)} صفحة</span><span>${fmtNum(mins)} دقيقة</span></div>`;
  }).join("")}</div>`;
}
