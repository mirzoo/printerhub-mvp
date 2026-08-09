import { spawn } from "node:child_process";

export type CommandResult = { stdout: string; stderr: string; code: number };

export async function command(binary: string, args: readonly string[], timeoutMs = 30_000): Promise<CommandResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(binary, [...args], { shell: false, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => { child.kill("SIGTERM"); reject(new Error(`${binary} timed out`)); }, timeoutMs);
    child.stdout.setEncoding("utf8").on("data", (chunk) => { stdout += chunk; });
    child.stderr.setEncoding("utf8").on("data", (chunk) => { stderr += chunk; });
    child.on("error", (error) => { clearTimeout(timer); reject(error); });
    child.on("close", (code) => { clearTimeout(timer); resolve({ stdout, stderr, code: code ?? -1 }); });
  });
}
