const DB_NAME = "quran-app-db";
const DB_VERSION = 3;

const STORES = {
  notes: "notes",
  bookmarks: "bookmarks",
  exports: "exports",
  progress: "progress",
  testResults: "testResults"
};

let dbPromise = null;

export function openAppDB() {
  if (dbPromise) return dbPromise;
  if (!("indexedDB" in window)) {
    dbPromise = Promise.reject(new Error("IndexedDB is not supported in this browser."));
    return dbPromise;
  }

  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;

      if (!db.objectStoreNames.contains(STORES.notes)) {
        const notes = db.createObjectStore(STORES.notes, { keyPath: "id" });
        notes.createIndex("type", "type", { unique: false });
        notes.createIndex("surah", "surah", { unique: false });
        notes.createIndex("createdAt", "createdAt", { unique: false });
        notes.createIndex("updatedAt", "updatedAt", { unique: false });
      }

      if (!db.objectStoreNames.contains(STORES.bookmarks)) {
        const bookmarks = db.createObjectStore(STORES.bookmarks, { keyPath: "key" });
        bookmarks.createIndex("surah", "surah", { unique: false });
        bookmarks.createIndex("createdAt", "createdAt", { unique: false });
      }

      if (!db.objectStoreNames.contains(STORES.exports)) {
        const exportsStore = db.createObjectStore(STORES.exports, { keyPath: "id" });
        exportsStore.createIndex("kind", "kind", { unique: false });
        exportsStore.createIndex("surah", "surah", { unique: false });
        exportsStore.createIndex("createdAt", "createdAt", { unique: false });
      }

      if (!db.objectStoreNames.contains(STORES.progress)) {
        const progress = db.createObjectStore(STORES.progress, { keyPath: "key" });
        progress.createIndex("date", "date", { unique: false });
        progress.createIndex("kind", "kind", { unique: false });
        progress.createIndex("updatedAt", "updatedAt", { unique: false });
      }

      if (!db.objectStoreNames.contains(STORES.testResults)) {
        const testResults = db.createObjectStore(STORES.testResults, { keyPath: "id" });
        testResults.createIndex("createdAt", "createdAt", { unique: false });
        testResults.createIndex("scope", "scope", { unique: false });
        testResults.createIndex("score", "score", { unique: false });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("Unable to open IndexedDB."));
    request.onblocked = () => reject(new Error("Database upgrade is blocked by another tab."));
  });

  return dbPromise;
}

function requestToPromise(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("IndexedDB request failed."));
  });
}

async function withStore(storeName, mode, callback) {
  const db = await openAppDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(storeName, mode);
    const store = transaction.objectStore(storeName);
    let result;

    transaction.oncomplete = () => resolve(result);
    transaction.onerror = () => reject(transaction.error || new Error("IndexedDB transaction failed."));
    transaction.onabort = () => reject(transaction.error || new Error("IndexedDB transaction aborted."));

    try {
      result = callback(store, transaction);
    } catch (error) {
      transaction.abort();
      reject(error);
    }
  });
}

export async function getAllRecords(storeName) {
  return withStore(storeName, "readonly", store => requestToPromise(store.getAll()));
}

export async function getRecord(storeName, key) {
  return withStore(storeName, "readonly", store => requestToPromise(store.get(key)));
}

export async function putRecord(storeName, record) {
  return withStore(storeName, "readwrite", store => {
    store.put(record);
    return record;
  });
}

export async function deleteRecord(storeName, key) {
  return withStore(storeName, "readwrite", store => {
    store.delete(key);
    return true;
  });
}

export async function clearStore(storeName) {
  return withStore(storeName, "readwrite", store => {
    store.clear();
    return true;
  });
}

export async function bulkPut(storeName, records) {
  return withStore(storeName, "readwrite", store => {
    for (const record of records) store.put(record);
    return records.length;
  });
}

export { STORES };
