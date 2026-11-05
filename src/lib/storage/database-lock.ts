/** Keeps an IndexedDB transaction alive while owning a filesystem operation. A terminated tab releases it automatically. */
export function requestDatabaseLock<T>(name: string, task: () => Promise<T>): Promise<T> {
  if (typeof indexedDB === "undefined") return task();
  return new Promise((resolve, reject) => {
    const opening = indexedDB.open(`onyx-lock:${name}`, 1);
    let abandoned = false;
    opening.onupgradeneeded = () => opening.result.createObjectStore("lock");
    opening.onerror = () => reject(opening.error);
    opening.onblocked = () => {
      abandoned = true;
      reject(new Error("Close older Onyx tabs to coordinate storage"));
    };
    opening.onsuccess = () => {
      const database = opening.result;
      if (abandoned) {
        database.close();
        return;
      }
      database.onversionchange = () => database.close();
      const transaction = database.transaction("lock", "readwrite");
      const store = transaction.objectStore("lock");
      let state: "waiting" | "running" | "settled" = "waiting";
      let value: T;
      let failure: unknown;
      transaction.oncomplete = () => {
        database.close();
        resolve(value);
      };
      transaction.onabort = transaction.onerror = () => {
        database.close();
        reject(failure ?? transaction.error ?? new Error("Storage coordination failed"));
      };
      function keepAlive(): void {
        const request = store.get(0);
        request.onsuccess = () => {
          if (state === "waiting") {
            state = "running";
            void Promise.resolve()
              .then(task)
              .then(
                (result) => {
                  value = result;
                  state = "settled";
                },
                (error) => {
                  failure = error;
                  state = "settled";
                  transaction.abort();
                },
              );
          }
          if (state !== "settled") keepAlive();
        };
      }
      keepAlive();
    };
  });
}
