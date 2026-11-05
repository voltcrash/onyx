import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { startSidebarDrag } from "./sidebar-drag.js";

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("sidebar drag lifecycle", () => {
  function setup() {
    vi.useFakeTimers();
    const events = new EventTarget();
    vi.stubGlobal("window", Object.assign(events, { setTimeout, clearTimeout, innerWidth: 1000 }));
    const host = { side: () => "left" as const, setDropSide: vi.fn(), dock: vi.fn() };
    const cancel = startSidebarDrag(
      { button: 0, isPrimary: true, pointerId: 1, clientX: 10, clientY: 10 } as PointerEvent,
      host,
    );
    return { events, host, cancel };
  }

  it("cancels a pending hold when the window loses focus", () => {
    const { events, host } = setup();
    events.dispatchEvent(new Event("blur"));
    vi.advanceTimersByTime(500);
    expect(host.setDropSide).toHaveBeenCalledExactlyOnceWith(undefined);
    expect(host.dock).not.toHaveBeenCalled();
  });

  it("removes an active drag and its listeners on disposal", () => {
    const { events, host, cancel } = setup();
    vi.advanceTimersByTime(300);
    cancel();
    events.dispatchEvent(Object.assign(new Event("pointerup"), { pointerId: 1 }));
    expect(host.setDropSide).toHaveBeenLastCalledWith(undefined);
    expect(host.dock).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });
});
