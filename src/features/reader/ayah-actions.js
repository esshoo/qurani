import { ModalManager } from "../../core/modal-manager.js";
import { escapeHTML, toast } from "../../core/dom.js";
import { toggleBookmark } from "../../core/storage.js";
import { fmtNum } from "../../utils/numbers.js";

export function initAyahActions({ state, onTafsir, onPlay, onNote, onDrawing, onShare, onTest }) {
  document.getElementById("content").addEventListener("click", (event) => {
    const target = event.target.closest(".ayah-item");
    if (!target) return;
    const ayah = state.indexByGlobal[Number(target.dataset.global) - 1];
    if (!ayah) return;
    state.selectedAyah = ayah;
    openAyahActions({ ayah, onTafsir, onPlay, onNote, onDrawing, onShare, onTest });
  });
}

function openAyahActions(ctx) {
  const { ayah } = ctx;
  const content = document.getElementById("ayahActionsContent");
  content.innerHTML = `
    <p class="muted-text">${escapeHTML(ayah.sName || "")} - آية ${fmtNum(ayah.numberInSurah)}</p>
    <div class="action-grid">
      <button class="action-btn" data-action="play" type="button"><span>▶️</span><span>تشغيل</span></button>
      <button class="action-btn" data-action="tafsir" type="button"><span>📖</span><span>تفسير</span></button>
      <button class="action-btn" data-action="note" type="button"><span>📝</span><span>ملاحظة</span></button>
      <button class="action-btn" data-action="drawing" type="button"><span>✍️</span><span>رسم</span></button>
      <button class="action-btn" data-action="bookmark" type="button"><span>🔖</span><span>حفظ</span></button>
      <button class="action-btn" data-action="copy" type="button"><span>📋</span><span>نسخ</span></button>
      <button class="action-btn" data-action="share" type="button"><span>🖼️</span><span>صورة</span></button>
      <button class="action-btn" data-action="test" type="button"><span>🧪</span><span>اختبار</span></button>
    </div>
  `;
  content.onclick = async (event) => {
    const btn = event.target.closest("[data-action]");
    if (!btn) return;
    const action = btn.dataset.action;
    if (action === "play") ctx.onPlay(ayah);
    if (action === "tafsir") ctx.onTafsir(ayah);
    if (action === "note") ctx.onNote(ayah);
    if (action === "drawing") ctx.onDrawing(ayah);
    if (action === "share") ctx.onShare(ayah);
    if (action === "test") ctx.onTest?.(ayah);
    if (action === "bookmark") {
      try {
        const added = await toggleBookmark(ayah);
        toast(added ? "تم حفظ العلامة." : "تم إزالة العلامة.");
      } catch (error) {
        console.error(error);
        toast("تعذر حفظ العلامة الآن.");
      }
    }
    if (action === "copy") {
      await navigator.clipboard?.writeText(`${ayah.text} (${ayah.sName || ""}: ${ayah.numberInSurah})`);
      toast("تم نسخ الآية.");
    }
    ModalManager.close("ayahActionsModal", { source: "button" });
  };
  ModalManager.open("ayahActionsModal", { closeOnBackdrop: true, closeOnBack: true });
}
