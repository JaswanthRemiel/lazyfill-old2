// Writes THIRD_PARTY_NOTICES.txt from the packages the extension and the web page actually ship.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';

const SHIPPED = ['react', 'react-dom', 'scheduler', 'react-router', 'react-router-dom', '@remix-run/router', 'lucide-react', 'clsx', 'tailwind-merge', 'pdfjs-dist', 'firebase', 'tailwindcss'];

const out = ['THIRD-PARTY SOFTWARE NOTICES', '', 'lazyfill includes the open-source packages below. Each is used under its own license.', ''];
for (const name of SHIPPED) {
  const dir = `node_modules/${name}`;
  if (!existsSync(`${dir}/package.json`)) continue;
  const pkg = JSON.parse(readFileSync(`${dir}/package.json`, 'utf8'));
  const file = ['LICENSE', 'LICENSE.md', 'LICENSE.txt', 'license'].map((f) => `${dir}/${f}`).find(existsSync);
  const text = file ? readFileSync(file, 'utf8').trim() : '';
  const notice = text.split('\n').find((l) => /copyright/i.test(l))?.trim() ?? '';
  const repo = typeof pkg.repository === 'string' ? pkg.repository : pkg.repository?.url ?? pkg.homepage ?? '';
  out.push('-'.repeat(72), `${pkg.name} ${pkg.version}`, `License: ${typeof pkg.license === 'string' ? pkg.license : pkg.license?.type ?? 'see package'}`, repo ? `Source: ${repo.replace(/^git\+/, '').replace(/\.git$/, '')}` : '', notice, '');
  if (text && text.length < 6000) out.push(text, '');
}
writeFileSync('public/THIRD_PARTY_NOTICES.txt', out.join('\n'));
console.log('wrote public/THIRD_PARTY_NOTICES.txt');
