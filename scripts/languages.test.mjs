import assert from 'node:assert/strict';
import { test } from 'node:test';
import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { load24HourBaseline, main, parseLanguageShares, percentagePointChange, renderSvg } from './languages.mjs';

async function fixture(t) {
  const cwd = await mkdtemp(join(tmpdir(), 'profile-language-history-'));
  t.after(() => rm(cwd, { recursive: true, force: true }));
  const git = (args, env = {}) => execFileSync('git', args, { cwd, encoding: 'utf8',
    env: { ...process.env, ...env }, stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  git(['init', '-q', '-b', 'main']);
  await mkdir(join(cwd, 'assets'));
  return { cwd, async save(totals, observedAt, committedAt = observedAt, actor = 'github-actions[bot]') {
    await writeFile(join(cwd, 'assets/languages.svg'), renderSvg(totals, false, null, observedAt));
    git(['add', 'assets/languages.svg']);
    git(['commit', '-q', '-m', 'language observation'], {
      GIT_AUTHOR_NAME: actor, GIT_COMMITTER_NAME: actor,
      GIT_AUTHOR_EMAIL: 'test@example.invalid', GIT_COMMITTER_EMAIL: 'test@example.invalid',
      GIT_AUTHOR_DATE: committedAt, GIT_COMMITTER_DATE: committedAt,
    });
    return git(['rev-parse', 'HEAD']);
  } };
}

test('delayed schedule: select the closer sample after the 24h target', async (t) => {
  const history = await fixture(t);
  const totals = new Map([['C#', 700], ['Rust', 300]]);
  await history.save(totals, '2026-10-26T00:01:32Z');
  const nearest = await history.save(totals, '2026-10-26T05:55:04Z');
  const baseline = await load24HourBaseline({ cwd: history.cwd, now: new Date('2026-10-27T05:01:03Z') });
  assert.equal(baseline.commit, nearest);
  assert.ok(Math.abs(baseline.ageHours - 23.0997222222) < 1e-8);
  assert.equal(baseline.shares.get('Rust'), .3);
});

test('unchanged totals have distinct saved observation times and need no Actions API', async (t) => {
  const history = await fixture(t);
  const totals = new Map([['C#', 700], ['Rust', 300]]);
  await history.save(totals, '2026-01-01T10:00:00Z');
  const nearest = await history.save(totals, '2026-01-02T11:00:00Z', '2026-01-02T11:00:03Z');
  await history.save(totals, '2026-01-01T10:00:00Z', '2026-01-02T11:30:00Z');
  const baseline = await load24HourBaseline({ cwd: history.cwd, now: new Date('2026-01-03T12:00:00Z') });
  assert.equal(baseline.commit, nearest);
  assert.equal(baseline.observedAt, '2026-01-02T11:00:00Z');
  assert.equal(baseline.ageHours, 25);
});

test('manual style commits are skipped and arbitrarily old samples are rejected', async (t) => {
  const history = await fixture(t);
  const totals = new Map([['Rust', 100]]);
  const valid = await history.save(totals, '2026-01-02T11:30:00Z');
  await history.save(new Map([['C#', 100]]), '2026-01-02T11:59:00Z', '2026-01-02T11:59:00Z', 'Human');
  const baseline = await load24HourBaseline({ cwd: history.cwd, now: new Date('2026-01-03T12:00:00Z') });
  assert.equal(baseline.commit, valid);
  assert.equal(baseline.shares.get('Rust'), 1);
  assert.equal(await load24HourBaseline({ cwd: history.cwd, now: new Date('2026-01-05T12:00:00Z') }), null);
});

test('window edges are inclusive, ties prefer the older sample, and commit time cannot refresh old data', async (t) => {
  const history = await fixture(t);
  const totals = new Map([['Rust', 100]]);
  const before = await history.save(totals, '2026-01-02T06:00:00Z');
  await history.save(totals, '2026-01-02T18:00:00Z');
  const now = new Date('2026-01-03T12:00:00Z');
  assert.equal((await load24HourBaseline({ cwd: history.cwd, now })).commit, before);
  assert.equal((await load24HourBaseline({ cwd: history.cwd, now: new Date(now.getTime() + 1000) })).observedAt, '2026-01-02T18:00:00Z');
});

test('up/down changes use percentage points and hide only rounded zero changes', () => {
  assert.equal(percentagePointChange(.233, .211), 2.2);
  assert.equal(percentagePointChange(.211, .233), -2.2);
  assert.equal(percentagePointChange(.21104, .211), 0);
  assert.equal(parseLanguageShares('<svg/>'), null);
  const totals = new Map([['C#', 233], ['Rust', 100], ['QML', 667]]);
  const baseline = {commit: 'a'.repeat(40), observedAt: '2025-12-30T20:07:09.123Z', shares: new Map([['C#', .211], ['Rust', .122], ['QML', .667]])};
  for (const dark of [false, true]) {
    const svg = renderSvg(totals, dark, baseline, '2025-12-31T20:07:09.123Z');
    assert.equal((svg.match(/class="language-change"/g) ?? []).length, 2);
    assert.ok(svg.includes('▲ 2.2%') && svg.includes('▼ 2.2%'));
    assert.ok(svg.includes('24.00 hours earlier'));
    assert.ok(svg.includes('All Languages · Usage · 2026-01-01 04:07:09 UTC+8'));
    assert.ok(!svg.includes('24h changes'));
  }
});

test('main records a fresh timestamp after every successful scan and preserves outputs on failure', async (t) => {
  const history = await fixture(t);
  const originalDirectory = process.cwd();
  const originalFetch = globalThis.fetch;
  const reply = (data, status = 200) => ({ok: status === 200, status, json: async () => data});
  await writeFile(join(history.cwd, 'README.md'), '<img src="./assets/languages.svg">');
  let failure = false;
  try {
    process.chdir(history.cwd);
    globalThis.fetch = async (url) => {
      if (url.pathname === '/user') return reply({login: 'ExampleUser'});
      if (url.pathname === '/user/repos') return reply([{id: 1, name: 'test', owner: {login: 'ExampleUser'}}]);
      return failure ? reply({}, 403) : reply({Rust: 100});
    };
    const env = {LANGUAGE_STATS_TOKEN: 'fixture-only', STATS_OWNER: 'ExampleUser', STATS_REPOSITORY: 'ExampleUser/profile'};
    await main(env, {now: () => new Date('2026-01-03T12:00:00Z')});
    const first = await readFile('assets/languages.svg', 'utf8');
    await main(env, {now: () => new Date('2026-01-03T13:00:00Z')});
    const second = await readFile('assets/languages.svg', 'utf8');
    assert.notEqual(second, first);
    assert.deepEqual(parseLanguageShares(second), parseLanguageShares(first));
    assert.ok(second.includes('data-observed-at="2026-01-03T13:00:00.000Z"'));
    failure = true;
    await assert.rejects(main(env), /Metadata: Read/);
    assert.equal(await readFile('assets/languages.svg', 'utf8'), second);
  } finally {
    process.chdir(originalDirectory);
    globalThis.fetch = originalFetch;
  }
});
