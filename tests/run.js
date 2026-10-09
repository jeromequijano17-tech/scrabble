'use strict';
const assert = require('assert');
const path = require('path');
const E = require('../src/engine');
const Dictionary = require('../src/dictionary');
const { generateMoves } = require('../src/ai');
const { Game } = require('../src/game');
const { eloDelta } = require('../src/elo');

const dict = new Dictionary(path.join(__dirname, '../data/words.txt'));
const P = (word, r, c, dr, dc) => [...word].map((l, i) => ({ r: r + dr * i, c: c + dc * i, l, b: false }));
let passed = 0;
const t = (name, fn) => { fn(); passed++; console.log('  ok  ' + name); };

t('bag has 100 tiles', () => {
  const bag = E.makeBag();
  assert.strictEqual(bag.length, 100);
  assert.strictEqual(bag.filter(x => x === '*').length, 2);
});
t('premium layout counts', () => {
  const c = {};
  for (const row of E.PREMIUM) for (const p of row) c[p] = (c[p] || 0) + 1;
  assert.deepStrictEqual([c.TW, c.DW, c.TL, c.DL], [8, 17, 12, 24]);
});
t('first word CAT scores 10 (DW on center)', () => {
  const ev = E.evaluateMove(E.newBoard(), P('CAT', 7, 6, 0, 1), dict);
  assert.ok(ev.ok); assert.strictEqual(ev.score, 10);
});
t('first word must cover center / be 2+ tiles', () => {
  assert.ok(!E.evaluateMove(E.newBoard(), P('CAT', 0, 0, 0, 1), dict).ok);
  assert.ok(!E.evaluateMove(E.newBoard(), P('A', 7, 7, 0, 1), dict).ok);
});
t('rejects gaps, diagonals, occupied squares, bad words', () => {
  const b = E.newBoard();
  assert.ok(!E.evaluateMove(b, [{ r: 7, c: 6, l: 'C' }, { r: 7, c: 8, l: 'T' }], dict).ok);
  assert.ok(!E.evaluateMove(b, [{ r: 7, c: 7, l: 'C' }, { r: 8, c: 8, l: 'A' }], dict).ok);
  assert.ok(!E.evaluateMove(b, P('XQZ', 7, 6, 0, 1), dict).ok);
  assert.ok(!E.evaluateMove(b, [{ r: -1, c: 0, l: 'A' }, { r: 0, c: 0, l: 'A' }], dict).ok);
});
t('cross words, premiums only on new tiles, blank scores 0', () => {
  const b = E.newBoard();
  for (const p of P('CAT', 7, 6, 0, 1)) b[p.r][p.c] = { l: p.l, b: false };
  // "AT" down from A(7,7)? -> vertical word through A: place T at (8,7) => "AT"
  const ev = E.evaluateMove(b, [{ r: 8, c: 7, l: 'T', b: false }], dict);
  assert.ok(ev.ok); assert.strictEqual(ev.words[0].word, 'AT');
  const blank = E.evaluateMove(b, [{ r: 8, c: 7, l: 'T', b: true }], dict);
  assert.strictEqual(blank.score, 1); // A=1 + blank 0
  assert.ok(!E.evaluateMove(b, [{ r: 0, c: 0, l: 'A' }, { r: 0, c: 1, l: 'B' }], dict).ok); // not connected
});
t('bingo bonus', () => {
  const ev = E.evaluateMove(E.newBoard(), P('TEACHER', 7, 1, 0, 1), dict);
  assert.ok(ev.ok && ev.bingo);
  assert.ok(ev.score >= 50);
});
t('elo is symmetric-ish and sane', () => {
  assert.strictEqual(eloDelta(1200, 1200, 1), 16);
  assert.strictEqual(eloDelta(1200, 1200, 0.5), 0);
  assert.ok(eloDelta(1000, 1400, 1) > 16);
});

// ---- brute-force cross-check of the AI move generator ----
function bruteForce(board, rack) {
  const counts = {}; for (const l of rack) counts[l] = (counts[l] || 0) + 1;
  const keys = new Set();
  const empty = E.isEmptyBoard(board);
  for (const word of dict.words) {
    for (const horizontal of [true, false]) {
      for (let line = 0; line < 15; line++) for (let start = 0; start + word.length <= 15; start++) {
        const cell = (i) => horizontal ? board[line][start + i] : board[start + i][line];
        const before = start > 0 ? (horizontal ? board[line][start - 1] : board[start - 1][line]) : null;
        const end = start + word.length;
        const after = end < 15 ? (horizontal ? board[line][end] : board[end][line]) : null;
        if (before || after) continue;
        const need = {}; let ok = true; const placements = [];
        for (let i = 0; i < word.length && ok; i++) {
          const t0 = cell(i);
          if (t0) { if (t0.l !== word[i]) ok = false; }
          else { need[word[i]] = (need[word[i]] || 0) + 1; if (need[word[i]] > (counts[word[i]] || 0)) ok = false;
            placements.push(horizontal ? { r: line, c: start + i, l: word[i], b: false } : { r: start + i, c: line, l: word[i], b: false }); }
        }
        if (!ok || !placements.length) continue;
        const ev = E.evaluateMove(board, placements, dict);
        if (ev.ok) keys.add(placements.map(p => `${p.r},${p.c},${p.l}`).sort().join('|') + '#' + ev.score);
      }
    }
  }
  return keys;
}
const keyOf = (m) => m.placements.map(p => `${p.r},${p.c},${p.l}`).sort().join('|') + '#' + m.score;

