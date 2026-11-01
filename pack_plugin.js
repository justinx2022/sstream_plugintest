const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const repoDir = __dirname;
const distDir = path.join(repoDir, 'dist');
const plugins = ['catalogue', 'yoturkish'];

for (const plugin of plugins) {
  const packageName = `dev.justin.${plugin}`;
  const pluginDir = path.join(repoDir, 'src', plugin);
  const tempZip = path.join(distDir, `${packageName}.zip`);
  const outSky = path.join(distDir, `${packageName}.sky`);
  const quote = (value) => `'${value.replace(/'/g, "''")}'`;

  if (fs.existsSync(tempZip)) fs.unlinkSync(tempZip);
  if (fs.existsSync(outSky)) fs.unlinkSync(outSky);

  const psCmd = `Compress-Archive -LiteralPath ${quote(path.join(pluginDir, 'plugin.js'))}, ${quote(path.join(pluginDir, 'plugin.json'))} -DestinationPath ${quote(tempZip)}`;
  console.log(`Packaging ${packageName}`);
  execSync(`powershell -NoProfile -Command "${psCmd}"`, { stdio: 'inherit' });
  fs.renameSync(tempZip, outSky);
  console.log('Generated:', outSky, '(', fs.statSync(outSky).size, 'bytes)');
}
