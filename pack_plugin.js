const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const repoDir = __dirname;
const pluginDir = path.join(repoDir, 'src', 'catalogue');
const distDir = path.join(repoDir, 'dist');
const tempZip = path.join(distDir, 'dev.justin.catalogue.zip');
const outSky = path.join(distDir, 'dev.justin.catalogue.sky');

if (fs.existsSync(tempZip)) fs.unlinkSync(tempZip);
if (fs.existsSync(outSky)) fs.unlinkSync(outSky);

const psCmd = `powershell -NoProfile -Command "Compress-Archive -Path '${pluginDir}/plugin.js', '${pluginDir}/plugin.json' -DestinationPath '${tempZip}'"`;
console.log('Running:', psCmd);
execSync(psCmd, { stdio: 'inherit' });

fs.renameSync(tempZip, outSky);
console.log('Successfully generated:', outSky);
const stats = fs.statSync(outSky);
console.log('Size:', stats.size, 'bytes');
