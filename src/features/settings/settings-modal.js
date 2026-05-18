import { ModalManager } from "../../core/modal-manager.js";
import { RECITERS, TAFSIR_LABELS } from "../../core/config.js";
import { getNotificationPermissionStatus, isNotificationSupported, normalizeNotificationSettings, requestNotificationPermission, showTestNotification } from "../../core/notifications.js";

export function initSettings({ state, onChange }) {
  const btn = document.getElementById("btnSettings");
  btn.addEventListener("click", () => openSettings(state, onChange));
}

function openSettings(state, onChange) {
  const s = state.settings;
  const content = document.getElementById("settingsContent");
  content.innerHTML = `
    <div class="field"><label>حجم الخط</label><input id="setFontSize" type="range" min="18" max="54" value="${s.quranSize}"></div>
    <div class="field"><label>نوع الخط</label><select id="setFont"><option>Amiri Quran</option><option>Kitab</option><option value="serif">Serif النظام</option></select></div>
    <div class="field"><label>الثيم</label><select id="setTheme"><option value="dark">ليلي</option><option value="paper">مصحف ورقي</option><option value="amoled">AMOLED</option><option value="green">أخضر هادئ</option></select></div>
    <div class="field color-field"><label>لون خلفية القراءة</label><div class="inline-field"><input id="setPaperColor" type="color" value="${s.paperColor || defaultPaperColor(s.theme)}"><button id="resetPaperColor" class="navbtn" type="button">حسب الثيم</button></div><small>يتم ضبط لون النص والقوائم تلقائيًا حسب الخلفية.</small></div>
    <div class="field"><label>طريقة العرض</label><select id="setMode"><option value="ayah">آية آية</option><option value="page">صفحة صفحة</option><option value="surah">سورة سورة</option><option value="hizb">حزب / أرباع</option><option value="juz">جزء جزء</option></select></div>
    <div class="field"><label>ألوان التجويد</label><select id="setTaj"><option value="false">مُلغى</option><option value="true">مُفعّل</option></select></div>
    <div class="field"><label>عدد التكرار</label><input id="setRepeat" type="number" min="1" max="99" value="${s.repeat}"></div>
    <div class="field"><label>التفسير</label><select id="setTafsir">${Object.entries(TAFSIR_LABELS).map(([k,v]) => `<option value="${k}">${v}</option>`).join("")}</select></div>
    <div class="field"><label>المقرئ</label><select id="setReciter">${Object.entries(RECITERS).map(([k,v]) => `<option value="${k}">${v.label}</option>`).join("")}</select></div>

    <section class="settings-card settings-wide">
      <div class="settings-card-head">
        <h4>إشعارات الورد</h4>
        <span id="notificationStatus" class="status-pill">${notificationStatusLabel()}</span>
      </div>
      <p class="muted-text small-note">الإشعارات المحلية تعمل أثناء وجود المتصفح/التطبيق نشطًا أو في الخلفية حسب دعم الجهاز. التشغيل الموثوق والتام عند إغلاق التطبيق يحتاج Web Push من خادم لاحقًا.</p>
      <div class="settings-grid compact-grid">
        <div class="field"><label>تشغيل التذكير</label><select id="setNotificationsEnabled"><option value="false">مغلق</option><option value="true">مُفعّل</option></select></div>
        <div class="field"><label>وقت التذكير اليومي</label><input id="setNotificationTime" type="time" value="07:00"></div>
        <div class="field settings-wide"><label>عنوان الإشعار</label><input id="setNotificationTitle" type="text" maxlength="70" placeholder="ورد القرآن اليومي"></div>
        <div class="field settings-wide"><label>نص الإشعار</label><textarea id="setNotificationBody" rows="3" maxlength="180" placeholder="حان وقت وردك. أنجزت {done} من {goal} {type}، والمتبقي {remaining}."></textarea></div>
      </div>
      <div class="modal-actions notification-actions">
        <button id="btnRequestNotifications" class="navbtn" type="button">طلب صلاحية الإشعارات</button>
        <button id="btnTestNotification" class="navbtn" type="button">اختبار إشعار</button>
      </div>
    </section>
  `;
  content.dataset.customPaper = s.paperColor ? "true" : "false";
  content.querySelector("#setFont").value = s.quranFont;
  content.querySelector("#setTheme").value = s.theme;
  content.querySelector("#setMode").value = s.mode;
  content.querySelector("#setTaj").value = String(s.showTajweed);
  content.querySelector("#setTafsir").value = s.tafsir;
  content.querySelector("#setReciter").value = s.reciter;
  const notificationSettings = normalizeNotificationSettings(s.notifications);
  content.querySelector("#setNotificationsEnabled").value = String(notificationSettings.enabled);
  content.querySelector("#setNotificationTime").value = notificationSettings.dailyTime;
  content.querySelector("#setNotificationTitle").value = notificationSettings.title;
  content.querySelector("#setNotificationBody").value = notificationSettings.body;

  content.querySelector("#setPaperColor").addEventListener("input", () => {
    content.dataset.customPaper = "true";
  });
  content.querySelector("#resetPaperColor").addEventListener("click", () => {
    content.dataset.customPaper = "false";
    content.querySelector("#setPaperColor").value = defaultPaperColor(content.querySelector("#setTheme").value);
    applySettings(state, content, onChange);
  });
  content.querySelector("#setTheme").addEventListener("change", () => {
    if (content.dataset.customPaper !== "true") {
      content.querySelector("#setPaperColor").value = defaultPaperColor(content.querySelector("#setTheme").value);
    }
  });

  content.querySelector("#btnRequestNotifications").addEventListener("click", async () => {
    const result = await requestNotificationPermission();
    if (result.permission === "granted") {
      content.querySelector("#setNotificationsEnabled").value = "true";
      applySettings(state, content, onChange);
    }
    updateNotificationStatus(content);
  });

  content.querySelector("#btnTestNotification").addEventListener("click", async () => {
    applySettings(state, content, onChange);
    await showTestNotification(state.settings.notifications);
    updateNotificationStatus(content);
  });

  content.oninput = () => applySettings(state, content, onChange);
  content.onchange = () => applySettings(state, content, onChange);
  ModalManager.open("settingsModal", { closeOnBackdrop: true, closeOnBack: true });
}

