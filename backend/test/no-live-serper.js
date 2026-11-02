// Tests never spend a real search, whatever the machine's environment holds: a fake fetcher is the only way to reach the source.
delete process.env.SERPER_API_KEY;
delete process.env.SERPER_LIVE;
const real = global.fetch;
global.fetch = (url, init) => (/serper\.dev/i.test(String(url)) ? Promise.reject(new Error('live Serper call in a test')) : real(url, init));
