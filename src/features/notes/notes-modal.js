import { ModalManager } from "../../core/modal-manager.js";
import { escapeHTML, toast, downloadText, downloadDataUrl } from "../../core/dom.js";
import {
  calculateKhatmaStats,
  calculateWirdStats,
  clearAllUserData,
  deleteBookmark,
  deleteExport,
  deleteNote,
  deleteTestResult,
  exportAllUserData,
  getBookmarks,
  getDailyProgressHistory,
  getExports,
  getKhatmaProgress,
  getNotes,
  getTodayProgress,
  getTestResults,
  importUserData,
  saveNote
} from "../../core/storage.js";
import { state as appState } from "../../core/state.js";
import { fmtNum } from "../../utils/numbers.js";

let currentCanvas = null;
let ctx = null;
let inkCanvas = null;
let inkCtx = null;
let strokes = [];
let activeStroke = null;
let dirty = false;
let currentAyah = null;
let mode = "text";
let activeTool = "pen";
let inputMode = "pen"; // pen = stylus/mouse only, hand = touch/finger/mouse
let backgroundMode = "none";
let backgroundImageData = null;
let backgroundImageElement = null;
let backgroundAyahCount = 3;
let backgroundAyahs = [];
let backgroundLabel = "";

const CANVAS_WIDTH = 1400;
const CANVAS_HEIGHT = 900;

export function openTextNote(ayah) {
  mode = "text";
  openNotes(ayah);
}

export function openDrawingNote(ayah) {
  mode = "drawing";
  openNotes(ayah);
}

export function initNotesLibrary() {
  document.getElementById("btnLibrary").addEventListener("click", () => openLibrary());
  document.getElementById("btnCloseNotes").addEventListener("click", async () => {
    if (dirty) {
      const ok = await ModalManager.askConfirm("إغلاق الملاحظات؟", "لديك تعديلات غير محفوظة. هل تريد الخروج بدون حفظ؟");
      if (!ok) return;
    }
    ModalManager.close("notesModal", { source: "force" });
  });
}

function openNotes(ayah) {
  currentAyah = ayah;
  dirty = false;
  const content = document.getElementById("notesContent");
  content.innerHTML = `
    <div class="notes-tabs">
      <button id="tabText" class="navbtn ${mode === "text" ? "active" : ""}" type="button">كتابة</button>
      <button id="tabDrawing" class="navbtn ${mode === "drawing" ? "active" : ""}" type="button">رسم فوق الآية / الصفحة</button>
    </div>
    <div id="noteEditor"></div>
  `;
  content.querySelector("#tabText").onclick = () => { mode = "text"; renderEditor(); };
  content.querySelector("#tabDrawing").onclick = () => { mode = "drawing"; renderEditor(); };
  renderEditor();
  ModalManager.open("notesModal", { closeOnBackdrop: false, closeOnBack: "confirm", lockClose: true });
}

function renderEditor() {
  const editor = document.getElementById("noteEditor");
  document.getElementById("tabText")?.classList.toggle("active", mode === "text");
  document.getElementById("tabDrawing")?.classList.toggle("active", mode === "drawing");
  if (mode === "text") renderTextEditor(editor);
  else renderDrawingEditor(editor);
}

function renderTextEditor(editor) {
  editor.innerHTML = `
    <div class="note-editor-layout">
      <p class="muted-text">ملاحظة على ${escapeHTML(currentAyah.sName || "")} - آية ${currentAyah.numberInSurah}</p>
      <input id="noteTitle" type="text" placeholder="عنوان الملاحظة" />
      <textarea id="noteBody" placeholder="اكتب ملاحظتك هنا..."></textarea>
      <input id="noteTags" type="text" placeholder="وسوم مثل: توحيد، حفظ، تدبر" />
      <div class="note-sticky-actions">
        <button id="saveTextNote" class="navbtn primary" type="button">حفظ الملاحظة</button>
        <button id="exportTextJson" class="navbtn" type="button">تصدير JSON</button>
      </div>
    </div>
  `;
  editor.oninput = () => { dirty = true; };
  editor.querySelector("#saveTextNote").onclick = async () => {
    try {
      const note = buildTextNote(editor);
      await saveNote(note);
      dirty = false;
      toast("تم حفظ الملاحظة في مكتبتك.");
    } catch (error) {
      console.error(error);
      toast("تعذر حفظ الملاحظة.");
    }
  };
  editor.querySelector("#exportTextJson").onclick = () => {
    const note = buildTextNote(editor);
    downloadText(`note-${note.surah}-${note.ayah}.json`, JSON.stringify(note, null, 2));
  };
}

function buildTextNote(editor) {
  return {
    id: `note_${currentAyah.surah}_${currentAyah.numberInSurah}_${Date.now()}`,
    type: "text",
    surah: currentAyah.surah,
    ayah: currentAyah.numberInSurah,
    ayahGlobal: currentAyah.number,
    ayahText: currentAyah.text,
    surahName: currentAyah.sName || "",
    title: editor.querySelector("#noteTitle").value.trim() || "ملاحظة بدون عنوان",
    content: editor.querySelector("#noteBody").value.trim(),
    tags: editor.querySelector("#noteTags").value.split(/[،,]/).map(x => x.trim()).filter(Boolean)
  };
}

