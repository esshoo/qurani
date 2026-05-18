import { toast } from "./dom.js";
import { calculateWirdStats, getTodayProgress } from "./storage.js";

const DEFAULT_NOTIFICATION_SETTINGS = {
  enabled: false,
  dailyTime: "07:00",
  title: "ورد القرآن اليومي",
  body: "حان وقت وردك. أنجزت {done} من {goal} {type}، والمتبقي {remaining}.",
  lastShownDate: ""
};

let currentState = null;
let onSaveSettings = null;
let scheduleTimer = null;
let minuteWatcher = null;

export function normalizeNotificationSettings(settings = {}) {
  return { ...DEFAULT_NOTIFICATION_SETTINGS, ...(settings || {}) };
}

export function getNotificationPermissionStatus() {
  if (!isNotificationSupported()) return "unsupported";
  return Notification.permission;
}

export function isNotificationSupported() {
  return "Notification" in window && "serviceWorker" in navigator;
}

export function initNotifications({ state, onSave } = {}) {
  currentState = state;
  onSaveSettings = onSave;
  if (currentState?.settings) {
    currentState.settings.notifications = normalizeNotificationSettings(currentState.settings.notifications);
  }
  refreshNotificationSchedule();

  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) refreshNotificationSchedule();
  });

  window.addEventListener("online", refreshNotificationSchedule);
}

export async function requestNotificationPermission() {
  if (!isNotificationSupported()) {
    toast("هذا المتصفح لا يدعم إشعارات الويب بشكل مناسب.");
    return { ok: false, permission: "unsupported" };
  }

  if (!window.isSecureContext && location.hostname !== "localhost" && location.hostname !== "127.0.0.1") {
    toast("الإشعارات تحتاج HTTPS أو تشغيل محلي localhost.");
    return { ok: false, permission: Notification.permission, needsSecureContext: true };
  }

  let permission = Notification.permission;
  if (permission === "default") {
    permission = await Notification.requestPermission();
  }

  if (permission === "granted") {
    toast("تم تفعيل صلاحية الإشعارات.");
    return { ok: true, permission };
  }

  if (permission === "denied") {
    toast("تم رفض الإشعارات من المتصفح. يمكنك تفعيلها من إعدادات الموقع.");
    return { ok: false, permission };
  }

  toast("لم يتم تفعيل الإشعارات بعد.");
  return { ok: false, permission };
}

export async function showTestNotification(notificationSettings) {
  const settings = normalizeNotificationSettings(notificationSettings || currentState?.settings?.notifications);
  const permission = await ensurePermissionForUserAction();
  if (permission !== "granted") return false;

  try {
    const body = await buildNotificationBody(settings.body || DEFAULT_NOTIFICATION_SETTINGS.body);
    await showSystemNotification({
      title: settings.title || "اختبار الإشعارات",
      body,
      tag: "quran-test-notification"
    });
    toast("تم إرسال إشعار تجريبي.");
    return true;
  } catch (error) {
    console.error("Unable to show test notification", error);
    toast("تعذر إرسال إشعار الاختبار. تأكد من صلاحية الإشعارات ومن عمل Service Worker.");
    return false;
  }
}

export function refreshNotificationSchedule() {
  clearExistingSchedule();

  const settings = normalizeNotificationSettings(currentState?.settings?.notifications);
  if (!settings.enabled) return;
  if (!isNotificationSupported()) return;
  if (Notification.permission !== "granted") return;

  const delay = getDelayUntilNextTime(settings.dailyTime);
  scheduleTimer = window.setTimeout(async () => {
    await maybeShowDailyReminder();
    refreshNotificationSchedule();
  }, delay);

  // Fallback watcher while the app is open. Helpful when timers are throttled after sleep.
  minuteWatcher = window.setInterval(maybeShowDailyReminder, 60 * 1000);
}

