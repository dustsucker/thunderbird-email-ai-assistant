const fs = require('fs');
const path = require('path');

// npm `version` lifecycle script: package.json was already bumped, mirror it into manifest.json.
// npm stages package.json itself; the `git add` in the version script picks up manifest.json into the same commit/tag.
const root = path.join(__dirname, '..');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const manifestPath = path.join(root, 'manifest.json');
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

manifest.version = pkg.version;
fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
console.log(`manifest.json synced to version ${pkg.version}`);