function applySettings(state, content, onChange) {
  state.settings.quranSize = Number(content.querySelector("#setFontSize").value);
  state.settings.quranFont = content.querySelector("#setFont").value;
  state.settings.theme = content.querySelector("#setTheme").value;
  state.settings.paperColor = content.dataset.customPaper === "true" ? content.querySelector("#setPaperColor").value : "";
  state.settings.mode = content.querySelector("#setMode").value;
  state.settings.showTajweed = content.querySelector("#setTaj").value === "true";
  state.settings.repeat = Math.max(1, Number(content.querySelector("#setRepeat").value || 1));
  state.settings.tafsir = content.querySelector("#setTafsir").value;
  state.settings.reciter = content.querySelector("#setReciter").value;
  const previous = normalizeNotificationSettings(state.settings.notifications);
  state.settings.notifications = {
    ...previous,
    enabled: content.querySelector("#setNotificationsEnabled").value === "true",
    dailyTime: content.querySelector("#setNotificationTime").value || "07:00",
    title: content.querySelector("#setNotificationTitle").value.trim() || "ورد القرآن اليومي",
    body: content.querySelector("#setNotificationBody").value.trim() || "حان وقت وردك. أنجزت {done} من {goal} {type}، والمتبقي {remaining}."
  };
  onChange?.();
}

function updateNotificationStatus(content) {
  const el = content.querySelector("#notificationStatus");
  if (el) el.textContent = notificationStatusLabel();
}

function notificationStatusLabel() {
  if (!isNotificationSupported()) return "غير مدعوم";
  const status = getNotificationPermissionStatus();
  if (status === "granted") return "الصلاحية مفعّلة";
  if (status === "denied") return "مرفوض من المتصفح";
  return "بانتظار السماح";
}


function defaultPaperColor(theme) {
  if (theme === "paper") return "#f3ead7";
  if (theme === "amoled") return "#000000";
  if (theme === "green") return "#0d1f1a";
  return "#0f1115";
}