t('AI generator == brute force (empty board)', () => {
  const rack = [...'CATSDOG'];
  const gen = new Set(generateMoves(E.newBoard(), rack, dict).map(keyOf));
  const bf = bruteForce(E.newBoard(), rack);
  assert.ok(bf.size > 0);
  assert.deepStrictEqual([...gen].sort(), [...bf].sort());
});
t('AI generator == brute force (mid-game boards)', () => {
  for (let trial = 0; trial < 4; trial++) {
    const g = new Game({ code: 'T', mode: 'ai', dict, aiDelay: 99999, timerSec: 9999 });
    g.addPlayer({ uid: 'ai:1', name: 'A', isAI: true, level: 'hard' });
    g.addPlayer({ uid: 'ai:2', name: 'B', isAI: true, level: 'medium' });
    g.start(); clearTimeout(g.aiTimer); clearTimeout(g.timer);
    for (let i = 0; i < 6 + trial && g.status === 'playing'; i++) { g._aiTurn(); }
    clearTimeout(g.aiTimer); clearTimeout(g.timer);
    const rack = g.current().rack.filter(l => l !== '*');
    const gen = new Set(generateMoves(g.board, rack, dict).map(keyOf));
    const bf = bruteForce(g.board, rack);
    assert.deepStrictEqual([...gen].sort(), [...bf].sort(), `trial ${trial}`);
    g.destroy();
  }
});

// ---- full AI-vs-AI games: tile conservation and scoring invariants ----
const total = (g) => g.board.flat().filter(Boolean).length + g.bag.length + g.players.reduce((s, p) => s + p.rack.length, 0);
(async () => {
  for (const levels of [['hard', 'medium'], ['easy', 'hard', 'medium'], ['easy', 'easy']]) {
    await new Promise((resolve, reject) => {
      const g = new Game({ code: 'S', mode: 'ai', dict, aiDelay: 0, timerSec: 9999, maxPlayers: levels.length,
        emit: (type, gm) => {
          try {
            if (type === 'update') assert.strictEqual(total(gm) + gm.players.filter(p => !p.active).reduce((s, p) => s + 0, 0), 100);
            if (type === 'finished') {
              assert.ok(gm.result.winners.length >= 1);
              assert.ok(gm.history.length > 3);
              console.log(`  ok  sim ${levels.join('/')}: ${gm.history.length} turns, scores ${gm.players.map(p => p.score).join('-')} (${gm.result.reason})`);
              gm.destroy(); resolve();
            }
          } catch (e) { reject(e); }
        } });
      levels.forEach((lv, i) => g.addPlayer({ uid: 'ai:' + i, name: 'AI' + i, isAI: true, level: lv }));
      g.maxPlayers = levels.length;
      g.start();
      setTimeout(() => reject(new Error('sim timeout')), 120000).unref();
    });
    passed++;
  }
  // human-flow: resign, wrong turn, bad rack
  const g = new Game({ code: 'H', mode: 'private', dict, aiDelay: 99999, timerSec: 9999 });
  g.addPlayer({ uid: 'u:1', name: 'A' }); g.addPlayer({ uid: 'u:2', name: 'B' });
  g.start();
  const other = g.current().uid === 'u:1' ? 'u:2' : 'u:1';
  assert.throws(() => g.pass(other), /not your turn/);
  assert.throws(() => g.play(g.current().uid, [{ r: 7, c: 7, l: 'Z' }, { r: 7, c: 8, l: 'Z' }].map(x => ({ ...x }))), /(tiles|dictionary)/);
  g.resign(other);
  assert.strictEqual(g.status, 'finished'); assert.deepStrictEqual(g.result.winners, [g.players.find(p => p.uid !== other).uid]);
  g.destroy(); passed++; console.log('  ok  resign / turn enforcement');
  console.log(`\n${passed} test groups passed`);
  process.exit(0);
})().catch(e => { console.error('FAILED:', e); process.exit(1); });
