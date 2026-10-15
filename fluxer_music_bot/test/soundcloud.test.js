import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cleanTitleForSearch, isYouTubeUrl } from '../src/ytdlp.js';

test('cleans video-only noise from YouTube titles', () => {
  assert.equal(cleanTitleForSearch('TARKAN - Şımarık (Official Music Video)'), 'TARKAN - Şımarık');
  assert.equal(cleanTitleForSearch('Sezen Aksu - Firuze [HD]'), 'Sezen Aksu - Firuze');
  assert.equal(cleanTitleForSearch('Duman - Bu Akşam (Official Audio)'), 'Duman - Bu Akşam');
  assert.equal(cleanTitleForSearch('Manga - Dünyanın Sonuna Doğmuşum'), 'Manga - Dünyanın Sonuna Doğmuşum');
});

test('recognises YouTube links only', () => {
  assert.ok(isYouTubeUrl('https://www.youtube.com/watch?v=cpp69ghR1IM'));
  assert.ok(isYouTubeUrl('https://youtu.be/cpp69ghR1IM'));
  assert.ok(!isYouTubeUrl('https://soundcloud.com/tarkan/simarik'));
});
