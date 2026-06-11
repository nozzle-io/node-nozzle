'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
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

function node_include_dir() {
  return path.resolve(path.dirname(process.execPath), '..', 'include', 'node');
}

function node_lib_dir() {
  return path.dirname(process.execPath);
}

function to_obj_name(source) {
  return path.join(build_dir, source.replace(/[\\/:.]/g, '_') + '.obj');
}

function build_windows() {
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
  const includes = [
    '/I', path.join(root, nozzle, 'include'),
    '/I', path.join(root, nozzle, 'src'),
    '/I', path.join(root, nozzle, 'libs', 'plog', 'include'),
    '/I', node_include_dir()
  ];
  const defines = [
    '/DNOMINMAX',
    '/DWIN32_LEAN_AND_MEAN',
    '/DNAPI_VERSION=8',
    '/DNOZZLE_PLATFORM_WINDOWS=1',
    '/DNOZZLE_PLATFORM_MACOS=0',
    '/DNOZZLE_PLATFORM_LINUX=0',
    '/DNOZZLE_HAS_D3D11=1',
    '/DNOZZLE_HAS_METAL=0',
    '/DNOZZLE_HAS_DMA_BUF=0',
    '/DNOZZLE_HAS_OPENGL=0',
    '/DNOZZLE_HAS_EXCEPTIONS=0'
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
    path.join(node_lib_dir(), 'node.lib'),
    'd3d11.lib',
    'dxgi.lib',
    'dxguid.lib',
    'user32.lib',
    'ole32.lib',
    'advapi32.lib'
  ]);
}

function main() {
  if (process.argv.includes('--clean')) {
    fs.rmSync(build_dir, { recursive: true, force: true });
    fs.rmSync(path.join(root, 'build'), { recursive: true, force: true });
    return;
  }

  if (process.platform === 'win32') {
    build_windows();
    return;
  }

  run('make', []);
}

main();
