import { ModalManager } from "../../core/modal-manager.js";
import { toast } from "../../core/dom.js";
import { saveExportRecord } from "../../core/storage.js";
import { fmtNum } from "../../utils/numbers.js";

const CANVAS_WIDTH = 1080;
const CANVAS_HEIGHT = 1350;

let currentAyah = null;
let appState = null;
let shareScope = "ayah";
let shareCount = 3;
let shareTheme = "paper";
let canvas = null;
let ctx = null;
let currentAyahs = [];
let currentLabel = "";

export function openShareModal(ayah, state) {
  currentAyah = ayah;
  appState = state;
  shareScope = "ayah";
  shareCount = 3;
  shareTheme = "paper";

  const content = document.getElementById("shareContent");
  content.innerHTML = `
    <div class="share-editor">
      <div class="share-controls-card">
        <div class="field">
          <label>نطاق الصورة</label>
          <div class="seg share-seg">
            <button class="active" data-share-scope="ayah" type="button">الآية فقط</button>
            <button data-share-scope="range" type="button">عدد آيات</button>
            <button data-share-scope="page" type="button">الصفحة كاملة</button>
          </div>
        </div>

        <label class="field share-count-field">
          عدد الآيات
          <input id="shareAyahCount" type="number" min="1" max="50" value="3" disabled>
        </label>

        <label class="field">
          شكل البطاقة
          <select id="shareTheme">
            <option value="paper">مصحف ورقي</option>
            <option value="dark">داكن فاخر</option>
            <option value="green">أخضر هادئ</option>
          </select>
        </label>
      </div>

      <div class="share-canvas-wrap">
        <canvas id="shareCanvas" width="${CANVAS_WIDTH}" height="${CANVAS_HEIGHT}" aria-label="معاينة صورة المشاركة"></canvas>
      </div>

      <div class="share-sticky-actions">
        <button id="downloadShareImage" class="navbtn primary" type="button">حفظ الصورة PNG</button>
        <button id="nativeShareImage" class="navbtn" type="button">مشاركة</button>
      </div>
    </div>
  `;

  canvas = content.querySelector("#shareCanvas");
  ctx = canvas.getContext("2d", { willReadFrequently: true });

  content.querySelectorAll("[data-share-scope]").forEach(btn => {
    btn.onclick = () => {
      shareScope = btn.dataset.shareScope;
      content.querySelectorAll("[data-share-scope]").forEach(x => x.classList.toggle("active", x.dataset.shareScope === shareScope));
      const countInput = content.querySelector("#shareAyahCount");
      countInput.disabled = shareScope !== "range";
      renderShareCanvas();
    };
  });

  const countInput = content.querySelector("#shareAyahCount");
  countInput.onchange = () => {
    shareCount = Math.max(1, Math.min(50, Number(countInput.value) || 1));
    countInput.value = String(shareCount);
    if (shareScope === "range") renderShareCanvas();
  };

  content.querySelector("#shareTheme").onchange = (event) => {
    shareTheme = event.target.value;
    renderShareCanvas();
  };

  content.querySelector("#downloadShareImage").onclick = () => downloadCurrentShareImage();
  content.querySelector("#nativeShareImage").onclick = () => nativeShareCurrentImage();

  ModalManager.open("shareModal", { closeOnBackdrop: true, closeOnBack: true });
  renderShareCanvas();
}

async function renderShareCanvas() {
  if (!canvas || !ctx || !currentAyah) return;
  try {
    await document.fonts?.ready;
  } catch {}
  const payload = getSharePayload();
  currentAyahs = payload.ayahs;
  currentLabel = payload.label;
  drawShareCard(currentAyahs, currentLabel, shareTheme);
}

