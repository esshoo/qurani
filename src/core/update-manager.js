import { APP_CONFIG } from "./config.js";
import { ModalManager } from "./modal-manager.js";
import { $, toast } from "./dom.js";

const UPDATE_DISMISS_KEY = "qapp.update.dismissedVersion";
let updateInfo = null;
let isApplyingUpdate = false;

export function initUpdateManager() {
  bindUpdateButtons();

  window.addEventListener("online", () => {
    checkForUpdates({ silent: true, source: "online" });
  });

  if (navigator.onLine) {
    // نؤخر الفحص قليلًا حتى لا ينافس تحميل القرآن والتطبيق عند أول فتح.
    setTimeout(() => checkForUpdates({ silent: true, source: "startup" }), 1800);
  }
}

function bindUpdateButtons() {
  const updateNow = $("#btnApplyUpdate");
  const keepCurrent = $("#btnKeepCurrentVersion");
  const remindLater = $("#btnRemindUpdateLater");

  updateNow?.addEventListener("click", () => applyUpdate());
  keepCurrent?.addEventListener("click", () => {
    if (updateInfo?.version) localStorage.setItem(UPDATE_DISMISS_KEY, updateInfo.version);
    ModalManager.close("updateModal", { source: "button" });
    toast("سيتم البقاء على النسخة الحالية. سنعرض التحديث عند صدور نسخة أحدث.");
  });
  remindLater?.addEventListener("click", () => {
    ModalManager.close("updateModal", { source: "button" });
    toast("تم تأجيل التحديث.");
  });
}

export async function checkForUpdates({ silent = false } = {}) {
  if (!navigator.onLine) return null;

  try {
    const response = await fetch(`./version.json?ts=${Date.now()}`, {
      cache: "no-store",
      headers: { "Cache-Control": "no-cache" }
    });

    if (!response.ok) {
      if (!silent) toast("لم يتم العثور على ملف التحديث version.json.");
      return null;
    }

    const info = await response.json();
    if (!info?.version) return null;

    const currentVersion = APP_CONFIG.version;
    const remoteVersion = String(info.version);
    const dismissed = localStorage.getItem(UPDATE_DISMISS_KEY);

    if (compareVersions(remoteVersion, currentVersion) <= 0) {
      if (!silent) toast("أنت تستخدم آخر نسخة متاحة.");
      return null;
    }

    if (dismissed === remoteVersion && !info.forceShow) {
      return null;
    }

    updateInfo = normalizeUpdateInfo(info, currentVersion);
    renderUpdateModal(updateInfo);
    ModalManager.open("updateModal", {
      closeOnBackdrop: false,
      closeOnBack: false,
      lockClose: false
    });
    return updateInfo;
  } catch (error) {
    console.warn("Update check failed", error);
    if (!silent) toast("تعذر فحص التحديثات الآن.");
    return null;
  }
}

function normalizeUpdateInfo(info, currentVersion) {
  return {
    version: String(info.version || ""),
    currentVersion,
    title: info.title || "تحديث جديد متاح",
    releasedAt: info.releasedAt || "",
    summary: info.summary || "يتوفر إصدار أحدث من التطبيق.",
    changes: Array.isArray(info.changes) ? info.changes : [],
    notes: info.notes || ""
  };
}

function renderUpdateModal(info) {
  const content = $("#updateContent");
  if (!content) return;

  const changes = info.changes.length
    ? `<ul class="update-change-list">${info.changes.map(item => `<li>${escapeInline(item)}</li>`).join("")}</ul>`
    : `<p class="muted-text">لم يتم إضافة تفاصيل للتغييرات.</p>`;

  content.innerHTML = `
    <div class="update-card">
      <div class="update-version-row">
        <span>نسختك الحالية</span>
        <strong>v${escapeInline(info.currentVersion)}</strong>
      </div>
      <div class="update-version-row highlight">
        <span>النسخة الجديدة</span>
        <strong>v${escapeInline(info.version)}</strong>
      </div>
      ${info.releasedAt ? `<p class="muted-text">تاريخ الإصدار: ${escapeInline(formatDate(info.releasedAt))}</p>` : ""}
    </div>

    <h4>${escapeInline(info.title)}</h4>
    <p>${escapeInline(info.summary)}</p>
    <h4>ما الذي تغيّر؟</h4>
    ${changes}
    ${info.notes ? `<p class="muted-text">${escapeInline(info.notes)}</p>` : ""}
  `;
}

async function applyUpdate() {
  if (isApplyingUpdate) return;
  isApplyingUpdate = true;
  const btn = $("#btnApplyUpdate");
  if (btn) {
    btn.disabled = true;
    btn.textContent = "جاري التحديث…";
  }

  try {
    localStorage.removeItem(UPDATE_DISMISS_KEY);

    if (!("serviceWorker" in navigator)) {
      await clearAppCaches();
      location.reload();
      return;
    }

    const registration = await navigator.serviceWorker.getRegistration("./");
    if (!registration) {
      await clearAppCaches();
      location.reload();
      return;
    }

    let reloaded = false;
    const reloadOnce = () => {
      if (reloaded) return;
      reloaded = true;
      location.reload();
    };

    navigator.serviceWorker.addEventListener("controllerchange", reloadOnce, { once: true });

    await registration.update().catch(() => null);

    const waiting = registration.waiting || await waitForWaitingWorker(registration, 6000);
    if (waiting) {
      waiting.postMessage({ type: "SKIP_WAITING" });
      setTimeout(reloadOnce, 4000);
      return;
    }

    // لو لم يجد المتصفح Service Worker منتظرًا، نمسح كاش التطبيق ونحدث الصفحة.
    await clearAppCaches();
    reloadOnce();
  } catch (error) {
    console.error("Update apply failed", error);
    toast("تعذر تطبيق التحديث. جرّب إعادة تحميل الصفحة.", 3500);
    if (btn) {
      btn.disabled = false;
      btn.textContent = "تحديث الآن";
    }
    isApplyingUpdate = false;
  }
}

function waitForWaitingWorker(registration, timeoutMs = 6000) {
  return new Promise(resolve => {
    if (registration.waiting) {
      resolve(registration.waiting);
      return;
    }

    let finished = false;
    const done = (worker) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      resolve(worker || registration.waiting || null);
    };

    const timer = setTimeout(() => done(null), timeoutMs);

    registration.addEventListener("updatefound", () => {
      const worker = registration.installing;
      if (!worker) return;
      worker.addEventListener("statechange", () => {
        if (worker.state === "installed") done(registration.waiting || worker);
      });
    }, { once: true });

    const worker = registration.installing;
    if (worker) {
      worker.addEventListener("statechange", () => {
        if (worker.state === "installed") done(registration.waiting || worker);
      });
    }
  });
}

async function clearAppCaches() {
  if (!("caches" in window)) return;
  const keys = await caches.keys();
  await Promise.all(keys.filter(key => key.startsWith("quran-app-")).map(key => caches.delete(key)));
}

function compareVersions(a, b) {
  const pa = normalizeVersion(a);
  const pb = normalizeVersion(b);
  const length = Math.max(pa.length, pb.length);
  for (let i = 0; i < length; i++) {
    const x = pa[i] || 0;
    const y = pb[i] || 0;
    if (x > y) return 1;
    if (x < y) return -1;
  }
  return 0;
}

function normalizeVersion(value) {
  return String(value)
    .replace(/^v/i, "")
    .split(/[.-]/)
    .map(part => parseInt(part.replace(/\D/g, "") || "0", 10));
}

function formatDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("ar-EG", { dateStyle: "medium" }).format(date);
}

function escapeInline(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
