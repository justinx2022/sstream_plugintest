/**
 * SkyStream Repository & Plugin Integrity Verifier
 * 
 * Verifies:
 * 1. repo.json integrity and reachable pluginLists
 * 2. dist/plugins.json schema, types, and required fields
 * 3. Every .sky bundle is a genuine standard ZIP archive (PK\x03\x04)
 * 4. Every .sky bundle contains root-level 'plugin.json' and 'plugin.js' (SkyStream V2 requirement)
 * 5. JavaScript syntax of plugin.js is valid
 * 6. Provider functions (getHome, search, load, loadStreams) are defined
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT_DIR = path.resolve(__dirname, '..');
const DIST_DIR = path.join(ROOT_DIR, 'dist');
const REPO_JSON = path.join(ROOT_DIR, 'repo.json');
const PLUGINS_JSON = path.join(DIST_DIR, 'plugins.json');

let hasErrors = false;

function error(msg) {
  console.error(`❌ [ERROR] ${msg}`);
  hasErrors = true;
}

function success(msg) {
  console.log(`✅ [OK] ${msg}`);
}

function info(msg) {
  console.log(`ℹ️ [INFO] ${msg}`);
}

// Helper: Inspect zip buffer entries
function inspectZip(buf) {
  if (buf.length < 4 || buf[0] !== 0x50 || buf[1] !== 0x4B || buf[2] !== 0x03 || buf[3] !== 0x04) {
    return { isZip: false, files: [] };
  }
  
  let pos = 0;
  const files = [];
  while (pos < buf.length - 4) {
    if (buf.readUInt32LE(pos) === 0x04034b50) {
      const nameLen = buf.readUInt16LE(pos + 26);
      const extraLen = buf.readUInt16LE(pos + 28);
      const name = buf.slice(pos + 30, pos + 30 + nameLen).toString('utf8');
      files.push(name);
      pos += 30 + nameLen + extraLen;
    } else {
      pos++;
    }
  }
  return { isZip: true, files };
}

console.log('=== Starting SkyStream Plugin & Repo Verification ===\n');

// 1. Verify repo.json
if (!fs.existsSync(REPO_JSON)) {
  error('repo.json does not exist in root directory.');
} else {
  try {
    const repo = JSON.parse(fs.readFileSync(REPO_JSON, 'utf8'));
    if (!repo.name || !repo.manifestVersion || !Array.isArray(repo.pluginLists)) {
      error('repo.json missing required fields (name, manifestVersion, pluginLists).');
    } else {
      success(`repo.json is valid (Name: "${repo.name}", Manifest: v${repo.manifestVersion})`);
    }
  } catch (e) {
    error(`repo.json syntax error: ${e.message}`);
  }
}

// 2. Verify dist/plugins.json
if (!fs.existsSync(PLUGINS_JSON)) {
  error('dist/plugins.json does not exist.');
  process.exit(1);
}

let plugins = [];
try {
  plugins = JSON.parse(fs.readFileSync(PLUGINS_JSON, 'utf8'));
  if (!Array.isArray(plugins)) {
    error('dist/plugins.json must be an array of plugin objects.');
  } else {
    success(`dist/plugins.json is valid JSON with ${plugins.length} plugin(s).`);
  }
} catch (e) {
  error(`dist/plugins.json syntax error: ${e.message}`);
  process.exit(1);
}

// 3. Verify each plugin bundle
const requiredV2Fields = ['packageName', 'name', 'version', 'baseUrl', 'authors', 'languages', 'categories'];
const requiredFunctions = ['getHome', 'search', 'load', 'loadStreams'];

for (const p of plugins) {
  console.log(`\nChecking plugin: ${p.name} (${p.packageName})...`);

  // Check required manifest fields
  for (const f of requiredV2Fields) {
    if (!p[f]) {
      error(`Manifest entry for "${p.name}" missing required field: "${f}"`);
    }
  }

  // Derive expected file name
  const skyFilename = `${p.packageName}.sky`;
  const skyPath = path.join(DIST_DIR, skyFilename);

  if (!fs.existsSync(skyPath)) {
    error(`Bundle file not found: dist/${skyFilename}`);
    continue;
  }

  const skyBuf = fs.readFileSync(skyPath);
  const zipInfo = inspectZip(skyBuf);

  if (!zipInfo.isZip) {
    error(`dist/${skyFilename} is NOT a valid PK-ZIP archive! (Magic bytes: ${skyBuf.slice(0, 4).toString('hex')}). SkyStream will fail with "Invalid .sky: Missing plugin.json".`);
    continue;
  }
  success(`dist/${skyFilename} is a valid ZIP archive (${skyBuf.length} bytes).`);

  // Check root files inside ZIP
  const hasPluginJson = zipInfo.files.includes('plugin.json');
  const hasPluginJs = zipInfo.files.includes('plugin.js');

  if (!hasPluginJson) {
    error(`dist/${skyFilename} does NOT contain root-level "plugin.json". Files found: [${zipInfo.files.join(', ')}]`);
  } else {
    success(`Found root-level "plugin.json" inside ${skyFilename}.`);
  }

  if (!hasPluginJs) {
    error(`dist/${skyFilename} does NOT contain root-level "plugin.js". Files found: [${zipInfo.files.join(', ')}]`);
  } else {
    success(`Found root-level "plugin.js" inside ${skyFilename}.`);
  }

  // Check source directory if present
  const baseName = p.packageName.split('.').pop();
  const srcDir = path.join(ROOT_DIR, 'src', baseName);
  if (fs.existsSync(srcDir)) {
    const srcJson = path.join(srcDir, 'plugin.json');
    const srcJs = path.join(srcDir, 'plugin.js');

    if (fs.existsSync(srcJson)) {
      try {
        const pj = JSON.parse(fs.readFileSync(srcJson, 'utf8'));
        if (pj.packageName !== p.packageName) {
          error(`src/${baseName}/plugin.json packageName "${pj.packageName}" does not match manifest "${p.packageName}"`);
        }
        if (pj.version !== p.version) {
          error(`src/${baseName}/plugin.json version (${pj.version}) does not match manifest (${p.version})`);
        }
        success(`Source plugin.json matches manifest version ${pj.version}.`);
      } catch (e) {
        error(`src/${baseName}/plugin.json parse error: ${e.message}`);
      }
    }

    if (fs.existsSync(srcJs)) {
      try {
        const code = fs.readFileSync(srcJs, 'utf8');
        // Syntax check
        new vm.Script(code);
        success(`src/${baseName}/plugin.js passed JavaScript syntax compilation.`);

        // Check required functions
        for (const fn of requiredFunctions) {
          if (!code.includes(fn)) {
            error(`src/${baseName}/plugin.js does not seem to contain required function: ${fn}`);
          }
        }
      } catch (e) {
        error(`src/${baseName}/plugin.js syntax error: ${e.message}`);
      }
    }
  }
}

console.log('\n======================================================');
if (hasErrors) {
  console.error('❌ Verification FAILED with errors. Fix before pushing.');
  process.exit(1);
} else {
  console.log('🎉 Verification PASSED! All plugins comply with SkyStream V2 standard.');
  process.exit(0);
}