function getSharePayload() {
  if (shareScope === "range") {
    const count = Math.max(1, Math.min(50, shareCount || 1));
    const startIndex = Math.max(0, (currentAyah.number || 1) - 1);
    const ayahs = (appState?.indexByGlobal || []).slice(startIndex, startIndex + count).filter(Boolean);
    const last = ayahs[ayahs.length - 1] || currentAyah;
    const label = ayahs.length <= 1
      ? `${currentAyah.sName || "سورة"} - آية ${fmtNum(currentAyah.numberInSurah)}`
      : `من ${currentAyah.sName || "سورة"} ${fmtNum(currentAyah.numberInSurah)} إلى ${last.sName || "سورة"} ${fmtNum(last.numberInSurah)}`;
    return { ayahs: ayahs.length ? ayahs : [currentAyah], label };
  }

  if (shareScope === "page") {
    const page = currentAyah.page || appState?.pointer?.page;
    const ayahs = appState?.indexByPage?.get(page) || [];
    return {
      ayahs: ayahs.length ? ayahs : [currentAyah],
      label: page ? `صفحة ${fmtNum(page)}` : `${currentAyah.sName || "سورة"} - آية ${fmtNum(currentAyah.numberInSurah)}`
    };
  }

  return {
    ayahs: [currentAyah],
    label: `${currentAyah.sName || "سورة"} - آية ${fmtNum(currentAyah.numberInSurah)}`
  };
}

function drawShareCard(ayahs, label, theme) {
  const colors = getThemeColors(theme);
  ctx.save();
  ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

  const bg = ctx.createLinearGradient(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
  bg.addColorStop(0, colors.bg1);
  bg.addColorStop(1, colors.bg2);
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

  ctx.strokeStyle = colors.border;
  ctx.lineWidth = 5;
  roundRect(ctx, 52, 52, CANVAS_WIDTH - 104, CANVAS_HEIGHT - 104, 38);
  ctx.stroke();

  ctx.strokeStyle = colors.borderSoft;
  ctx.lineWidth = 2;
  roundRect(ctx, 84, 84, CANVAS_WIDTH - 168, CANVAS_HEIGHT - 168, 28);
  ctx.stroke();

  ctx.direction = "rtl";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  ctx.fillStyle = colors.accent;
  ctx.font = "bold 40px system-ui, 'Noto Sans Arabic', sans-serif";
  ctx.fillText(label || "آية من القرآن", CANVAS_WIDTH / 2, 128);

  const box = { x: 118, y: 190, width: CANVAS_WIDTH - 236, height: CANVAS_HEIGHT - 360 };
  const count = Math.max(1, ayahs.length);
  let fontSize = count <= 1 ? 60 : count <= 5 ? 46 : count <= 10 ? 38 : 30;
  let lines = [];
  let lineHeight = 0;

  while (fontSize >= 20) {
    ctx.font = `${fontSize}px 'Amiri Quran', serif`;
    lineHeight = Math.round(fontSize * 1.9);
    lines = buildQuranLines(ctx, ayahs, box.width);
    if (lines.length * lineHeight <= box.height) break;
    fontSize -= 2;
  }

  ctx.font = `${fontSize}px 'Amiri Quran', serif`;
  ctx.fillStyle = colors.ink;

  const totalHeight = lines.length * lineHeight;
  let y = box.y + Math.max(0, (box.height - totalHeight) / 2) + lineHeight / 2;

  for (const line of lines) {
    if (line.kind === "surah") {
      ctx.save();
      ctx.font = `bold ${Math.max(26, fontSize - 4)}px system-ui, 'Noto Sans Arabic', sans-serif`;
      ctx.fillStyle = colors.accent;
      ctx.fillText(line.text, CANVAS_WIDTH / 2, y);
      ctx.restore();
    } else {
      ctx.fillStyle = colors.ink;
      ctx.fillText(line.text, CANVAS_WIDTH / 2, y);
    }
    y += lineHeight;
  }

  ctx.fillStyle = colors.footer;
  ctx.font = "28px system-ui, 'Noto Sans Arabic', sans-serif";
  ctx.fillText("منصة قراءة القرآن", CANVAS_WIDTH / 2, CANVAS_HEIGHT - 118);

  ctx.restore();
}

function getThemeColors(theme) {
  if (theme === "dark") {
    return {
      bg1: "#111827",
      bg2: "#020617",
      ink: "#f8fafc",
      accent: "#d4af37",
      footer: "rgba(248,250,252,.72)",
      border: "rgba(212,175,55,.55)",
      borderSoft: "rgba(255,255,255,.16)"
    };
  }
  if (theme === "green") {
    return {
      bg1: "#edf7ee",
      bg2: "#d8eadb",
      ink: "#102318",
      accent: "#1f6f46",
      footer: "rgba(16,35,24,.68)",
      border: "rgba(31,111,70,.35)",
      borderSoft: "rgba(31,111,70,.20)"
    };
  }
  return {
    bg1: "#f7ecd5",
    bg2: "#fffaf0",
    ink: "#1e1710",
    accent: "#8a5f23",
    footer: "rgba(30,23,16,.62)",
    border: "rgba(138,95,35,.34)",
    borderSoft: "rgba(138,95,35,.18)"
  };
}

function buildQuranLines(targetCtx, ayahs, maxWidth) {
  const lines = [];
  let lastSurah = null;
  for (const ayah of ayahs) {
    if (ayah.surah !== lastSurah) {
      lines.push({ kind: "surah", text: ayah.sName || `سورة ${fmtNum(ayah.surah)}` });
      lastSurah = ayah.surah;
    }
    const ayahText = `${ayah.text || ""} ﴿${fmtNum(ayah.numberInSurah)}﴾`;
    for (const line of wrapArabicLine(targetCtx, ayahText, maxWidth)) {
      lines.push({ kind: "ayah", text: line });
    }
  }
  return lines;
}

function wrapArabicLine(targetCtx, text, maxWidth) {
  const words = String(text || "").split(/\s+/).filter(Boolean);
  const lines = [];
  let line = "";
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (targetCtx.measureText(test).width > maxWidth && line) {
      lines.push(line);
      line = word;
    } else {
      line = test;
    }
  }
  if (line) lines.push(line);
  return lines.length ? lines : [String(text || "")];
}

