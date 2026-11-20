const fs = require('fs');

// Mock http_get using native fetch
globalThis.http_get = async function(url, headers) {
  try {
    const res = await fetch(url, { headers });
    const text = await res.text();
    return {
      body: text,
      status: res.status,
      finalUrl: res.url
    };
  } catch (e) {
    console.error('http_get failed for', url, e);
    return null;
  }
};

let code = fs.readFileSync('c:/Users/odhia/OneDrive - Edulink International College/Documents/RJP/sstream_plugintest/src/catalogue/plugin.js', 'utf8');

eval(code);

async function run() {
  return new Promise((resolve) => {
    globalThis.loadStreams('tt11231226|series|4|2', (res) => {
      resolve(res);
    });
  });
}

run().then(res => {
  console.log('Final Result length:', res.data ? res.data.length : 'no data');
  if (res.data) {
    res.data.forEach(s => console.log('Found:', s.name, '|', s.source, '|', s.url ? s.url.substring(0, 50) : 'no url'));
  }
}).catch(err => {
  console.error('Run failed:', err);
});
