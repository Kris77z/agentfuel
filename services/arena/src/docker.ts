import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { chmod, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

export const DEFAULT_IMAGE = "python:3.12-alpine@sha256:4c47124a8391cb7a9f571164147d154777cf012a4ece5f86097130d7a4478111";
export interface DockerOptions { image?: string; dockerBin?: string; timeoutMs?: number; maxOutputBytes?: number }
export interface Execution { stdout: string; stderr?: string; exitCode: number | null; failure?: "timeout" | "output-limit" | "cancelled" | "runtime" }

// Arguments are fixed by trusted host code; submissions cannot add mounts/flags.
export function containerArguments(name: string, directory: string, image = DEFAULT_IMAGE): string[] {
  return ["create", "--name", name, "--rm", "--interactive", "--network", "none", "--read-only",
    "--user", "65532:65532", "--cap-drop", "ALL", "--security-opt", "no-new-privileges",
    "--pids-limit", "32", "--cpus", "0.5", "--memory", "64m", "--memory-swap", "64m",
    "--ulimit", "nofile=64:64", "--ulimit", "fsize=1048576:1048576", "--ipc", "none",
    "--log-driver", "none", "--no-healthcheck", "--workdir", "/work",
    "--tmpfs", "/work:rw,noexec,nosuid,nodev,size=16m,uid=65532,gid=65532,mode=700",
    "--mount", `type=bind,src=${directory},dst=/submission,readonly`,
    "--entrypoint", "/usr/bin/env", image, "-i", "/usr/local/bin/python3", "-I", "-B", "/submission/main.py"];
}

async function command(binary: string, args: string[], input: string, timeoutMs: number, maxBytes: number, signal?: AbortSignal): Promise<Execution> {
  if (signal?.aborted) return { stdout: "", exitCode: null, failure: "cancelled" };
  return new Promise((resolve, reject) => {
    const child = spawn(binary, args, { stdio: ["pipe", "pipe", "pipe"] });
    const parts: Buffer[] = [];
    const errors: Buffer[] = [];
    let bytes = 0;
    let failure: Execution["failure"];
    const stop = (reason: Execution["failure"]) => { failure ??= reason; child.kill("SIGKILL"); };
    const timer = setTimeout(() => stop("timeout"), timeoutMs);
    const abort = () => stop("cancelled");
    signal?.addEventListener("abort", abort, { once: true });
    child.stdout.on("data", (chunk: Buffer) => { bytes += chunk.length; if (bytes > maxBytes) stop("output-limit"); else parts.push(chunk); });
    // Bound both output channels; stderr is diagnostics, never an answer.
    child.stderr.on("data", (chunk: Buffer) => { bytes += chunk.length; if (bytes > maxBytes) stop("output-limit"); else errors.push(chunk); });
    child.stdin.on("error", () => { /* Runtime can close stdin early. */ });
    child.on("error", error => { clearTimeout(timer); signal?.removeEventListener("abort", abort); reject(error); });
    child.on("close", exitCode => {
      clearTimeout(timer); signal?.removeEventListener("abort", abort);
      let stdout = "";
      try { stdout = new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(parts)); } catch { failure ??= "runtime"; }
      resolve({ stdout, stderr: Buffer.concat(errors).toString("utf8"), exitCode, failure: failure ?? (exitCode === 0 ? undefined : "runtime") });
    });
    child.stdin.end(input);
  });
}

export class DockerExecutor {
  private readonly image: string;
  private readonly binary: string;
  private readonly timeout: number;
  private readonly maxBytes: number;
  constructor(options: DockerOptions = {}) {
    this.image = options.image ?? DEFAULT_IMAGE;
    this.binary = options.dockerBin ?? "docker";
    this.timeout = options.timeoutMs ?? 3000;
    this.maxBytes = options.maxOutputBytes ?? 16384;
    if (this.timeout < 50 || this.timeout > 30000 || this.maxBytes < 64 || this.maxBytes > 65536) throw new Error("INVALID_EXECUTION_LIMITS");
  }
  async ready(): Promise<void> {
    const daemon = await command(this.binary, ["info", "--format", "{{.ServerVersion}}"], "", 5000, 1024);
    if (daemon.failure) throw new Error("DOCKER_UNAVAILABLE: start a local Docker daemon or choose explicit manual acceptance; no code was executed");
    const image = await command(this.binary, ["image", "inspect", this.image], "", 5000, 65536);
    if (image.failure) throw new Error(`DOCKER_IMAGE_MISSING: pull ${this.image} explicitly before submissions`);
  }
  async execute(code: string, input: string, signal?: AbortSignal): Promise<Execution> {
    if (Buffer.byteLength(code, "utf8") > 65536) throw new Error("SUBMISSION_TOO_LARGE");
    const directory = await mkdtemp(join(tmpdir(), "agentfuel-arena-"));
    const name = `agentfuel-arena-${randomUUID()}`;
    let created = false;
    try {
      // The bind mount contains exactly one submission file; no tests/config/key.
      await chmod(directory, 0o755);
      await writeFile(join(directory, "main.py"), code, { mode: 0o444, flag: "wx" });
      created = true; // A timed-out create can still have reached the daemon.
      const setup = await command(this.binary, containerArguments(name, directory, this.image), "", 10000, 4096, signal);
      if (setup.failure === "cancelled") return { stdout: "", exitCode: null, failure: "cancelled" };
      if (setup.failure) throw new Error("DOCKER_CREATE_FAILED");
      return await command(this.binary, ["start", "--attach", "--interactive", name], input, this.timeout, this.maxBytes, signal);
    } finally {
      try {
        if (created) {
          const cleanup = await command(this.binary, ["rm", "--force", name], "", 5000, 4096);
          // --rm can remove a finished container first. Verify absence either way.
          if (cleanup.failure) {
            const inspect = await command(this.binary, ["inspect", name], "", 5000, 65536);
            if (!inspect.failure || !/No such (object|container)/i.test(inspect.stderr ?? "")) throw new Error(`CONTAINER_CLEANUP_FAILED:${name}`);
          }
        }
      } finally { await rm(directory, { recursive: true, force: true }); }
    }
  }
}
