import { isDeepStrictEqual } from "node:util";
import { DockerExecutor } from "@agentfuel/arena/docker";

// Deliberately independent of Arena's private test catalog. This is the only sample the model can run.
export const PUBLIC_SAMPLE = Object.freeze({ problemId: "sum-integers", input: "[4,8,-3]\n", expected: 9,
  prompt: "Write Python 3.12 code that reads a JSON array of integers from stdin and prints its sum as JSON. Public sample: [4,8,-3] -> 9. Call test_public_sample with your complete code. Fix failures. Do not claim task success: only the independent Arena can accept it." });
export interface SampleResult { passed: boolean; stdout: string; failure?: string }
export async function testPublicSample(runner: DockerExecutor, code: string, signal?: AbortSignal): Promise<SampleResult> {
  const output = await runner.execute(code, PUBLIC_SAMPLE.input, signal);
  let passed = false; let failure: string | undefined = output.failure;
  if (!failure) { try { passed = isDeepStrictEqual(JSON.parse(output.stdout.trim()), PUBLIC_SAMPLE.expected); } catch { failure = "invalid-json"; } }
  if (!passed) failure ??= "wrong-answer";
  return { passed, stdout: output.stdout, ...(failure ? { failure } : {}) };
}
