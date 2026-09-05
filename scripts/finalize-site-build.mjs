import { copyFile, mkdir } from "node:fs/promises";

await mkdir("dist/server", { recursive: true });
await copyFile(".wrangler/site-bundle/index.js", "dist/server/index.js");
