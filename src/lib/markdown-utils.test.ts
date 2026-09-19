import { describe, expect, it } from "vite-plus/test";
import { taskLineIndex, toggleTaskAtLine } from "./markdown-utils.js";

describe("task toggling", () => {
  it("toggles the checkbox on a task line", () => {
    expect(toggleTaskAtLine("- [ ] one\n- [x] two", 0)).toBe("- [x] one\n- [x] two");
    expect(toggleTaskAtLine("- [ ] one\n  1. [X] two", 1)).toBe("- [ ] one\n  1. [ ] two");
    expect(toggleTaskAtLine("> * [ ] quoted", 0)).toBe("> * [x] quoted");
  });

  it("leaves non-task lines untouched", () => {
    expect(toggleTaskAtLine("plain [ ] text", 0)).toBe("plain [ ] text");
    expect(toggleTaskAtLine("- [ ] one", 4)).toBe("- [ ] one");
  });

  it("finds the source line of the nth rendered task, skipping code fences", () => {
    const source = "- [ ] a\n```\n- [ ] code\n```\n\n- [x] b";
    expect(taskLineIndex(source, 0)).toBe(0);
    expect(taskLineIndex(source, 1)).toBe(5);
    expect(taskLineIndex(source, 2)).toBeUndefined();
  });
});
