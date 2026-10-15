import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseCommand } from '../src/commands.js';

test('Turkish commands and aliases', () => {
  assert.deepEqual(parseCommand('!çal tarkan şımarık'), { name: 'play', args: 'tarkan şımarık' });
  assert.deepEqual(parseCommand('!ÇAL https://youtu.be/abc'), { name: 'play', args: 'https://youtu.be/abc' });
  assert.deepEqual(parseCommand('!p x'), { name: 'play', args: 'x' });
  assert.deepEqual(parseCommand('!play x'), { name: 'play', args: 'x' });
  assert.equal(parseCommand('!atla').name, 'skip');
  assert.equal(parseCommand('!duraklat').name, 'pause');
  assert.equal(parseCommand('!devam').name, 'resume');
  assert.equal(parseCommand('!durdur').name, 'stop');
  assert.equal(parseCommand('!kuyruk').name, 'queue');
  assert.equal(parseCommand('!döngü').name, 'loop');
  assert.equal(parseCommand('!DÖNGÜ').name, 'loop');
  assert.equal(parseCommand('!kuyrukdöngü').name, 'queueloop');
  assert.equal(parseCommand('!şimdi').name, 'nowplaying');
  assert.equal(parseCommand('!ŞİMDİ').name, 'nowplaying');
  assert.equal(parseCommand('!yardım').name, 'help');
  assert.equal(parseCommand('!YARDIM').name, 'help');
});

test('ASCII fallbacks for people without a Turkish keyboard', () => {
  assert.equal(parseCommand('!cal x').name, 'play');
  assert.equal(parseCommand('!dongu').name, 'loop');
  assert.equal(parseCommand('!kuyrukdongu').name, 'queueloop');
  assert.equal(parseCommand('!simdi').name, 'nowplaying');
  assert.equal(parseCommand('!yardim').name, 'help');
});

test('ignores chat and unknown commands', () => {
  assert.equal(parseCommand('merhaba'), null);
  assert.equal(parseCommand('!'), null);
  assert.equal(parseCommand('!bilinmeyen'), null);
  assert.equal(parseCommand(undefined), null);
  assert.equal(parseCommand('  !çal   multi\nline  ').args, 'multi\nline');
});

test('custom prefix', () => {
  assert.equal(parseCommand('?çal x', '?').name, 'play');
  assert.equal(parseCommand('!çal x', '?'), null);
});
