export const DEFAULT_SETTINGS = {
  showTajweed: false,
  repeat: 1,
  mode: "ayah",
  hizbPart: 4,
  quranFont: "Amiri Quran",
  quranSize: 28,
  theme: "dark",
  paperColor: "",
  readingMode: "continuous",
  tafsir: "ar.muyassar",
  reciter: "husary_mualim",
  notifications: {
    enabled: false,
    dailyTime: "07:00",
    title: "ورد القرآن اليومي",
    body: "حان وقت وردك. أنجزت {done} من {goal} {type}، والمتبقي {remaining}.",
    lastShownDate: ""
  },
  wird: {
    enabled: true,
    goalType: "ayahs",
    goalValue: 10,
    showWidget: true
  },
  khatma: {
    enabled: true,
    targetDays: 30,
    planType: "timed",
    showWidget: true
  },
  home: {
    showOnStart: false
  }
};

export const state = {
  data: null,
  indexByGlobal: [],
  indexByPage: new Map(),
  indexByJuz: new Map(),
  indexByHizbQuarter: new Map(),
  settings: { ...DEFAULT_SETTINGS },
  pointer: { ayahGlobal: 1, surah: 1, page: 1, juz: 1, hizbQuarter: 1, numberInSurah: 1 },
  selectedAyah: null,
  currentAudioUnit: [],
  currentAudioIndex: 0,
  isPlaying: false,
  repeatCounter: 0
};
