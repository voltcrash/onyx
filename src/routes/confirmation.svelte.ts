export interface ConfirmationOptions {
  eyebrow: string;
  title: string;
  message: string;
  confirmLabel: string;
  danger?: boolean;
}

export interface ConfirmationRequest extends ConfirmationOptions {
  id: number;
}

/** Asks the user to confirm an action in an in-app dialog. */
export function createConfirmation(prepare: () => Promise<void>) {
  let request = $state<ConfirmationRequest>();
  let settle: ((confirmed: boolean) => void) | undefined;
  let nextId = 0;

  function answer(confirmed: boolean): void {
    const done = settle;
    settle = undefined;
    request = undefined;
    done?.(confirmed);
  }

  return {
    get request() {
      return request;
    },
    /** Resolves true when confirmed, and false when cancelled or replaced by another request. */
    ask: async (options: ConfirmationOptions): Promise<boolean> => {
      answer(false);
      await prepare();
      return new Promise<boolean>((resolve) => {
        settle = resolve;
        request = { ...options, id: ++nextId };
      });
    },
    confirm: () => answer(true),
    cancel: () => answer(false),
  };
}