function renderDrawingEditor(editor) {
  backgroundMode = "none";
  backgroundImageData = null;
  backgroundImageElement = null;
  backgroundAyahCount = 3;
  backgroundAyahs = [];
  backgroundLabel = "";
  strokes = [];
  activeStroke = null;
  activeTool = "pen";
  inputMode = "pen";

  editor.innerHTML = `
    <div class="drawing-editor">
      <div class="drawing-header-card">
        <strong>ملاحظة رسم على ${escapeHTML(currentAyah.sName || "")} - آية ${currentAyah.numberInSurah}</strong>
        <span class="muted-text">اختر الخلفية أولًا: بدون، الآية فقط، أو الصفحة الحالية، ثم اكتب ملاحظاتك فوقها.</span>
      </div>

      <div class="drawing-toolbar drawing-toolbar-main">
        <div class="segmented-control" aria-label="خلفية الرسم">
          <button class="active" data-background-mode="none" type="button">بدون خلفية</button>
          <button data-background-mode="ayah" type="button">الآية فقط</button>
          <button data-background-mode="range" type="button">عدد آيات</button>
          <button data-background-mode="page" type="button">الصفحة كاملة</button>
        </div>
        <label class="field compact-field ayah-count-field" id="ayahCountField">
          عدد الآيات
          <input id="backgroundAyahCount" type="number" min="1" max="50" value="3" disabled>
        </label>
      </div>

      <div class="drawing-toolbar">
        <div class="segmented-control" aria-label="طريقة الإدخال">
          <button id="inputPen" class="active" type="button">قلم فقط</button>
          <button id="inputHand" type="button">يد / ماوس</button>
        </div>
        <button id="toolPen" class="navbtn active" type="button">قلم</button>
        <button id="toolEraser" class="navbtn" type="button">ممحاة</button>
        <label class="field compact-field">اللون <input id="penColor" type="color" value="#b91c1c"></label>
        <label class="field compact-field">السمك <input id="penSize" type="range" min="1" max="40" value="6"></label>
        <button id="clearCanvas" class="navbtn danger" type="button">مسح الرسم</button>
      </div>

      <div class="drawing-tip muted-text">
        وضع <strong>قلم فقط</strong> يتجاهل لمس اليد على الشاشات التي تدعم القلم؛ استخدم <strong>يد / ماوس</strong> للرسم بالإصبع أو للاختبار بالماوس.
      </div>

      <div class="drawing-wrap">
        <canvas id="drawingCanvas" width="${CANVAS_WIDTH}" height="${CANVAS_HEIGHT}"></canvas>
      </div>

      <div class="note-sticky-actions">
        <button id="saveDrawingJson" class="navbtn primary" type="button">حفظ الرسم</button>
        <button id="exportDrawingJson" class="navbtn" type="button">تصدير JSON</button>
        <button id="exportDrawingPng" class="navbtn" type="button">حفظ كصورة PNG</button>
      </div>
    </div>
  `;
  setupCanvas(editor);
}

function setupCanvas(editor) {
  currentCanvas = editor.querySelector("#drawingCanvas");
  ctx = currentCanvas.getContext("2d");
  inkCanvas = document.createElement("canvas");
  inkCanvas.width = currentCanvas.width;
  inkCanvas.height = currentCanvas.height;
  inkCtx = inkCanvas.getContext("2d");
  clearInk();
  redrawVisibleCanvas();

  const setActiveTool = (nextTool) => {
    activeTool = nextTool;
    editor.querySelector("#toolPen").classList.toggle("active", activeTool === "pen");
    editor.querySelector("#toolEraser").classList.toggle("active", activeTool === "eraser");
  };

  const setInputMode = (nextMode) => {
    inputMode = nextMode;
    editor.querySelector("#inputPen").classList.toggle("active", inputMode === "pen");
    editor.querySelector("#inputHand").classList.toggle("active", inputMode === "hand");
  };

  const setBackgroundMode = async (nextMode) => {
    backgroundMode = nextMode;
    editor.querySelectorAll("[data-background-mode]").forEach(btn => {
      btn.classList.toggle("active", btn.dataset.backgroundMode === backgroundMode);
    });
    const countInput = editor.querySelector("#backgroundAyahCount");
    if (countInput) countInput.disabled = backgroundMode !== "range";
    await buildDrawingBackground(backgroundMode);
    redrawFromStrokes();
  };

  const getPoint = (event) => {
    const rect = currentCanvas.getBoundingClientRect();
    return {
      x: (event.clientX - rect.left) * (currentCanvas.width / rect.width),
      y: (event.clientY - rect.top) * (currentCanvas.height / rect.height)
    };
  };

  const start = (event) => {
    if (!canUsePointer(event)) return;
    event.preventDefault();
    currentCanvas.setPointerCapture?.(event.pointerId);
    const color = activeTool === "eraser" ? "#000000" : editor.querySelector("#penColor").value;
    const width = Number(editor.querySelector("#penSize").value);
    activeStroke = { tool: activeTool, color, width, inputMode, points: [getPoint(event)] };
    dirty = true;
  };

  const move = (event) => {
    if (!activeStroke) return;
    if (!canUsePointer(event)) return;
    event.preventDefault();
    const p = getPoint(event);
    const last = activeStroke.points[activeStroke.points.length - 1];
    activeStroke.points.push(p);
    drawLine(inkCtx, last, p, activeStroke);
    redrawVisibleCanvas();
  };

  const end = () => {
    if (!activeStroke) return;
    strokes.push(activeStroke);
    activeStroke = null;
  };

  currentCanvas.addEventListener("pointerdown", start);
  currentCanvas.addEventListener("pointermove", move);
  currentCanvas.addEventListener("pointerup", end);
  currentCanvas.addEventListener("pointercancel", end);
  currentCanvas.addEventListener("pointerleave", end);

  editor.querySelector("#toolPen").onclick = () => setActiveTool("pen");
  editor.querySelector("#toolEraser").onclick = () => setActiveTool("eraser");
  editor.querySelector("#inputPen").onclick = () => setInputMode("pen");
  editor.querySelector("#inputHand").onclick = () => setInputMode("hand");
  editor.querySelectorAll("[data-background-mode]").forEach(btn => {
    btn.onclick = () => setBackgroundMode(btn.dataset.backgroundMode);
  });
  const countInput = editor.querySelector("#backgroundAyahCount");
  if (countInput) {
    countInput.onchange = async () => {
      backgroundAyahCount = Math.max(1, Math.min(50, Number(countInput.value) || 1));
      countInput.value = String(backgroundAyahCount);
      if (backgroundMode === "range") {
        await buildDrawingBackground(backgroundMode);
        redrawFromStrokes();
      }
    };
  }
  editor.querySelector("#clearCanvas").onclick = () => {
    clearInk();
    strokes = [];
    activeStroke = null;
    dirty = true;
    redrawVisibleCanvas();
    toast("تم مسح الرسم فقط، والخلفية كما هي.");
  };
  editor.querySelector("#saveDrawingJson").onclick = async () => {
    try {
      const note = await buildDrawingNote();
      await saveNote(note);
      dirty = false;
      toast("تم حفظ الرسم في مكتبتك.");
    } catch (error) {
      console.error(error);
      toast("تعذر حفظ الرسم.");
    }
  };
  editor.querySelector("#exportDrawingJson").onclick = async () => {
    const note = await buildDrawingNote();
    downloadText(`drawing-${currentAyah.surah}-${currentAyah.numberInSurah}.json`, JSON.stringify(note, null, 2));
  };
  editor.querySelector("#exportDrawingPng").onclick = () => downloadDataUrl(`drawing-${currentAyah.surah}-${currentAyah.numberInSurah}.png`, currentCanvas.toDataURL("image/png"));
}

