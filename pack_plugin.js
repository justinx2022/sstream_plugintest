const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const repoDir = __dirname;
const distDir = path.join(repoDir, 'dist');
const plugins = [
  { dir: 'catalogue', bundle: 'dev.justin.catalogue' },
  { dir: 'yoturkish', bundle: 'dev.justin.yoturkish' },
  { dir: 'wlext', bundle: 'dev.justin.wlext_v3' },
];

for (const { dir, bundle } of plugins) {
  const pluginDir = path.join(repoDir, 'src', dir);
  const tempZip = path.join(distDir, `${bundle}.zip`);
  const outSky = path.join(distDir, `${bundle}.sky`);
  const quote = (value) => `'${value.replace(/'/g, "''")}'`;

  if (fs.existsSync(tempZip)) fs.unlinkSync(tempZip);
  if (fs.existsSync(outSky)) fs.unlinkSync(outSky);

  const psCmd = `Compress-Archive -LiteralPath ${quote(path.join(pluginDir, 'plugin.js'))}, ${quote(path.join(pluginDir, 'plugin.json'))} -DestinationPath ${quote(tempZip)}`;
  console.log(`Packaging ${bundle}`);
  execSync(`powershell -NoProfile -Command "${psCmd}"`, { stdio: 'inherit' });
  fs.renameSync(tempZip, outSky);
  console.log('Generated:', outSky, '(', fs.statSync(outSky).size, 'bytes)');
}
