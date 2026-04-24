const https = require('https');
const fs = require('fs');

https.get('https://raw.githubusercontent.com/github/explore/main/topics/javascript/javascript.png', (res) => {
  const filePath = fs.createWriteStream('test-dl.png');
  res.pipe(filePath);
  filePath.on('finish', () => {
    filePath.close();
    console.log('Download Completed');
  });
}).on('error', (err) => {
  console.log('Error: ', err.message);
});