function canUsePointer(event) {
  if (inputMode === "pen") {
    if (event.pointerType === "touch") return false;
    // Mouse is accepted so the feature remains testable on desktop.
    return event.pointerType === "pen" || event.pointerType === "mouse" || event.pointerType === "";
  }
  if (event.pointerType === "touch" && !event.isPrimary) return false;
  if (isLikelyPalm(event)) return false;
  return true;
}

function isLikelyPalm(event) {
  return event.pointerType === "touch" && (event.width > 48 || event.height > 48);
}

function clearInk() {
  if (!inkCtx) return;
  inkCtx.clearRect(0, 0, inkCanvas.width, inkCanvas.height);
}

function drawPaperBackground() {
  ctx.fillStyle = "#fbfaf5";
  ctx.fillRect(0, 0, currentCanvas.width, currentCanvas.height);
  ctx.strokeStyle = "#d7cbb2";
  ctx.lineWidth = 3;
  roundRect(ctx, 36, 36, currentCanvas.width - 72, currentCanvas.height - 72, 28);
  ctx.stroke();
}

function redrawVisibleCanvas() {
  if (!ctx) return;
  drawPaperBackground();
  if (backgroundImageElement) {
    drawImageContained(ctx, backgroundImageElement, 64, 64, currentCanvas.width - 128, currentCanvas.height - 128);
  } else if (backgroundMode !== "none" && backgroundAyahs.length) {
    drawQuranBackground(backgroundAyahs, backgroundLabel);
  }
  ctx.drawImage(inkCanvas, 0, 0);
}

function redrawFromStrokes() {
  clearInk();
  for (const stroke of strokes) drawFullStroke(inkCtx, stroke);
  redrawVisibleCanvas();
}

function drawFullStroke(targetCtx, stroke) {
  if (!stroke.points || stroke.points.length < 2) return;
  for (let i = 1; i < stroke.points.length; i++) {
    drawLine(targetCtx, stroke.points[i - 1], stroke.points[i], stroke);
  }
}

function drawLine(targetCtx, a, b, stroke) {
  targetCtx.save();
  targetCtx.lineCap = "round";
  targetCtx.lineJoin = "round";
  targetCtx.lineWidth = stroke.width;
  if (stroke.tool === "eraser") {
    targetCtx.globalCompositeOperation = "destination-out";
    targetCtx.strokeStyle = "rgba(0,0,0,1)";
  } else {
    targetCtx.globalCompositeOperation = "source-over";
    targetCtx.strokeStyle = stroke.color;
  }
  targetCtx.beginPath();
  targetCtx.moveTo(a.x, a.y);
  targetCtx.lineTo(b.x, b.y);
  targetCtx.stroke();
  targetCtx.restore();
}

async function buildDrawingBackground(nextMode) {
  backgroundImageData = null;
  backgroundImageElement = null;
  backgroundAyahs = [];
  backgroundLabel = "";

  if (nextMode === "none") {
    toast("الخلفية بدون آية أو صفحة.");
    return;
  }

  if (nextMode === "ayah") {
    backgroundAyahs = [currentAyah].filter(Boolean);
    backgroundLabel = `${currentAyah.sName || "سورة"} - آية ${fmtNum(currentAyah.numberInSurah)}`;
    toast("تم عرض الآية كخلفية للرسم.");
    return;
  }

  if (nextMode === "range") {
    const count = Math.max(1, Math.min(50, backgroundAyahCount || 1));
    const startIndex = Math.max(0, (currentAyah.number || 1) - 1);
    backgroundAyahs = appState.indexByGlobal.slice(startIndex, startIndex + count).filter(Boolean);
    const last = backgroundAyahs[backgroundAyahs.length - 1] || currentAyah;
    backgroundLabel = backgroundAyahs.length === 1
      ? `${currentAyah.sName || "سورة"} - آية ${fmtNum(currentAyah.numberInSurah)}`
      : `من ${currentAyah.sName || "سورة"} ${fmtNum(currentAyah.numberInSurah)} إلى ${last.sName || "سورة"} ${fmtNum(last.numberInSurah)}`;
    toast(`تم عرض ${fmtNum(backgroundAyahs.length)} آيات كخلفية للرسم.`);
    return;
  }

  if (nextMode === "page") {
    const page = currentAyah.page || appState.pointer.page;
    backgroundAyahs = appState.indexByPage.get(page) || [];
    backgroundLabel = `صفحة ${fmtNum(page)}`;
    if (!backgroundAyahs.length) {
      toast("لم أجد بيانات الصفحة الحالية، اختر آية أو عدد آيات بدلًا من ذلك.");
      return;
    }
    toast("تم عرض الصفحة كاملة كخلفية للرسم.");
  }
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = src;
  });
}

