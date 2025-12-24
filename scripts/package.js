const fs = require('fs');
const path = require('path');
const archiver = require('archiver');

async function build() {
  console.log('Building addon...');
  const { exec } = require('child_process');
  return new Promise((resolve, reject) => {
    exec('npm run build', (error, stdout, stderr) => {
      if (error) {
        console.error('Build failed:', stderr);
        reject(error);
        return;
      }
      console.log('Build completed');
      resolve();
    });
  });
}

function getVersion() {
  const manifestPath = path.join(__dirname, '..', 'manifest.json');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  return manifest.version;
}

function createZip(version) {
  return new Promise((resolve, reject) => {
    const outputFileName = `email-assistant-${version}.zip`;
    const outputPath = path.join(__dirname, '..', outputFileName);
    const output = fs.createWriteStream(outputPath);
    const archive = archiver('zip', { zlib: { level: 9 } });

    output.on('close', () => {
      console.log(`ZIP created: ${outputFileName} (${archive.pointer()} bytes)`);
      resolve();
    });

    archive.on('error', (err) => {
      reject(err);
    });

    archive.pipe(output);

    const rootDir = path.join(__dirname, '..');

    archive.file(path.join(rootDir, 'manifest.json'), { name: 'manifest.json' });
    archive.file(path.join(rootDir, 'options.html'), { name: 'options.html' });
    archive.file(path.join(rootDir, 'background.html'), { name: 'background.html' });
    archive.file(path.join(rootDir, 'options.css'), { name: 'options.css' });
    archive.file(path.join(rootDir, 'background-bundle.js'), { name: 'background-bundle.js' });
    archive.file(path.join(rootDir, 'options-bundle.js'), { name: 'options-bundle.js' });
    archive.file(path.join(rootDir, 'icon.png'), { name: 'icon.png' });
    archive.file(path.join(rootDir, 'icon-128x128.png'), { name: 'icon-128x128.png' });

    archive.directory(path.join(rootDir, 'doc', 'screenshots'), 'doc/screenshots');

    archive.finalize();
  });
}

async function main() {
  try {
    await build();
    const version = getVersion();
    console.log(`Creating ZIP for version ${version}...`);
    await createZip(version);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

main();
