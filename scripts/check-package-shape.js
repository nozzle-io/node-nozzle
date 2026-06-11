'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const required = [
  'package.json',
  'README.md',
  'LICENSE',
  'Makefile',
  'src/native/nozzle_node.cpp',
  'src/js/index.js',
  'types/index.d.ts',
  'test/load.test.js',
  'test/discovery.test.js',
  '.github/workflows/ci.yml',
  'deps/nozzle/include/nozzle/nozzle_c.h',
];

for (const rel of required) {
  assert.ok(fs.existsSync(path.join(root, rel)), `missing ${rel}`);
}

const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
assert.equal(pkg.name, 'node-nozzle');
assert.equal(pkg.type, 'commonjs');
assert.equal(pkg.main, 'src/js/index.js');
assert.equal(pkg.types, 'types/index.d.ts');
assert.ok(pkg.scripts.build);
assert.ok(pkg.scripts.test);
assert.ok(pkg.scripts['check:package']);
assert.ok(!pkg.scripts.publish, 'package must not define npm publish script');

const readme = fs.readFileSync(path.join(root, 'README.md'), 'utf8');
for (const phrase of [
  'No npm publication has been performed',
  'No Electron/WebGL/WebGPU texture sharing is claimed',
  'CPU frame access is not exposed in this initial package',
  'Windows build/test is not claimed yet',
]) {
  assert.ok(readme.includes(phrase), `README missing phrase: ${phrase}`);
}

const npmCache = path.join(root, '.build', 'npm-cache');
fs.mkdirSync(npmCache, { recursive: true });
const pack = spawnSync('npm', ['pack', '--dry-run', '--json'], {
  cwd: root,
  encoding: 'utf8',
  env: { ...process.env, npm_config_cache: npmCache },
});
assert.equal(pack.status, 0, pack.stderr || pack.stdout);
const files = JSON.parse(pack.stdout)[0].files.map((entry) => entry.path).sort();
for (const rel of ['README.md', 'LICENSE', 'src/js/index.js', 'types/index.d.ts', 'build/Release/nozzle_node.node']) {
  assert.ok(files.includes(rel), `npm pack dry-run missing ${rel}`);
}
assert.ok(!files.some((file) => file.includes('deps/nozzle')), 'npm package must not include full nozzle source tree');
console.log(`package shape ok: ${files.length} files`);
