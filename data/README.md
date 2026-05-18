# مجلد البيانات

في v0.1 يمكن استخدام ملف واحد:

```text
quran.json
```

إما بجوار `index.html` أو هنا:

```text
data/quran.json
```

الشكل المتوقع قريب من النسخة الأصلية:

```json
[
  {
    "number": 1,
    "name": "الفاتحة",
    "ayahs": [
      {
        "number": 1,
        "numberInSurah": 1,
        "text": "...",
        "qpc_tajweed_text": "...",
        "imlaei_simple_text": "...",
        "page": 1,
        "juz": 1,
        "hizbQuarter": 1
      }
    ]
  }
]
```

في v0.2 سنضيف قراءة الملفات المقسمة:

```text
data/quran/surah/surah_001.json
```
