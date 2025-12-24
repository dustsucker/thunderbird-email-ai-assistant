const fs = require('fs');
const path = require('path');

function clean() {
  const rootDir = path.join(__dirname, '..');
  const files = fs.readdirSync(rootDir);

  files.forEach(file => {
    if (file.endsWith('.zip')) {
      const filePath = path.join(rootDir, file);
      fs.unlinkSync(filePath);
      console.log(`Deleted: ${file}`);
    }
  });

  console.log('Clean completed');
}

clean();
