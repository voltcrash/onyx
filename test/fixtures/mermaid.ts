export const mermaidExamples = [
  [
    "flowchart",
    "flowchart LR\n  A[Draft] --> B{Reviewed?}\n  B -->|Yes| C[Publish]\n  B -->|No| A",
  ],
  [
    "sequence",
    "sequenceDiagram\n  participant Writer\n  participant Onyx\n  Writer->>Onyx: Save note\n  Onyx-->>Writer: Saved",
  ],
  ["class", "classDiagram\n  class Note {\n    +String title\n    +save()\n  }\n  Folder --> Note"],
  ["state", "stateDiagram-v2\n  [*] --> Draft\n  Draft --> Published\n  Published --> [*]"],
  ["er", "erDiagram\n  FOLDER ||--o{ NOTE : contains\n  NOTE {\n    string title\n  }"],
  [
    "gantt",
    "gantt\n  dateFormat YYYY-MM-DD\n  section Release\n  Write :a, 2026-01-01, 2d\n  Review :after a, 1d",
  ],
  [
    "gitGraph",
    "gitGraph\n  commit\n  branch feature\n  checkout feature\n  commit\n  checkout main\n  merge feature",
  ],
  ["pie", 'pie title Notes\n  "Drafts" : 8\n  "Published" : 5'],
  ["mindmap", "mindmap\n  root((Onyx))\n    Notes\n      Markdown\n    Diagrams"],
  [
    "kanban",
    "kanban\n  draft[Draft]\n    note[Write a note]\n  done[Published]\n    guide[Diagram guide]",
  ],
  ["timeline", "timeline\n  title Release\n  January : Write\n  February : Publish"],
  [
    "journey",
    "journey\n  title Write a note\n  section Work\n    Draft: 4: Writer\n    Review: 5: Editor",
  ],
  [
    "quadrantChart",
    "quadrantChart\n  x-axis Low effort --> High effort\n  y-axis Low impact --> High impact\n  Diagrams: [0.3, 0.8]",
  ],
  [
    "xychart",
    'xychart-beta\n  x-axis [Jan, Feb, Mar]\n  y-axis "Notes" 0 --> 20\n  bar [5, 10, 15]\n  line [4, 8, 12]',
  ],
  [
    "requirement",
    "requirementDiagram\n  requirement diagrams {\n    id: 1\n    text: Render notes\n    risk: low\n    verifymethod: test\n  }",
  ],
  ["sankey", "sankey-beta\n  Draft,Review,10\n  Review,Published,8\n  Review,Revision,2"],
  [
    "architecture",
    "architecture-beta\n  service app(server)[Onyx]\n  service db(database)[Notes]\n  app:R --> L:db",
  ],
  [
    "c4",
    'C4Context\n  Person(writer, "Writer")\n  System(onyx, "Onyx", "Notes")\n  Rel(writer, onyx, "Writes")',
  ],
  ["block", 'block-beta\n  columns 2\n  editor["Editor"] preview["Preview"]\n  editor --> preview'],
  ["agentflow", 'agentflow-beta LR\n  writer["Writer"] --> reviewer["Reviewer"]'],
  ["railroad", 'railroad-ebnf-beta\n  note = "title", "body" ;'],
  ["treeView", 'treeView-beta\n  "notes"\n    "welcome.md"\n    "diagrams.md"'],
  ["cynefin", "cynefin-beta\n  title Planning\n  complex\n  complicated\n  clear\n  chaotic"],
  [
    "wardley",
    "wardley-beta\n  title Notes\n  anchor Writer [0.95, 0.1]\n  component Editor [0.7, 0.4]\n  Writer -> Editor",
  ],
  [
    "eventmodeling",
    "eventmodeling\n  tf 01 ui NoteEditor\n  tf 02 cmd SaveNote\n  tf 03 evt NoteSaved",
  ],
  ["usecase", "usecase-beta\n  actor Writer\n  Save\n  Writer --> Save"],
  ["venn", 'venn-beta\n  set A["Notes"]\n  set B["Diagrams"]\n  union A,B["Visual notes"]'],
  ["ishikawa", "ishikawa-beta\n  Missing notes\n  Storage\n    No space\n  Network\n    Offline"],
  ["packet", 'packet-beta\n  0-7: "Header"\n  8-31: "Content"'],
  [
    "radar",
    'radar-beta\n  axis w["Writing"], r["Reading"], d["Diagrams"]\n  curve a["Onyx"]{8, 9, 10}\n  max 10',
  ],
  ["treemap", 'treemap-beta\n  "Notes"\n    "Drafts": 8\n    "Published": 5'],
  [
    "swimlane",
    "swimlane-beta\n  subgraph Writer\n    draft[Draft]\n  end\n  subgraph Editor\n    review[Review]\n  end\n  draft --> review",
  ],
  ["info", "info"],
] as const;

export function mermaidFence(source: string): string {
  return `\`\`\`mermaid\n${source}\n\`\`\``;
}
