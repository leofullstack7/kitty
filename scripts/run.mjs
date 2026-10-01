import { spawn, execSync } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";

const dev = process.argv.includes("--dev");
const children = [];
const kittyHome = path.join(os.homedir(), "AppData", "Local", "kitty");

function junction(from, to) {
  fs.mkdirSync(path.dirname(to), { recursive: true });
  if (fs.existsSync(from)) {
    try {
      if (fs.realpathSync(from).toLowerCase() === path.resolve(to).toLowerCase()) return;
    } catch {
      /* replace */
    }
    fs.rmSync(from, { recursive: true, force: true });
  }
  execSync(`cmd /c mklink /J "${from}" "${to}"`);
}

function ensureNextCacheOffOneDrive() {
  const nextTarget = path.join(kittyHome, ".next");
  fs.mkdirSync(nextTarget, { recursive: true });
  junction(path.join(process.cwd(), ".next"), nextTarget);
  const nm = path.join(process.cwd(), "node_modules");
  if (fs.existsSync(nm)) junction(path.join(kittyHome, "node_modules"), nm);
}

ensureNextCacheOffOneDrive();

function run(bin, args) {
  const child = spawn(bin, args, {
    stdio: "inherit",
    shell: true,
    env: { ...process.env, NODE_PATH: path.join(process.cwd(), "node_modules") },
    windowsHide: true,
  });
  children.push(child);
  child.on("exit", (code) => {
    if (code && code !== 0) {
      for (const c of children) c.kill();
      process.exit(code);
    }
  });
}

if (dev) {
  run("npx", ["next", "dev", "--turbopack", "-p", "3000"]);
} else {
  run("npx", ["next", "start", "-p", "3000"]);
}
run("npx", ["tsx", "signaling.ts"]);

function shutdown() {
  for (const c of children) c.kill();
  process.exit(0);
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
