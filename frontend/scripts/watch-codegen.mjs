import { spawn } from "node:child_process";
import { watchFile } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const schemaPath = resolve(
  root,
  process.env.GRAPHQL_SCHEMA_PATH ?? "../server/polls/schema.graphql",
);

const watched = new Set();
let running = false;
let queued = false;
let debounce;

function runCodegen() {
  if (running) {
    queued = true;
    return;
  }

  running = true;
  const child = spawn(
    process.platform === "win32" ? "npm.cmd" : "npm",
    ["run", "codegen"],
    {
      cwd: root,
      stdio: "inherit",
      shell: process.platform === "win32",
    },
  );

  child.on("exit", () => {
    running = false;
    if (queued) {
      queued = false;
      runCodegen();
    }
  });
}

function schedule() {
  clearTimeout(debounce);
  debounce = setTimeout(runCodegen, 300);
}

function watch(path) {
  if (watched.has(path)) return;
  watched.add(path);
  watchFile(path, { interval: 1000, persistent: true }, schedule);
}

watch(schemaPath);
setInterval(() => watch(schemaPath), 1000);

process.on("SIGINT", () => process.exit(0));
process.on("SIGTERM", () => process.exit(0));
