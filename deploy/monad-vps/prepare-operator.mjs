import { lstat, mkdir, readFile, realpath, writeFile } from 'node:fs/promises';
import { isAbsolute, join, resolve } from 'node:path';

const project = '/Users/jungle/Desktop/dev/agentfuel';
const [mode, bootstrapFile, ...rest] = process.argv.slice(2);
if (!['--check', '--apply'].includes(mode) || !bootstrapFile || rest.length || !isAbsolute(bootstrapFile) || resolve(bootstrapFile) !== bootstrapFile) {
  throw new Error('Usage: node deploy/monad-vps/prepare-operator.mjs --check|--apply ABSOLUTE_BOOTSTRAP_FILE');
}
async function privateFile(path) {
  const s = await lstat(path);
  if (!s.isFile() || (s.mode & 0o777) !== 0o600 || s.uid !== process.getuid()) throw new Error('PRIVATE_OPERATOR_FILE_REQUIRED');
}
await privateFile(bootstrapFile);
const bootstrap = JSON.parse(await readFile(bootstrapFile, 'utf8'));
if (bootstrap.chainId !== '10143' || !isAbsolute(bootstrap.vendorKeyFile) || resolve(bootstrap.vendorKeyFile) !== bootstrap.vendorKeyFile) {
  throw new Error('MONAD_BOOTSTRAP_REQUIRED');
}
// Inspect only key-file metadata. No credential bytes, requests or signing.
await privateFile(bootstrap.vendorKeyFile);
const directory = join(project, '.data/monad-vps-operator');
const file = join(directory, 'model-upstream.json');
const value = { upstream: { name: 'kimi', baseUrl: 'https://api.moonshot.cn/v1', model: 'kimi-k2.6', apiKeyFile: bootstrap.vendorKeyFile } };
if (mode === '--apply') {
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const s = await lstat(directory);
  if (!s.isDirectory() || (s.mode & 0o777) !== 0o700 || s.uid !== process.getuid() || await realpath(directory) !== directory) throw new Error('PRIVATE_OPERATOR_DIRECTORY_REQUIRED');
  try { await writeFile(file, JSON.stringify(value) + '\n', { flag: 'wx', mode: 0o600 }); }
  catch (error) {
    if (error.code !== 'EEXIST') throw error;
    await privateFile(file);
    if (JSON.stringify(JSON.parse(await readFile(file, 'utf8'))) !== JSON.stringify(value)) throw new Error('ORIGINAL_OPERATOR_CONFIG_REQUIRED');
  }
}
console.log(JSON.stringify({ checked: true, applied: mode === '--apply', configFile: file, chainId: '10143', credentialBytesRead: false, chainWrites: 0, modelRequests: 0 }));
