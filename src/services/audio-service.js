import { APP_CONFIG, RECITERS } from "../core/config.js";
import { toast } from "../core/dom.js";

export class AudioService {
  constructor(player, state, onAyahChange, onUnitFinished) {
    this.player = player;
    this.state = state;
    this.onAyahChange = onAyahChange;
    this.onUnitFinished = onUnitFinished;
    this.playbackMode = "unit"; // "unit" follows continuous/repeat, "single" plays selected ayah only.
    this.player.addEventListener("ended", () => this.handleEnded());
    this.player.addEventListener("error", () => toast("تعذر تشغيل الصوت. تحقق من اتصال الإنترنت."));
  }

  urlFor(ayah) {
    const reciter = RECITERS[this.state.settings.reciter];
    if (!reciter?.folder) return null;
    const s = String(ayah.surah).padStart(3, "0");
    const a = String(ayah.numberInSurah).padStart(3, "0");
    return `${APP_CONFIG.paths.audioBaseOnline}${reciter.folder}/${s}${a}.mp3`;
  }

  canPlayOnlineAudio() {
    if (this.state.settings.reciter === "none") {
      toast("تم اختيار: بدون صوت.");
      return false;
    }
    if (!navigator.onLine) {
      toast("الصوت يحتاج اتصال بالإنترنت في هذه النسخة.");
      return false;
    }
    return true;
  }

  async playUnit(unit, startIndex = 0) {
    if (!Array.isArray(unit) || unit.length === 0) {
      toast("لا توجد آيات لتشغيلها.");
      return;
    }
    if (!this.canPlayOnlineAudio()) return;

    this.playbackMode = "unit";
    this.state.repeatCounter = 0;
    this.state.currentAudioUnit = unit;
    this.state.currentAudioIndex = startIndex;
    await this.playCurrent();
  }

  async playSingleAyah(ayah) {
    if (!ayah) return;
    if (!this.canPlayOnlineAudio()) return;

    this.playbackMode = "single";
    this.state.repeatCounter = 0;
    this.state.currentAudioUnit = [ayah];
    this.state.currentAudioIndex = 0;
    await this.playCurrent();
  }

  // Backward compatible name used by ayah actions.
  async playAyah(ayah) {
    await this.playSingleAyah(ayah);
  }

  async playCurrent() {
    const ayah = this.state.currentAudioUnit[this.state.currentAudioIndex];
    if (!ayah) return;
    const url = this.urlFor(ayah);
    if (!url) return;
    this.player.src = url;
    try {
      await this.player.play();
      this.state.isPlaying = true;
      this.onAyahChange?.(ayah);
    } catch {
      this.state.isPlaying = false;
      toast("لم يتم تشغيل الصوت. قد يحتاج المتصفح إلى ضغطة مباشرة من المستخدم.");
    }
  }

  stop() {
    this.player.pause();
    this.player.removeAttribute("src");
    this.player.load();
    this.state.isPlaying = false;
    this.state.repeatCounter = 0;
    this.state.currentAudioIndex = 0;
    this.onAyahChange?.(null);
  }

  async toggle(unit) {
    if (this.state.isPlaying) {
      this.stop();
      return;
    }
    await this.playUnit(unit, 0);
  }

  async handleEnded() {
    // Continue inside the current unit first: page/surah/juz/hizb/ayah unit.
    if (this.state.currentAudioIndex < this.state.currentAudioUnit.length - 1) {
      this.state.currentAudioIndex++;
      await this.playCurrent();
      return;
    }

    // Ayah action playback must stop after the selected ayah only.
    if (this.playbackMode === "single") {
      this.state.isPlaying = false;
      this.state.currentAudioIndex = 0;
      this.onAyahChange?.(null);
      return;
    }

    // Global speaker: repeat the whole current unit according to settings.
    if (this.state.settings.readingMode === "repeat") {
      const repeatTarget = Math.max(1, Number(this.state.settings.repeat || 1));
      this.state.repeatCounter++;
      if (this.state.repeatCounter < repeatTarget) {
        this.state.currentAudioIndex = 0;
        await this.playCurrent();
        return;
      }
      this.state.isPlaying = false;
      this.state.repeatCounter = 0;
      this.state.currentAudioIndex = 0;
      this.onAyahChange?.(null);
      return;
    }

    // Global speaker: continuous mode moves to the next selected unit.
    if (this.state.settings.readingMode === "continuous") {
      this.state.repeatCounter = 0;
      this.state.currentAudioIndex = 0;
      await this.onUnitFinished?.();
      return;
    }

    this.state.isPlaying = false;
    this.onAyahChange?.(null);
  }
}