async function maybeShowDailyReminder() {
  const settings = normalizeNotificationSettings(currentState?.settings?.notifications);
  if (!settings.enabled || Notification.permission !== "granted") return false;

  const today = localDateKey(new Date());
  if (settings.lastShownDate === today) return false;

  const now = new Date();
  const [h, m] = parseTime(settings.dailyTime);
  const passedTodayTime = now.getHours() > h || (now.getHours() === h && now.getMinutes() >= m);
  if (!passedTodayTime) return false;

  let title = settings.title || DEFAULT_NOTIFICATION_SETTINGS.title;
  let body = settings.body || DEFAULT_NOTIFICATION_SETTINGS.body;

  try {
    const daily = await getTodayProgress();
    const wird = calculateWirdStats(daily, currentState?.settings || {});

    // لا ترسل تذكير ورد إذا كان ورد اليوم مكتملًا بالفعل.
    if (wird.completed) {
      currentState.settings.notifications = { ...settings, lastShownDate: today };
      onSaveSettings?.();
      return false;
    }

    body = await buildNotificationBody(body, wird);
  } catch (error) {
    console.warn("Unable to read wird progress for notification", error);
  }

  await showSystemNotification({
    title,
    body,
    tag: "quran-daily-wird"
  });

  if (currentState?.settings) {
    currentState.settings.notifications = { ...settings, lastShownDate: today };
    onSaveSettings?.();
  }
  return true;
}

async function buildNotificationBody(template, precomputedWird = null) {
  let wird = precomputedWird;
  if (!wird) {
    try {
      const daily = await getTodayProgress();
      wird = calculateWirdStats(daily, currentState?.settings || {});
    } catch {
      wird = { done: 0, goalValue: 0, goalType: "ayahs" };
    }
  }

  const done = Number(wird.done || 0);
  const goal = Number(wird.goalValue || 0);
  const remaining = Math.max(0, goal - done);
  return String(template || DEFAULT_NOTIFICATION_SETTINGS.body)
    .replaceAll("{done}", String(done))
    .replaceAll("{goal}", String(goal))
    .replaceAll("{remaining}", String(remaining))
    .replaceAll("{type}", goalTypeLabel(wird.goalType));
}

function goalTypeLabel(type) {
  return type === "pages" ? "صفحة" : type === "minutes" ? "دقيقة" : "آية";
}

async function ensurePermissionForUserAction() {
  if (!isNotificationSupported()) {
    toast("هذا المتصفح لا يدعم الإشعارات.");
    return "unsupported";
  }
  if (Notification.permission === "default") {
    const result = await requestNotificationPermission();
    return result.permission;
  }
  if (Notification.permission === "denied") {
    toast("الإشعارات مرفوضة من إعدادات المتصفح لهذا الموقع.");
  }
  return Notification.permission;
}

async function showSystemNotification({ title, body, tag }) {
  const options = {
    body,
    dir: "rtl",
    lang: "ar",
    tag,
    renotify: false,
    icon: "./assets/icons/icon-192.png",
    badge: "./assets/icons/icon-192.png",
    data: { url: "./", source: tag },
    actions: [
      { action: "open", title: "افتح التطبيق" }
    ]
  };

  try {
    const registration = await navigator.serviceWorker.ready;
    await registration.showNotification(title, options);
  } catch (error) {
    // Fallback for browsers that support Notification but fail service worker display.
    const { actions, badge, ...fallbackOptions } = options;
    try {
      new Notification(title, fallbackOptions);
    } catch (fallbackError) {
      console.error("Notification display failed", error, fallbackError);
      throw fallbackError;
    }
  }
}

function getDelayUntilNextTime(time) {
  const now = new Date();
  const [hour, minute] = parseTime(time);
  const next = new Date(now);
  next.setHours(hour, minute, 0, 0);
  if (next <= now) next.setDate(next.getDate() + 1);
  return Math.max(1000, next.getTime() - now.getTime());
}

function parseTime(value) {
  const [h, m] = String(value || DEFAULT_NOTIFICATION_SETTINGS.dailyTime).split(":").map(Number);
  return [Number.isFinite(h) ? Math.min(23, Math.max(0, h)) : 7, Number.isFinite(m) ? Math.min(59, Math.max(0, m)) : 0];
}

function localDateKey(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function clearExistingSchedule() {
  if (scheduleTimer) window.clearTimeout(scheduleTimer);
  if (minuteWatcher) window.clearInterval(minuteWatcher);
  scheduleTimer = null;
  minuteWatcher = null;
}
