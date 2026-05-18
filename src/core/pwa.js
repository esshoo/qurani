import { toast } from "./dom.js";

let deferredInstallPrompt = null;

export function initPWA() {
  initNetworkToasts();
  initInstallButton();
  registerServiceWorker();
}

function initNetworkToasts() {
  document.body.classList.toggle("is-offline", !navigator.onLine);
  window.addEventListener("online", () => {
    document.body.classList.remove("is-offline");
    toast("عاد الاتصال بالإنترنت.");
  });
  window.addEventListener("offline", () => {
    document.body.classList.add("is-offline");
    toast("أنت الآن بدون إنترنت. النصوص والبيانات المحلية ستظل تعمل، والصوت يحتاج اتصالًا.");
  });
}

function initInstallButton() {
  const btn = document.getElementById("btnInstallApp");
  if (!btn) return;

  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    deferredInstallPrompt = event;
    btn.hidden = false;
  });

  btn.addEventListener("click", async () => {
    if (!deferredInstallPrompt) return;
    deferredInstallPrompt.prompt();
    await deferredInstallPrompt.userChoice.catch(() => null);
    deferredInstallPrompt = null;
    btn.hidden = true;
  });

  window.addEventListener("appinstalled", () => {
    deferredInstallPrompt = null;
    btn.hidden = true;
    toast("تم تثبيت التطبيق بنجاح.");
  });
}

function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return;
  navigator.serviceWorker.register("./sw.js").then(reg => {
    if (reg.waiting) notifyReady();
    reg.addEventListener("updatefound", () => {
      const worker = reg.installing;
      if (!worker) return;
      worker.addEventListener("statechange", () => {
        if (worker.state === "installed" && navigator.serviceWorker.controller) {
          notifyReady("تم تجهيز تحديث جديد. أعد تحميل الصفحة عند الحاجة.");
        }
      });
    });
  }).catch(() => {});

  navigator.serviceWorker.addEventListener("message", (event) => {
    if (event.data?.type === "OFFLINE_READY") notifyReady();
  });
}

function notifyReady(message = "تم تجهيز ملفات التطبيق الأساسية للعمل بدون إنترنت.") {
  toast(message);
}
