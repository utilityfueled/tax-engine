import { spawn } from "node:child_process";

const forwardedArgs = process.argv[2] === "--"
  ? process.argv.slice(3)
  : process.argv.slice(2);

const pnpmCommand = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
const child = spawn(
  pnpmCommand,
  ["--filter", "@tax-engine/web", "exec", "next", "dev", ...forwardedArgs],
  {
    stdio: "inherit"
  }
);

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }

  process.exit(code ?? 0);
});

child.on("error", (error) => {
  console.error(error);
  process.exit(1);
});
