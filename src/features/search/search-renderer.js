import { escapeHTML } from "../../core/dom.js";
import { highlightByRanges } from "../../utils/arabic-normalizer.js";

export function renderSearchResults(result, container, onGoToAyah) {
  const { groups, totalMatches, totalAyahs, truncated } = result;

  if (!groups.length) {
    container.innerHTML = `<p class="muted-text search-empty">لا توجد نتائج.</p>`;
    return;
  }

  const digits = new Intl.NumberFormat("ar-EG", { useGrouping: false });
  const summary = `عبارة البحث موجودة ${digits.format(totalMatches)} مرة في ${digits.format(totalAyahs)} آية`;
  const truncatedMessage = truncated ? `<div class="search-warning">تم عرض أول ${digits.format(totalAyahs)} آية فقط للحفاظ على سرعة الصفحة. ضيّق البحث أو النطاق لرؤية نتائج أدق.</div>` : "";

  container.innerHTML = `
    <div class="search-summary">${summary}</div>
    ${truncatedMessage}
    <div class="search-groups">
      ${groups.map(group => renderGroup(group, digits)).join("")}
    </div>
  `;

  container.onclick = (event) => {
    const item = event.target.closest("[data-global]");
    if (!item) return;
    const global = Number(item.dataset.global);
    const ayah = findAyahInGroups(groups, global);
    if (ayah) onGoToAyah(ayah);
  };
}

function renderGroup(group, digits) {
  return `
    <section class="search-group">
      <h4 class="search-group-title">سورة ${escapeHTML(group.name)} <span>(${digits.format(group.surah)})</span></h4>
      ${group.ayat.map(item => renderItem(item, digits)).join("")}
    </section>
  `;
}

function renderItem(item, digits) {
  const ayah = item.ayah;
  const highlighted = highlightByRanges(item.displayText, item.matches);
  return `
    <button class="search-result" type="button" data-global="${ayah.number}">
      <span class="search-ayah-number">${digits.format(ayah.numberInSurah)}</span>
      <span class="search-ayah-text">${highlighted}</span>
      <span class="search-meta">صفحة ${digits.format(ayah.page || 1)} • جزء ${digits.format(ayah.juz || 1)}</span>
    </button>
  `;
}

function findAyahInGroups(groups, global) {
  for (const group of groups) {
    for (const item of group.ayat) {
      if (Number(item.ayah.number) === global) return item.ayah;
    }
  }
  return null;
}
