import { $ } from "./dom.js";

class ModalManagerClass {
  constructor() {
    this.stack = [];
    this.confirmResolver = null;
  }

  init() {
    document.addEventListener("click", (event) => {
      const closeBtn = event.target.closest("[data-modal-close]");
      if (closeBtn) {
        this.closeTop({ source: "button" });
        return;
      }
      const backdrop = event.target.closest("[data-modal-backdrop]");
      if (backdrop) {
        const top = this.top();
        if (top?.options.closeOnBackdrop) this.close(top.id, { source: "backdrop" });
      }
    });

    window.addEventListener("popstate", () => {
      const top = this.top();
      if (!top) return;
      if (top.options.closeOnBack === "confirm") {
        history.pushState({ modalGuard: true }, "");
        this.askConfirm("هل تريد الخروج من النافذة؟", "قد تفقد أي تعديلات غير محفوظة.")
          .then(ok => { if (ok) this.close(top.id, { source: "back" }); });
      } else if (top.options.closeOnBack) {
        this.close(top.id, { source: "back", skipHistory: true });
      }
    });
  }

  top() { return this.stack[this.stack.length - 1] || null; }

  open(id, options = {}) {
    const el = document.getElementById(id);
    if (!el) throw new Error(`Modal not found: ${id}`);
    const finalOptions = {
      closeOnBackdrop: true,
      closeOnBack: true,
      lockClose: false,
      pushHistory: true,
      ...options
    };
    el.classList.add("open");
    el.setAttribute("aria-hidden", "false");
    this.stack = this.stack.filter(item => item.id !== id);
    this.stack.push({ id, el, options: finalOptions });
    if (finalOptions.pushHistory) {
      history.pushState({ modalId: id }, "");
    }
  }

  close(id, meta = {}) {
    const item = this.stack.find(x => x.id === id);
    const el = item?.el || document.getElementById(id);
    if (!el) return;
    el.classList.remove("open");
    el.setAttribute("aria-hidden", "true");
    this.stack = this.stack.filter(x => x.id !== id);
    if (!meta.skipHistory && meta.source !== "back") {
      // لا نجبر المتصفح على الرجوع حتى لا نخرج المستخدم من الصفحة عند إغلاق زر داخلي.
    }
  }

  closeTop(meta = {}) {
    const top = this.top();
    if (!top) return;
    if (top.options.lockClose && meta.source !== "force" && meta.source !== "button") return;
    this.close(top.id, meta);
  }

  async askConfirm(title, message) {
    const modal = $("#confirmModal");
    $("#confirmTitle").textContent = title;
    $("#confirmMessage").textContent = message;
    modal.classList.add("open");
    modal.setAttribute("aria-hidden", "false");
    return new Promise(resolve => {
      const ok = $("#confirmOk");
      const cancel = $("#confirmCancel");
      const cleanup = (value) => {
        modal.classList.remove("open");
        modal.setAttribute("aria-hidden", "true");
        ok.onclick = null;
        cancel.onclick = null;
        resolve(value);
      };
      ok.onclick = () => cleanup(true);
      cancel.onclick = () => cleanup(false);
    });
  }
}

export const ModalManager = new ModalManagerClass();
