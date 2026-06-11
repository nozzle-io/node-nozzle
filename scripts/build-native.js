'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const https = require('node:https');
const { spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const build_dir = path.join(root, '.build');
const addon_dir = path.join(root, 'build', 'Release');
const addon_path = path.join(addon_dir, process.platform === 'win32' ? 'nozzle_node.node' : 'nozzle_node.node');

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: root,
    stdio: 'inherit',
    shell: false,
    ...options
  });
  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error(`${command} exited with ${result.status}`);
  }
}

function first_existing(paths) {
  for (const candidate of paths) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }
  return null;
}

function download_file(url, destination) {
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  return new Promise((resolve, reject) => {
    const request = https.get(url, (response) => {
      if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
        response.resume();
        download_file(new URL(response.headers.location, url).toString(), destination).then(resolve, reject);
        return;
      }
      if (response.statusCode !== 200) {
        response.resume();
        reject(new Error(`download failed: ${url} returned HTTP ${response.statusCode}`));
        return;
      }
      const file = fs.createWriteStream(destination);
      response.pipe(file);
      file.on('finish', () => {
        file.close(resolve);
      });
      file.on('error', reject);
    });
    request.on('error', reject);
  });
}

function node_windows_arch() {
  if (process.arch === 'x64') {
    return 'x64';
  }
  if (process.arch === 'arm64') {
    return 'arm64';
  }
  throw new Error(`unsupported Windows Node architecture: ${process.arch}`);
}

async function ensure_windows_node_headers() {
  const exe_dir = path.dirname(process.execPath);
  const version = process.versions.node;
  const downloaded_root = path.join(build_dir, 'node-headers', `node-v${version}`);
  const candidates = [
    path.join(exe_dir, 'include', 'node'),
    path.resolve(exe_dir, '..', 'include', 'node'),
    path.join(downloaded_root, 'include', 'node')
  ];

  const existing = first_existing(candidates);
  if (existing) {
    return existing;
  }

  const archive = path.join(build_dir, 'node-headers', `node-v${version}-headers.tar.gz`);
  const url = `https://nodejs.org/download/release/v${version}/node-v${version}-headers.tar.gz`;
  console.log(`Downloading Node headers from ${url}`);
  await download_file(url, archive);
  run('tar', ['-xzf', archive, '-C', path.dirname(downloaded_root)]);

  const extracted = first_existing(candidates);
  if (!extracted) {
    throw new Error(`Node include directory not found after header download; checked ${candidates.join(', ')}`);
  }
  return extracted;
}

async function ensure_windows_node_lib() {
  const exe_dir = path.dirname(process.execPath);
  const version = process.versions.node;
  const arch = node_windows_arch();
  const downloaded = path.join(build_dir, 'node-headers', `node-v${version}`, `win-${arch}`, 'node.lib');
  const candidates = [
    path.join(exe_dir, 'node.lib'),
    path.resolve(exe_dir, '..', 'node.lib'),
    downloaded
  ];

  const existing = first_existing(candidates);
  if (existing) {
    return existing;
  }

  const url = `https://nodejs.org/download/release/v${version}/win-${arch}/node.lib`;
  console.log(`Downloading node.lib from ${url}`);
  await download_file(url, downloaded);
  return downloaded;
}

function to_obj_name(source) {
  return path.join(build_dir, source.replace(/[\\/:.]/g, '_') + '.obj');
}

async function build_windows() {
  if (!process.env.VCToolsInstallDir && !process.env.VSINSTALLDIR) {
    throw new Error('MSVC environment is not configured; run under Developer Command Prompt or ilammy/msvc-dev-cmd in GitHub Actions');
  }

  fs.mkdirSync(build_dir, { recursive: true });
  fs.mkdirSync(addon_dir, { recursive: true });

  const nozzle = 'deps/nozzle';
  const common_sources = [
    'src/common/ipc.cpp',
    'src/common/registry.cpp',
    'src/common/sender.cpp',
    'src/common/receiver.cpp',
    'src/common/frame.cpp',
    'src/common/texture.cpp',
    'src/common/device.cpp',
    'src/common/discovery.cpp',
    'src/common/metadata.cpp',
    'src/common/pixel_access.cpp',
    'src/common/channel_swizzle.cpp',
    'src/common/format_convert.cpp',
    'src/common/format_convert_sse2.cpp',
    'src/common/format_convert_neon.cpp',
    'src/common/format_resolve.cpp',
    'src/common/backend_capabilities.cpp',
    'src/c_api/nozzle_c.cpp'
  ].map((file) => path.join(nozzle, file));

  const windows_sources = [
    path.join(nozzle, 'src/backends/d3d11/d3d11_backend.cpp'),
    path.join(nozzle, 'src/backends/d3d11/d3d11_texture.cpp'),
    path.join(nozzle, 'src/backends/d3d11/d3d11_sync.cpp'),
    'src/native/nozzle_node.cpp'
  ];

  const sources = common_sources.concat(windows_sources);
  const node_include = await ensure_windows_node_headers();
  const node_lib = await ensure_windows_node_lib();

  const includes = [
    '/I', path.join(root, nozzle, 'include'),
    '/I', path.join(root, nozzle, 'src'),
    '/I', path.join(root, nozzle, 'libs', 'plog', 'include'),
    '/I', node_include
  ];
  const defines = [
    '/DNAPI_VERSION=8',
    '/DNOZZLE_PLATFORM_WINDOWS=1',
    '/DNOZZLE_PLATFORM_MACOS=0',
    '/DNOZZLE_PLATFORM_LINUX=0',
    '/DNOZZLE_HAS_D3D11=1',
    '/DNOZZLE_HAS_METAL=0',
    '/DNOZZLE_HAS_DMA_BUF=0',
    '/DNOZZLE_HAS_OPENGL=0'
  ];
  const compile_flags = [
    '/nologo',
    '/std:c++17',
    '/O2',
    '/MD',
    '/EHsc-',
    '/GR-',
    '/W3',
    ...defines,
    ...includes
  ];

  const objects = [];
  for (const source of sources) {
    const obj = to_obj_name(source);
    objects.push(obj);
    run('cl', [...compile_flags, '/c', path.join(root, source), '/Fo' + obj]);
  }

  run('link', [
    '/nologo',
    '/dll',
    '/out:' + addon_path,
    ...objects,
    node_lib,
    'd3d11.lib',
    'dxgi.lib',
    'dxguid.lib',
    'user32.lib',
    'ole32.lib',
    'advapi32.lib'
  ]);
}

async function main() {
  if (process.argv.includes('--clean')) {
    fs.rmSync(build_dir, { recursive: true, force: true });
    fs.rmSync(path.join(root, 'build'), { recursive: true, force: true });
    return;
  }

  if (process.platform === 'win32') {
    await build_windows();
    return;
  }

  run('make', []);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
