export const APP_CONFIG = {
  version: "0.4.0",
  dataMode: "single",
  paths: {
    // انسخ ملف quran.json بجوار index.html أو داخل data/quran.json
    quranSingleCandidates: ["./data/quran.json", "./quran.json"],
    surahDir: "./data/quran/surah/",
    tafsirDir: "./data/tafsir/",
    tafsirLocalPattern: "./data/tafsir/{tafsir}/surah_{surah}.json",
    translationDir: "./data/translation/",
    audioBaseOnline: "https://everyayah.com/data/"
  },
  offline: {
    cacheAudio: false,
    cacheTafsir: true,
    cacheTranslations: true
  },
  tafsirOnline: "https://api.alquran.cloud/v1/ayah/"
};

export const RECITERS = {
  husary_mualim: {
    label: "الحصري (المعلّم)",
    folder: "Husary_Muallim_128kbps"
  },
  ghamdi: {
    label: "سعد الغامدي",
    folder: "Ghamadi_40kbps"
  },
  alafasy: {
    label: "مشاري العفاسي",
    folder: "Alafasy_64kbps"
  },
  none: {
    label: "بدون صوت",
    folder: null
  }
};

export const TAFSIR_LABELS = {
  "ar.muyassar": "التفسير الميسر",
  "ar.jalalayn": "تفسير الجلالين",
  "ar.ibnkatheer": "تفسير ابن كثير"
};
