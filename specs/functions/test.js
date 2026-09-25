const assert = require('assert');
const { detectType, readFiles } = require('./lib');
const mp4 = Buffer.concat([Buffer.from([0,0,0,0x20]), Buffer.from('ftypM4A '), Buffer.alloc(20)]);
assert.equal(detectType(mp4, 'video/mp4'), 'audio/mp4');
assert.equal(detectType(Buffer.from('OggS\0\0\0\0')), 'audio/ogg');
assert.equal(detectType(Buffer.from('ID3\x03\0\0')), 'audio/mpeg');
assert.equal(detectType(Buffer.from('RIFF\0\0\0\0WAVE')), 'audio/wav');
assert.equal(detectType(Buffer.from('%PDF-1.4 xxxxx')), null);
(async () => {
  const raw = await readFiles({ headers: { 'content-type': 'application/octet-stream', 'x-nom': 'WhatsApp%20Audio.mp4' }, rawBody: mp4, query: {} });
  assert.equal(raw.length, 1); assert.equal(raw[0].name, 'WhatsApp Audio.mp4');
  const b = 'XX';
  const body = Buffer.concat([
    Buffer.from(`--${b}\r\nContent-Disposition: form-data; name="audio"; filename="a.mp4"\r\nContent-Type: video/mp4\r\n\r\n`), mp4,
    Buffer.from(`\r\n--${b}\r\nContent-Disposition: form-data; name="audio"; filename="b.ogg"\r\nContent-Type: audio/ogg\r\n\r\nOggS1234\r\n--${b}--\r\n`)]);
  const mp = await readFiles({ headers: { 'content-type': `multipart/form-data; boundary=${b}` }, rawBody: body, query: {} });
  assert.equal(mp.length, 2); assert.equal(mp[0].data.length, mp4.length); assert.equal(detectType(mp[1].data), 'audio/ogg');
  console.log('tests OK');
})().catch((e) => { console.error(e); process.exit(1); });
