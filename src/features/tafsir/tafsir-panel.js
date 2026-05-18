import { getTafsir } from "../../services/tafsir-service.js";
import { ModalManager } from "../../core/modal-manager.js";
import { escapeHTML, toast } from "../../core/dom.js";
import { TAFSIR_LABELS } from "../../core/config.js";

export async function showTafsir(state, ayah, mode = "modal") {
  const label = TAFSIR_LABELS[state.settings.tafsir] || state.settings.tafsir;
  const target = mode === "panel" ? document.getElementById("tafsirContent") : document.getElementById("tafsirModalContent");
  target.innerHTML = `<p class="muted-text">جاري تحميل التفسير...</p>`;
  if (mode !== "panel") ModalManager.open("tafsirModal", { closeOnBackdrop: true, closeOnBack: true });
  try {
    const text = await getTafsir(ayah, state.settings.tafsir);
    target.innerHTML = `
      <h3>التفسير <span class="muted-text">(${escapeHTML(label)})</span></h3>
      <div class="tafsir-ayah-text">${escapeHTML(ayah.text)}</div>
      <p>${escapeHTML(text)}</p>
    `;
    document.getElementById("tafsirContent").innerHTML = target.innerHTML;
  } catch {
    target.innerHTML = `<p class="muted-text">تعذر تحميل التفسير. في نسخة الأوفلاين سنقرأ التفسير من ملفات محلية.</p>`;
    toast("تعذر تحميل التفسير.");
  }
}

export function resetTafsirPanel() {
  const panel = document.getElementById("tafsirContent");
  if (!panel) return;
  panel.innerHTML = `
    <h3>التفسير <span class="muted-text">(يظهر عند اختيار آية)</span></h3>
    <p class="muted-text">لعرض التفسير اضغط على الآية واختر التفسير.</p>
  `;
}
