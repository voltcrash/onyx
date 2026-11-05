type Resource<T> =
  | { status: "idle" }
  | { status: "loading"; promise: Promise<T> }
  | { status: "ready"; promise: Promise<T> }
  | { status: "failed"; error: unknown };

export function createLazyResource<T>(loader: () => Promise<T>) {
  let state: Resource<T> = { status: "idle" };
  return {
    get status() {
      return state.status;
    },
    load(): Promise<T> {
      if (state.status === "loading" || state.status === "ready") return state.promise;
      const promise = Promise.resolve()
        .then(loader)
        .then(
          (value) => {
            state = { status: "ready", promise };
            return value;
          },
          (error) => {
            state = { status: "failed", error };
            throw error;
          },
        );
      state = { status: "loading", promise };
      return promise;
    },
  };
}
