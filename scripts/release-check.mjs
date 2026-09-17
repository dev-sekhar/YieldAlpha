import { spawnSync } from "node:child_process";

const commands = [["run", "lint"], ["run", "security:check"], ["run", "accessibility:check"], ["run", "performance:check"], ["run", "typecheck"], ["run", "test"], ["run", "test:python"], ["run", "test:unit"], ["run", "test:integration"], ["run", "test:e2e"], ["run", "pwa:check"], ["run", "build"]];
for (const command of commands) {
  console.log(`\n> npm ${command.join(" ")}`);
  const result = spawnSync("npm", command, { stdio: "inherit", shell: process.platform === "win32" });
  if (result.status !== 0) process.exit(result.status ?? 1);
}
console.log("YieldAlpha release checks passed");
