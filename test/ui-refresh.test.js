'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const ui = require('../systems/ui');
const refresh = require('../systems/panelRefresh');

test('UI progress stays finite, bounded and consistent', () => {
    for (const value of [-10, NaN, Infinity, undefined, 'bad']) {
        assert.equal(ui.progressBar(value, 100), '░'.repeat(10));
        assert.match(ui.progressLine(value, 100), /\*\*0%\*\*$/);
    }
    assert.equal(ui.progressBar(200, 100), '█'.repeat(10));
    assert.equal(ui.progressBar(50, 100, 4, 'arrow'), '▰▰▱▱');
    assert.equal(ui.progressBar(1, 0), '░'.repeat(10));
    assert.equal(ui.progressBar(1, 2, -5), '');
    assert.equal(ui.progressBar(1, 2, Infinity).length, 10);
    assert.equal(ui.progressBar(1, 2, 100000).length, 100);
    assert.match(ui.progressLine(200, 100), /\*\*100%\*\*$/);
});

test('UI buttons serialize using real Discord builders without changing routes', () => {
    const row = ui.backRow('farm_main_123').toJSON();
    assert.equal(row.components[0].custom_id, 'farm_main_123');
    assert.equal(row.components[0].style, 2);
    const button = ui.button('quest_claim_123', 'Klaim', 'success', { disabled: true }).toJSON();
    assert.equal(button.disabled, true);
    assert.equal(button.style, 3);
});

test('refresh handles concurrency, navigation, expiration and rejected edits', async () => {
    const registry = refresh._registry;
    registry.clear();
    try {
        let release;
        let edits = 0;
        const message = { id: 'progress', edit: async () => { edits++; } };
        refresh.track(message, () => new Promise(resolve => { release = resolve; }));
        const first = refresh.tick();
        await refresh.tick();
        refresh.untrack(message.id);
        release({ content: 'outdated' });
        await first;
        assert.equal(edits, 0, 'removed panel must not be edited');
        let rejectEdit;
        const old = { id: 'progress', edit: () => new Promise((resolve, reject) => { rejectEdit = reject; }) };
        refresh.track(old, () => ({ content: 'old' }));
        const failing = refresh.tick();
        await Promise.resolve();
        refresh.track(message, () => ({ content: 'new' }));
        rejectEdit(new Error('old request failed'));
        await failing;
        assert.equal(registry.get('progress').message, message);
        await refresh.tick();
        assert.equal(edits, 1);
        registry.get('progress').expiresAt = Date.now();
        await refresh.tick();
        assert.equal(registry.size, 0);
        assert.equal(edits, 1);
        refresh.track(message, async () => { throw new Error('builder failed'); });
        await refresh.tick();
        assert.equal(registry.size, 0);
        refresh.track(message, () => ({ content: 'recovered' }));
        await refresh.tick();
        assert.equal(edits, 2, 'failed builder must release tick lock');
    } finally {
        registry.clear();
    }
});