function drawQuranBackground(ayahs, label) {
  const box = {
    x: 92,
    y: 104,
    width: currentCanvas.width - 184,
    height: currentCanvas.height - 220
  };

  ctx.save();
  ctx.direction = "rtl";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  ctx.fillStyle = "#7c5f32";
  ctx.font = "bold 34px system-ui, 'Noto Sans Arabic', sans-serif";
  ctx.fillText(label || "ملاحظة قرآنية", currentCanvas.width / 2, 72);

  const count = Math.max(1, ayahs.length);
  let fontSize = count <= 1 ? 58 : count <= 5 ? 44 : count <= 10 ? 36 : 30;
  let lines = [];
  let lineHeight = 0;

  while (fontSize >= 22) {
    ctx.font = `${fontSize}px 'Amiri Quran', serif`;
    lineHeight = Math.round(fontSize * 1.85);
    lines = buildQuranLines(ctx, ayahs, box.width);
    if (lines.length * lineHeight <= box.height) break;
    fontSize -= 2;
  }

  const totalHeight = lines.length * lineHeight;
  let y = box.y + Math.max(0, (box.height - totalHeight) / 2) + lineHeight / 2;
  ctx.font = `${fontSize}px 'Amiri Quran', serif`;
  ctx.fillStyle = "#111827";

  for (const line of lines) {
    if (line.kind === "surah") {
      ctx.save();
      ctx.font = `bold ${Math.max(24, fontSize - 4)}px system-ui, 'Noto Sans Arabic', sans-serif`;
      ctx.fillStyle = "#8a6b3a";
      ctx.fillText(line.text, currentCanvas.width / 2, y);
      ctx.restore();
    } else {
      ctx.fillStyle = "#111827";
      ctx.fillText(line.text, currentCanvas.width / 2, y);
    }
    y += lineHeight;
  }

  ctx.font = "24px system-ui, 'Noto Sans Arabic', sans-serif";
  ctx.fillStyle = "#9a7b4a";
  ctx.fillText("اكتب ملاحظاتك وارسم فوق النص", currentCanvas.width / 2, currentCanvas.height - 78);
  ctx.restore();
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
  const words = String(text).split(/\s+/).filter(Boolean);
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

function drawImageContained(targetCtx, image, x, y, width, height) {
  const ratio = Math.min(width / image.width, height / image.height);
  const drawWidth = image.width * ratio;
  const drawHeight = image.height * ratio;
  const dx = x + (width - drawWidth) / 2;
  const dy = y + (height - drawHeight) / 2;
  targetCtx.drawImage(image, dx, dy, drawWidth, drawHeight);
}

function wrapArabicText(targetCtx, text, centerX, centerY, maxWidth, lineHeight) {
  const words = String(text).split(/\s+/).filter(Boolean);
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
  const startY = centerY - ((lines.length - 1) * lineHeight) / 2;
  lines.forEach((currentLine, i) => targetCtx.fillText(currentLine, centerX, startY + i * lineHeight));
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

async function buildDrawingNote() {
  redrawVisibleCanvas();
  return {
    id: `drawing_${currentAyah.surah}_${currentAyah.numberInSurah}_${Date.now()}`,
    type: "drawing",
    surah: currentAyah.surah,
    ayah: currentAyah.numberInSurah,
    ayahGlobal: currentAyah.number,
    ayahText: currentAyah.text,
    surahName: currentAyah.sName || "",
    title: `رسم على ${currentAyah.sName || "سورة"} - آية ${currentAyah.numberInSurah}`,
    format: "background-strokes-v3",
    backgroundMode,
    backgroundLabel,
    backgroundAyahCount,
    backgroundAyahs: backgroundAyahs.map(a => ({
      surah: a.surah,
      surahName: a.sName || "",
      ayah: a.numberInSurah,
      ayahGlobal: a.number,
      page: a.page,
      text: a.text || ""
    })),
    backgroundImage: backgroundImageData,
    canvasSize: { width: currentCanvas.width, height: currentCanvas.height },
    strokes,
    previewImage: currentCanvas.toDataURL("image/png")
  };
}

async function openLibrary(activeTab = "notes") {
  const content = document.getElementById("libraryContent");
  content.innerHTML = `<p class="muted-text">جاري تحميل مكتبتك...</p>`;
  ModalManager.open("libraryModal", { closeOnBackdrop: true, closeOnBack: true });

  try {
    const [notes, bookmarks, exportsList, todayProgress, khatmaProgress, progressHistory, testResults] = await Promise.all([
      getNotes(),
      getBookmarks(),
      getExports(),
      getTodayProgress(),
      getKhatmaProgress(),
      getDailyProgressHistory(30),
      getTestResults()
    ]);
    renderLibrary(content, { notes, bookmarks, exportsList, todayProgress, khatmaProgress, progressHistory, testResults, activeTab });
  } catch (error) {
    console.error(error);
    content.innerHTML = `<p class="muted-text">تعذر تحميل المكتبة. جرّب إعادة فتح الصفحة.</p>`;
    toast("تعذر تحميل المكتبة.");
  }
}

function renderLibrary(content, { notes, bookmarks, exportsList, todayProgress, khatmaProgress, progressHistory, testResults = [], activeTab }) {
  content.innerHTML = `
    <div class="library-toolbar library-tabs" role="tablist" aria-label="أقسام المكتبة">
      <button class="navbtn ${activeTab === "notes" ? "active" : ""}" data-library-tab="notes" type="button">الملاحظات (${fmtNum(notes.length)})</button>
      <button class="navbtn ${activeTab === "bookmarks" ? "active" : ""}" data-library-tab="bookmarks" type="button">العلامات (${fmtNum(bookmarks.length)})</button>
      <button class="navbtn ${activeTab === "exports" ? "active" : ""}" data-library-tab="exports" type="button">الصور (${fmtNum(exportsList.length)})</button>
      <button class="navbtn ${activeTab === "progress" ? "active" : ""}" data-library-tab="progress" type="button">التقدم</button>
      <button class="navbtn ${activeTab === "tests" ? "active" : ""}" data-library-tab="tests" type="button">الاختبارات (${fmtNum(testResults.length)})</button>
      <button class="navbtn ${activeTab === "backup" ? "active" : ""}" data-library-tab="backup" type="button">نسخ احتياطي</button>
    </div>
    <div class="library-filter-row" ${activeTab === "backup" ? "hidden" : ""}>
      <input id="librarySearch" type="text" placeholder="بحث في المكتبة..." autocomplete="off">
      ${activeTab === "notes" ? `
        <select id="libraryTypeFilter" aria-label="نوع الملاحظة">
          <option value="all">كل الملاحظات</option>
          <option value="text">كتابة فقط</option>
          <option value="drawing">رسومات فقط</option>
        </select>` : ""}
    </div>
    <div id="libraryList"></div>
  `;

  const list = content.querySelector("#libraryList");
  renderCurrentLibraryTab(list, { notes, bookmarks, exportsList, activeTab, todayProgress, khatmaProgress, progressHistory, testResults });

  content.querySelectorAll("[data-library-tab]").forEach(button => {
    button.onclick = () => openLibrary(button.dataset.libraryTab);
  });

  const search = content.querySelector("#librarySearch");
  const typeFilter = content.querySelector("#libraryTypeFilter");
  const rerender = () => renderCurrentLibraryTab(list, {
    notes,
    bookmarks,
    exportsList,
    todayProgress,
    khatmaProgress,
    progressHistory,
    testResults,
    activeTab,
    query: search?.value.trim() || "",
    typeFilter: typeFilter?.value || "all"
  });
  if (search) search.oninput = rerender;
  if (typeFilter) typeFilter.onchange = rerender;

  content.onclick = async (event) => {
    const exportNoteBtn = event.target.closest("[data-export-note]");
    const deleteNoteBtn = event.target.closest("[data-delete-note]");
    const exportImageBtn = event.target.closest("[data-export-note-image]");
    const exportAttachedBtn = event.target.closest("[data-export-attached-image]");
    const deleteBookmarkBtn = event.target.closest("[data-delete-bookmark]");
    const downloadExportBtn = event.target.closest("[data-download-export]");
    const deleteExportBtn = event.target.closest("[data-delete-export]");
    const backupExportBtn = event.target.closest("#exportUserBackup");
    const backupImportBtn = event.target.closest("#importUserBackupBtn");
    const clearAllBtn = event.target.closest("#clearUserData");
    const deleteTestBtn = event.target.closest("[data-delete-test]");
    const exportTestBtn = event.target.closest("[data-export-test]");

    if (exportNoteBtn) {
      const note = notes.find(n => n.id === exportNoteBtn.dataset.exportNote);
      if (note) downloadText(`${note.id}.json`, JSON.stringify(note, null, 2));
    }
    if (exportImageBtn) {
      const note = notes.find(n => n.id === exportImageBtn.dataset.exportNoteImage);
      if (note?.previewImage) downloadDataUrl(`${note.id}.png`, note.previewImage);
    }
    if (exportAttachedBtn) {
      const note = notes.find(n => n.id === exportAttachedBtn.dataset.exportAttachedImage);
      if (note?.attachedScreenshot?.image) downloadDataUrl(`${note.id}-attached.png`, note.attachedScreenshot.image);
    }
    if (deleteNoteBtn) {
      const ok = await ModalManager.askConfirm("حذف الملاحظة؟", "سيتم حذف هذه الملاحظة من مكتبتك.");
      if (!ok) return;
      await deleteNote(deleteNoteBtn.dataset.deleteNote);
      toast("تم حذف الملاحظة.");
      openLibrary("notes");
    }
    if (deleteBookmarkBtn) {
      await deleteBookmark(deleteBookmarkBtn.dataset.deleteBookmark);
      toast("تم حذف العلامة.");
      openLibrary("bookmarks");
    }
    if (downloadExportBtn) {
      const item = exportsList.find(x => x.id === downloadExportBtn.dataset.downloadExport);
      if (item?.imageData) downloadDataUrl(`${item.id}.png`, item.imageData);
    }
    if (deleteExportBtn) {
      await deleteExport(deleteExportBtn.dataset.deleteExport);
      toast("تم حذف الصورة من المكتبة.");
      openLibrary("exports");
    }
    if (exportTestBtn) {
      const item = testResults.find(x => x.id === exportTestBtn.dataset.exportTest);
      if (item) downloadText(`${item.id}.json`, JSON.stringify(item, null, 2));
    }
    if (deleteTestBtn) {
      const ok = await ModalManager.askConfirm("حذف نتيجة الاختبار؟", "سيتم حذف هذه النتيجة من مكتبتك.");
      if (!ok) return;
      await deleteTestResult(deleteTestBtn.dataset.deleteTest);
      toast("تم حذف نتيجة الاختبار.");
      openLibrary("tests");
    }
    if (backupExportBtn) {
      const backup = await exportAllUserData();
      downloadText(`quran-app-backup-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(backup, null, 2));
      toast("تم تجهيز النسخة الاحتياطية.");
    }
    if (backupImportBtn) {
      content.querySelector("#importUserBackupInput")?.click();
    }
    if (clearAllBtn) {
      const ok = await ModalManager.askConfirm("حذف كل بيانات المكتبة؟", "سيتم حذف الملاحظات والرسومات والعلامات والصور المحفوظة محليًا.");
      if (!ok) return;
      await clearAllUserData();
      toast("تم حذف بيانات المكتبة المحلية.");
      openLibrary("backup");
    }
  };

  const backupInput = content.querySelector("#importUserBackupInput");
  if (backupInput) {
    backupInput.onchange = async (event) => {
      const file = event.target.files?.[0];
      if (!file) return;
      try {
        const payload = JSON.parse(await file.text());
        const result = await importUserData(payload);
        toast(`تم الاستيراد: ${fmtNum(result.notes)} ملاحظة، ${fmtNum(result.bookmarks)} علامة، ${fmtNum(result.exports)} صورة، ${fmtNum(result.progress || 0)} سجل تقدم، ${fmtNum(result.tests || 0)} اختبار.`);
        openLibrary("backup");
      } catch (error) {
        console.error(error);
        toast("تعذر استيراد ملف النسخة الاحتياطية.");
      }
    };
  }
}

function renderCurrentLibraryTab(target, { notes, bookmarks, exportsList, activeTab, todayProgress, khatmaProgress, progressHistory, testResults = [], query = "", typeFilter = "all" }) {
  const q = query.toLowerCase();
  if (activeTab === "backup") {
    target.innerHTML = renderBackupPanel(notes, bookmarks, exportsList, progressHistory);
    return;
  }
  if (activeTab === "progress") {
    target.innerHTML = renderProgressPanel(todayProgress, khatmaProgress, progressHistory, { notes, bookmarks, exportsList });
    return;
  }
  if (activeTab === "tests") {
    const filtered = testResults.filter(item => matchesQuery(item, q));
    target.innerHTML = renderTestsPanel(filtered);
    return;
  }
  if (activeTab === "bookmarks") {
    const filtered = bookmarks.filter(item => matchesQuery(item, q));
    target.innerHTML = filtered.length ? `<div class="library-list">${filtered.map(renderBookmarkCard).join("")}</div>` : emptyLibraryMessage("لا توجد علامات مطابقة.");
    return;
  }
  if (activeTab === "exports") {
    const filtered = exportsList.filter(item => matchesQuery(item, q));
    target.innerHTML = filtered.length ? `<div class="library-list">${filtered.map(renderExportCard).join("")}</div>` : emptyLibraryMessage("لا توجد صور محفوظة مطابقة.");
    return;
  }

  let filtered = notes.filter(item => matchesQuery(item, q));
  if (typeFilter !== "all") filtered = filtered.filter(item => item.type === typeFilter);
  target.innerHTML = filtered.length ? `<div class="library-list">${filtered.map(renderNoteCard).join("")}</div>` : emptyLibraryMessage("لا توجد ملاحظات محفوظة بعد.");
}

function emptyLibraryMessage(text) {
  return `<p class="muted-text library-empty">${escapeHTML(text)}</p>`;
}

function matchesQuery(item, q) {
  if (!q) return true;
  const haystack = [
    item.title,
    item.content,
    item.ayahText,
    item.text,
    item.surahName,
    item.label,
    item.backgroundLabel,
    ...(Array.isArray(item.wrongWords) ? item.wrongWords : []),
    ...(Array.isArray(item.tags) ? item.tags : [])
  ].filter(Boolean).join(" ").toLowerCase();
  return haystack.includes(q);
}


function renderTestsPanel(testResults = []) {
  if (!testResults.length) return emptyLibraryMessage("لا توجد نتائج اختبارات محفوظة بعد.");
  const bySurah = new Map();
  for (const test of testResults) {
    for (const ayah of test.ayahs || []) {
      const key = ayah.surah || ayah.surahName || "unknown";
      const item = bySurah.get(key) || { name: ayah.surahName || "سورة", count: 0, scoreSum: 0 };
      item.count++;
      item.scoreSum += Number(ayah.score || 0);
      bySurah.set(key, item);
    }
  }
  const surahStats = [...bySurah.values()].slice(0, 8).map(item => {
    const avg = item.count ? Math.round(item.scoreSum / item.count) : 0;
    return `<div class="stat-tile"><strong>${fmtNum(avg)}%</strong><span>${escapeHTML(item.name)} • ${fmtNum(item.count)} آية</span></div>`;
  }).join("");
  const recent = testResults.map(renderTestCard).join("");
  return `
    <div class="progress-library-panel">
      <article class="library-card progress-summary-card">
        <h4>إحصائيات السور المختبرة</h4>
        <div class="stats-grid compact-stats">${surahStats || `<p class="muted-text">لا توجد إحصائيات كافية بعد.</p>`}</div>
      </article>
      <article class="library-card">
        <h4>آخر الاختبارات</h4>
        <div class="library-list">${recent}</div>
      </article>
    </div>`;
}

function renderTestCard(test) {
  const date = test.createdAt ? new Date(test.createdAt).toLocaleString("ar-EG") : "";
  const wrong = (test.wrongWords || []).slice(0, 10).map(escapeHTML).join("، ");
  return `
    <article class="library-card test-library-card">
      <div class="library-card-head">
        <h4>${escapeHTML(test.label || "اختبار")}</h4>
        <span class="status-pill">${fmtNum(Math.round(Number(test.score || 0)))}%</span>
      </div>
      <p class="muted-text">${escapeHTML(date)} • ${escapeHTML(test.strictness === "strict" ? "تصحيح صارم" : "تصحيح مرن")}</p>
      <p>الكلمات الصحيحة: ${fmtNum(test.correctWords || 0)} / ${fmtNum(test.totalWords || 0)}</p>
      ${wrong ? `<p class="muted-text">كلمات تحتاج مراجعة: ${wrong}</p>` : `<p class="muted-text">لا توجد كلمات خاطئة مسجلة.</p>`}
      <div class="modal-actions">
        <button class="navbtn" data-export-test="${escapeHTML(test.id)}" type="button">تصدير JSON</button>
        <button class="navbtn danger" data-delete-test="${escapeHTML(test.id)}" type="button">حذف</button>
      </div>
    </article>`;
}

function renderProgressPanel(todayProgress, khatmaProgress, progressHistory = [], counts = {}) {
  const wirdStats = calculateWirdStats(todayProgress, appState.settings);
  const khatmaStats = calculateKhatmaStats(khatmaProgress);
  const readingStats = calculateLibraryReadingStats(progressHistory);
  const historyRows = progressHistory.length ? progressHistory.map(day => {
    const stats = calculateWirdStats(day, appState.settings);
    const pages = new Set((day.pages || []).map(Number).filter(Number.isFinite)).size;
    const mins = Math.floor(Number(day.seconds || 0) / 60);
    return `<div class="wird-history-row"><span>${escapeHTML(day.date || "")}</span><span>${fmtNum(stats.done)} ${progressGoalLabel(stats.goalType)}</span><span>${fmtNum(pages)} صفحات</span><span>${fmtNum(mins)} دقيقة</span></div>`;
  }).join("") : `<p class="muted-text">لا يوجد سجل تقدم بعد.</p>`;

  return `
    <div class="progress-library-panel">
      <article class="library-card progress-summary-card">
        <h4>ورد اليوم</h4>
        <p class="progress-big-line">${fmtNum(wirdStats.done)} / ${fmtNum(wirdStats.goalValue)} ${progressGoalLabel(wirdStats.goalType)}</p>
        ${progressBarHTML(wirdStats.ratio)}
        <p class="muted-text">آخر موضع: ${todayProgress?.lastAyah ? `${escapeHTML(todayProgress.lastAyah.surahName || "سورة")} - آية ${fmtNum(todayProgress.lastAyah.ayah || 1)}` : "لم يتم تسجيل قراءة اليوم بعد"}</p>
      </article>
      <article class="library-card progress-summary-card">
        <h4>الختمة</h4>
        <p class="progress-big-line">${fmtNum(Math.round(khatmaStats.ratio * 100))}%</p>
        ${progressBarHTML(khatmaStats.ratio)}
        <p>المتبقي تقريبًا: ${fmtNum(khatmaStats.approxRemainingPages)} صفحة • ${fmtNum(khatmaStats.remainingAyahs)} آية</p>
      </article>
      <article class="library-card progress-summary-card">
        <h4>إحصائيات القراءة</h4>
        <div class="stats-grid compact-stats">
          <div class="stat-tile"><strong>${fmtNum(readingStats.streak)}</strong><span>أيام متتالية</span></div>
          <div class="stat-tile"><strong>${fmtNum(readingStats.weekAyahs)}</strong><span>آيات هذا الأسبوع</span></div>
          <div class="stat-tile"><strong>${fmtNum(readingStats.weekPages)}</strong><span>صفحات هذا الأسبوع</span></div>
          <div class="stat-tile"><strong>${fmtNum(readingStats.weekMinutes)}</strong><span>دقائق هذا الأسبوع</span></div>
        </div>
      </article>
      <article class="library-card progress-summary-card">
        <h4>ملخص المكتبة</h4>
        <div class="stats-grid compact-stats">
          <div class="stat-tile"><strong>${fmtNum(counts.notes?.length || 0)}</strong><span>ملاحظات</span></div>
          <div class="stat-tile"><strong>${fmtNum(counts.bookmarks?.length || 0)}</strong><span>علامات</span></div>
          <div class="stat-tile"><strong>${fmtNum(counts.exportsList?.length || 0)}</strong><span>صور</span></div>
          <div class="stat-tile"><strong>${fmtNum(progressHistory.length)}</strong><span>أيام مسجلة</span></div>
        </div>
      </article>
      <article class="library-card">
        <h4>سجل الأيام</h4>
        <div class="wird-history">${historyRows}</div>
      </article>
    </div>`;
}

function calculateLibraryReadingStats(history = []) {
  const days = [...history].sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")));
  const week = days.slice(0, 7);
  const countUnique = (items) => new Set((items || []).map(Number).filter(Number.isFinite)).size;
  const dayHasReading = (day) => countUnique(day.ayahGlobals) > 0 || countUnique(day.pages) > 0 || Number(day.seconds || 0) >= 60;
  let streak = 0;
  const cursor = new Date();
  for (const day of days) {
    const expected = cursor.toISOString().slice(0, 10);
    if (day.date !== expected || !dayHasReading(day)) break;
    streak++;
    cursor.setDate(cursor.getDate() - 1);
  }
  return {
    streak,
    weekAyahs: week.reduce((sum, day) => sum + countUnique(day.ayahGlobals), 0),
    weekPages: week.reduce((sum, day) => sum + countUnique(day.pages), 0),
    weekMinutes: week.reduce((sum, day) => sum + Math.floor(Number(day.seconds || 0) / 60), 0)
  };
}

function progressBarHTML(ratio) {
  return `<div class="progress-bar" aria-hidden="true"><span style="inline-size:${Math.round(Math.max(0, Math.min(1, ratio || 0)) * 100)}%"></span></div>`;
}

function progressGoalLabel(type) {
  if (type === "pages") return "صفحات";
  if (type === "minutes") return "دقائق";
  return "آيات";
}

function renderBackupPanel(notes, bookmarks, exportsList, progressHistory = []) {
  return `
    <div class="backup-panel">
      <div class="library-card backup-summary">
        <h4>ملخص البيانات المحلية</h4>
        <p>الملاحظات: ${fmtNum(notes.length)} • العلامات: ${fmtNum(bookmarks.length)} • الصور: ${fmtNum(exportsList.length)} • أيام التقدم: ${fmtNum(progressHistory.length)}</p>
        <p class="muted-text">يتم حفظ هذه البيانات داخل المتصفح باستخدام IndexedDB. خذ نسخة احتياطية قبل نقل الجهاز أو حذف بيانات المتصفح.</p>
      </div>
      <div class="modal-actions backup-actions">
        <button id="exportUserBackup" class="navbtn primary" type="button">تصدير كل بياناتي JSON</button>
        <button id="importUserBackupBtn" class="navbtn" type="button">استيراد نسخة احتياطية</button>
        <input id="importUserBackupInput" type="file" accept="application/json,.json" hidden>
        <button id="clearUserData" class="navbtn danger" type="button">حذف بيانات المكتبة المحلية</button>
      </div>
    </div>`;
}

function renderNoteCard(n) {
  const title = n.title || (n.type === "drawing" ? "رسم بالقلم" : "ملاحظة");
  const backgroundLabel = n.type === "drawing" ? getBackgroundLabel(n) : "";
  const attached = n.attachedScreenshot?.image ? `
    <div class="note-preview-block">
      <span class="muted-text">${escapeHTML(n.attachedScreenshot.label || "صورة مرفقة من نسخة قديمة")}</span>
      <img src="${n.attachedScreenshot.image}" alt="صورة مرفقة بالملاحظة">
      <button class="navbtn" data-export-attached-image="${escapeHTML(n.id)}" type="button">تحميل الصورة المرفقة</button>
    </div>` : "";
  const drawing = n.previewImage ? `
    <div class="note-preview-block">
      <span class="muted-text">معاينة الرسم${backgroundLabel ? ` • ${escapeHTML(backgroundLabel)}` : ""}</span>
      <img src="${n.previewImage}" alt="معاينة الرسم">
      <button class="navbtn" data-export-note-image="${escapeHTML(n.id)}" type="button">تحميل الرسم PNG</button>
    </div>` : "";

  return `
    <article class="library-card">
      <h4>${escapeHTML(title)}</h4>
      <p>${n.type === "drawing" ? "رسم" : "كتابة"} • سورة ${escapeHTML(n.surahName || String(n.surah || ""))} • آية ${escapeHTML(n.ayah || "")}</p>
      <p>${escapeHTML(n.content || n.ayahText || "")}</p>
      ${drawing}
      ${attached}
      <div class="modal-actions">
        <button class="navbtn" data-export-note="${escapeHTML(n.id)}" type="button">تصدير JSON</button>
        <button class="navbtn danger" data-delete-note="${escapeHTML(n.id)}" type="button">حذف</button>
      </div>
    </article>`;
}

function renderBookmarkCard(bookmark) {
  return `
    <article class="library-card">
      <h4>علامة محفوظة</h4>
      <p>سورة ${escapeHTML(bookmark.surahName || String(bookmark.surah || ""))} • آية ${escapeHTML(bookmark.numberInSurah || bookmark.ayah || "")}</p>
      <p>${escapeHTML(bookmark.text || "")}</p>
      <div class="modal-actions">
        <button class="navbtn danger" data-delete-bookmark="${escapeHTML(bookmark.key)}" type="button">حذف العلامة</button>
      </div>
    </article>`;
}

function renderExportCard(item) {
  const preview = item.imageData ? `
    <div class="note-preview-block">
      <img src="${item.imageData}" alt="صورة محفوظة من القرآن">
    </div>` : "";
  return `
    <article class="library-card">
      <h4>${escapeHTML(item.title || "صورة محفوظة")}</h4>
      <p>${escapeHTML(item.label || "")} ${item.scope ? `• ${escapeHTML(scopeLabel(item.scope))}` : ""}</p>
      ${preview}
      <div class="modal-actions">
        <button class="navbtn" data-download-export="${escapeHTML(item.id)}" type="button">تحميل PNG</button>
        <button class="navbtn danger" data-delete-export="${escapeHTML(item.id)}" type="button">حذف</button>
      </div>
    </article>`;
}

function scopeLabel(scope) {
  if (scope === "ayah") return "آية واحدة";
  if (scope === "range") return "عدد آيات";
  if (scope === "page") return "صفحة كاملة";
  return scope;
}

function getBackgroundLabel(note) {
  if (note.backgroundLabel) return note.backgroundLabel;
  if (note.backgroundMode === "ayah") return "خلفية الآية";
  if (note.backgroundMode === "range") return "خلفية عدد آيات";
  if (note.backgroundMode === "page") return "خلفية الصفحة";
  if (note.backgroundImage) return "خلفية محفوظة";
  return "بدون خلفية";
}
