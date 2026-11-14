import { describe, expect, it, vi } from "vite-plus/test";
import { createNoteCreationController } from "./note-creation-controller.svelte.ts";
import { dailyNoteDate } from "#lib/note-creation.ts";
import type { Vault } from "#lib/storage/vault.ts";

describe("note creation controller", () => {
  it("opens an existing daily note without changing its contents", async () => {
    const saveNote = vi.fn(),
      open = vi.fn();
    const vault = {
      listNotes: async () => [
        { id: "daily", title: "Today", sourcePath: `Daily/${dailyNoteDate()}.md` },
      ],
      saveNote,
    } as unknown as Vault;
    const controller = createNoteCreationController({
      vault: () => vault,
      vaultId: () => "default",
      settle: async () => true,
      prepare: async () => {},
      open,
      refresh: async () => {},
      showError: vi.fn(),
    });
    await controller.openDailyNote();
    expect(open).toHaveBeenCalledWith("daily");
    expect(saveNote).not.toHaveBeenCalled();
  });
  it("expands a template and rebases relative links for the new note", async () => {
    const saveNote = vi.fn().mockResolvedValue({ id: "new" }),
      open = vi.fn();
    const vault = {
      listNotes: async () => [
        { id: "template", title: "Meeting", sourcePath: "Templates/Meeting.md" },
      ],
      getNote: async () => ({ markdown: "# {{title}}\n[agenda](Agenda.md) {{date}}" }),
      saveNote,
    } as unknown as Vault;
    const controller = createNoteCreationController({
      vault: () => vault,
      vaultId: () => "default",
      settle: async () => true,
      prepare: async () => {},
      open,
      refresh: async () => {},
      showError: vi.fn(),
    });
    await controller.showTemplates();
    controller.path = "Projects/Review.md";
    await controller.createFromTemplate();
    expect(saveNote).toHaveBeenCalledWith({
      sourcePath: "Projects/Review.md",
      title: "Review",
      markdown: `# Review\n[agenda](../Templates/Agenda.md) ${dailyNoteDate()}`,
    });
    expect(open).toHaveBeenCalledWith("new");
    expect(controller.open).toBe(false);
  });
});
