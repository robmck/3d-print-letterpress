const test = require('node:test');
const assert = require('node:assert');

const mainModule = require('../src/main');
const internals = mainModule._internals;

test('dedupe removes repeated characters while preserving order', () => {
    assert.strictEqual(internals.dedupe('AABBCCAA'), 'ABC');
    assert.strictEqual(internals.dedupe('xyz'), 'xyz');
});

test('getModelBoundingBox merges bounding boxes across bodies', () => {
    const boxes = [
        { min: { x: 0, y: 0, z: 0 }, max: { x: 1, y: 1, z: 1 } },
        { min: { x: -2, y: -3, z: -4 }, max: { x: 5, y: 4, z: 2 } }
    ];
    const model = {
        BodyCount: () => boxes.length,
        GetBody: (index) => ({
            GetBoundingBox: () => JSON.parse(JSON.stringify(boxes[index]))
        })
    };

    const bbox = internals.getModelBoundingBox(model);
    assert.deepStrictEqual(bbox.min, { x: -2, y: -3, z: -4 });
    assert.deepStrictEqual(bbox.max, { x: 5, y: 4, z: 2 });
});

test('mergeModels concatenates body arrays when multiple models provided', () => {
    const first = { bodies: [1, 2] };
    const second = { bodies: [3] };
    const combined = internals.mergeModels([first, second]);
    assert.strictEqual(combined.bodies.length, 3);
    assert.deepStrictEqual(combined.bodies, [1, 2, 3]);
});

test('convertSvgPathToCommands parses valid path data', () => {
    const commands = internals.convertSvgPathToCommands('M0 0 L10 10 H20 V0 Z');
    assert.ok(Array.isArray(commands));
    assert.ok(commands.length >= 4);
});

test('convertSvgPathToCommands gracefully handles invalid path data', () => {
    const commands = internals.convertSvgPathToCommands('M0 0 L');
    assert.deepStrictEqual(commands, []);
});

test('mapSvgCommand supports multiple draw commands and fallbacks', () => {
    assert.ok(internals.mapSvgCommand({ code: 'M', x: 1, y: 2 }));
    assert.ok(internals.mapSvgCommand({ code: 'H', x: 5 }));
    assert.ok(internals.mapSvgCommand({ code: 'V', y: 9 }));
    assert.ok(internals.mapSvgCommand({ code: 'C', x1: 1, y1: 2, x2: 3, y2: 4, x: 5, y: 6 }));
    assert.ok(internals.mapSvgCommand({ code: 'S', x2: 7, y2: 8, x: 9, y: 10 }));
    assert.ok(internals.mapSvgCommand({ code: 'Q', x1: 3, y1: 4, x: 5, y: 6 }));
    assert.ok(internals.mapSvgCommand({ code: 'A', rx: 3, ry: 4, xAxisRotation: 0, largeArcFlag: 0, sweepFlag: 1, x: 5, y: 6 }));
    assert.strictEqual(internals.mapSvgCommand({}), null);
    assert.strictEqual(internals.mapSvgCommand({ code: 'X' }), null);
});

test('computeSlugBounds expands slug to include sidebearings when metrics are present', () => {
    const letterBounds = { min: { x: 120, y: 0, z: 0 }, max: { x: 320, y: 10, z: 5 } };
    const metrics = { leftSideBearing: 120, rightSideBearing: 60, xMin: 120 };
    const result = internals.computeSlugBounds(letterBounds, metrics, 380, 1000, 1000);
    assert.deepStrictEqual(result, { minX: 0, width: 380 });
});

test('computeSlugBounds preserves overhangs when bearings are negative', () => {
    const letterBounds = { min: { x: -30, y: 0, z: 0 }, max: { x: 420, y: 10, z: 5 } };
    const metrics = { leftSideBearing: -30, rightSideBearing: 40, xMin: -30 };
    const result = internals.computeSlugBounds(letterBounds, metrics, 460, 1000, 1000);
    assert.deepStrictEqual(result, { minX: -30, width: 490 });
});

test('computeSlugBounds returns null when required inputs are missing', () => {
    const letterBounds = { min: { x: 0, y: 0, z: 0 }, max: { x: 100, y: 10, z: 5 } };
    assert.strictEqual(internals.computeSlugBounds(letterBounds, null, 400, 1000, 1000), null);
    assert.strictEqual(internals.computeSlugBounds(null, {}, 400, 1000, 1000), null);
});

test('computeFontVerticalMetrics honors USE_TYPO_METRICS bit from OS/2', () => {
    const font = {
        unitsPerEm: 1000,
        tables: {
            os2: {
                fsSelection: 0x80,
                sTypoAscender: 900,
                sTypoDescender: -200,
                usWinAscent: 1100,
                usWinDescent: 450
            }
        }
    };
    const bounds = { minZ: -10, maxZ: 30 };
    const metrics = internals.computeFontVerticalMetrics(font, 60, bounds);
    assert.deepStrictEqual(metrics, { top: 54, bottom: -12, height: 66 });
});

test('computeFontVerticalMetrics uses usWin metrics when USE_TYPO_METRICS is unset', () => {
    const font = {
        unitsPerEm: 1000,
        tables: {
            os2: {
                fsSelection: 0,
                sTypoAscender: 900,
                sTypoDescender: -200,
                usWinAscent: 1100,
                usWinDescent: 450
            }
        }
    };
    const bounds = { minZ: -20, maxZ: 50 };
    const metrics = internals.computeFontVerticalMetrics(font, 50, bounds);
    assert.deepStrictEqual(metrics, { top: 55, bottom: -22.5, height: 77.5 });
});

test('computeFontVerticalMetrics falls back to hhea ascender/descender when OS/2 missing', () => {
    const font = {
        unitsPerEm: 1000,
        tables: {
            hhea: { ascender: 800, descender: -300 }
        }
    };
    const metrics = internals.computeFontVerticalMetrics(font, 40, null);
    assert.deepStrictEqual(metrics, { top: 32, bottom: -12, height: 44 });
});

test('computeFontVerticalMetrics falls back to head yMax/yMin when hhea missing', () => {
    const font = {
        unitsPerEm: 1000,
        tables: {
            head: { yMax: 700, yMin: -200 }
        }
    };
    const metrics = internals.computeFontVerticalMetrics(font, 10, null);
    assert.deepStrictEqual(metrics, { top: 7, bottom: -2, height: 9 });
});

test('computeFontVerticalMetrics falls back to glyph bounds when metrics missing', () => {
    const font = { unitsPerEm: 1000 };
    const bounds = { minZ: -5, maxZ: 32 };
    const metrics = internals.computeFontVerticalMetrics(font, 72, bounds);
    assert.deepStrictEqual(metrics, { top: 32, bottom: -5, height: 37 });
});
