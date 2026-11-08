// Builds the extension and zips it:  npm run package  ->  release/lazyfill-v<version>.zip
// The zip can be loaded by unzipping it and using "Load unpacked", or attached to a GitHub release.
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, rmSync, statSync } from 'node:fs';

const run = (cmd, args, opts = {}) => execFileSync(cmd, args, { stdio: 'inherit', ...opts });
const version = JSON.parse(readFileSync('package.json', 'utf8')).version;
const manifest = JSON.parse(readFileSync('public/manifest.json', 'utf8')).version;
if (version !== manifest) throw new Error(`package.json is ${version} but public/manifest.json is ${manifest}. Keep them equal.`);

run('node', ['scripts/notices.mjs']);
run('npm', ['run', 'build']);

mkdirSync('release', { recursive: true });
const zip = `release/lazyfill-v${version}.zip`;
rmSync(zip, { force: true });
// the manifest has to sit at the root of the zip
run('zip', ['-r', '-X', `../${zip}`, '.', '-x', '*.DS_Store'], { cwd: 'dist' });
console.log(`\n${zip}  ${(statSync(zip).size / 1048576).toFixed(2)} MB`);
