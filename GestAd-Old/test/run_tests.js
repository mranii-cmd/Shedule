// minimal check: wait for /health and print OK or fail
import http from 'http';

const url = process.env.TEST_URL || 'http://localhost:3001/health';

function attempt(retries = 30) {
  return new Promise((resolve, reject) => {
    const tryOnce = (n) => {
      http.get(url, (res) => {
        let body = '';
        res.on('data', c => body += c);
        res.on('end', () => {
          if (res.statusCode === 200) {
            console.log('health ok', body);
            return resolve(0);
          }
          console.log('status', res.statusCode);
          if (n <= 0) return reject(new Error('no success'));
          setTimeout(() => tryOnce(n - 1), 1000);
        });
      }).on('error', (e) => {
        if (n <= 0) return reject(e);
        setTimeout(() => tryOnce(n - 1), 1000);
      });
    };
    tryOnce(retries);
  });
}

attempt().then(() => process.exit(0)).catch((e) => {
  console.error('tests failed', e.message);
  process.exit(2);
});