function roundRect(targetCtx, x, y, width, height, radius) {
  targetCtx.beginPath();
  targetCtx.moveTo(x + radius, y);
  targetCtx.arcTo(x + width, y, x + width, y + height, radius);
  targetCtx.arcTo(x + width, y + height, x, y + height, radius);
  targetCtx.arcTo(x, y + height, x, y, radius);
  targetCtx.arcTo(x, y, x + width, y, radius);
  targetCtx.closePath();
}

function canvasToBlob() {
  return new Promise((resolve) => canvas.toBlob(resolve, "image/png", 0.95));
}

async function saveShareExportToLibrary(imageData) {
  try {
    const first = currentAyahs[0] || currentAyah;
    await saveExportRecord({
      kind: "share-image",
      title: `صورة قرآنية - ${currentLabel || "آية"}`,
      label: currentLabel,
      scope: shareScope,
      surah: first?.surah,
      ayah: first?.numberInSurah,
      ayahGlobal: first?.number,
      theme: shareTheme,
      imageData,
      ayahs: currentAyahs.map(a => ({
        surah: a.surah,
        surahName: a.sName || "",
        ayah: a.numberInSurah,
        ayahGlobal: a.number,
        page: a.page,
        text: a.text || ""
      }))
    });
  } catch (error) {
    console.warn("Could not save exported image to library", error);
  }
}

async function downloadCurrentShareImage() {
  try {
    await renderShareCanvas();
    const imageData = canvas.toDataURL("image/png", 0.95);
    await saveShareExportToLibrary(imageData);
    const blob = await canvasToBlob();
    if (!blob) throw new Error("No blob");
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    const suffix = shareScope === "page" ? `page-${currentAyah.page || "current"}` : `${currentAyah.surah}-${currentAyah.numberInSurah}`;
    a.download = `quran-share-${suffix}.png`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    toast("تم حفظ الصورة في المكتبة وتجهيزها للتحميل.");
  } catch (err) {
    console.error(err);
    toast("تعذر حفظ الصورة.");
  }
}

async function nativeShareCurrentImage() {
  try {
    await renderShareCanvas();
    const imageData = canvas.toDataURL("image/png", 0.95);
    await saveShareExportToLibrary(imageData);
    const blob = await canvasToBlob();
    if (!blob) throw new Error("No blob");
    const file = new File([blob], "quran-share.png", { type: "image/png" });
    if (navigator.canShare?.({ files: [file] })) {
      await navigator.share({ files: [file], title: "آية من القرآن" });
    } else {
      toast("المشاركة المباشرة غير مدعومة هنا، استخدم حفظ الصورة PNG.");
    }
  } catch (err) {
    console.error(err);
    toast("تعذرت المشاركة.");
  }
}
