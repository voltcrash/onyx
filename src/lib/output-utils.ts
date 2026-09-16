/** Turns a note title into a file name that every platform accepts. */
export function outputFileName(title: string, extension: string): string {
  const stem =
    title
      .normalize("NFKD")
      .replace(/[^\w\s-]+/g, "")
      .trim()
      .replace(/\s+/g, "-")
      .toLowerCase()
      .slice(0, 60) || "note";
  return `${stem}.${extension}`;
}
