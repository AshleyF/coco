// run.js — Minimal browser test framework. No dependencies.

let _passed = 0;
let _failed = 0;
let _errors = [];
let _currentSuite = '';
let _output = null;

export function setOutput(el) { _output = el; }

function log(msg, className) {
    if (_output) {
        const div = document.createElement('div');
        div.className = className || '';
        div.textContent = msg;
        _output.appendChild(div);
    }
    console.log(msg);
}

export function suite(name) {
    _currentSuite = name;
    log(`\n=== ${name} ===`, 'suite');
}

export function test(name, fn) {
    try {
        fn();
        _passed++;
        log(`  ✓ ${name}`, 'pass');
    } catch (e) {
        _failed++;
        const msg = `  ✗ ${name}: ${e.message}`;
        log(msg, 'fail');
        _errors.push({ suite: _currentSuite, test: name, error: e.message });
    }
}

export function eq(actual, expected, label = '') {
    if (actual !== expected) {
        const prefix = label ? `${label}: ` : '';
        throw new Error(`${prefix}expected ${expected} (0x${expected.toString(16).toUpperCase()}), got ${actual} (0x${actual.toString(16).toUpperCase()})`);
    }
}

export function isTrue(val, label = '') {
    if (val !== true) {
        throw new Error(`${label || 'value'}: expected true, got ${val}`);
    }
}

export function isFalse(val, label = '') {
    if (val !== false) {
        throw new Error(`${label || 'value'}: expected false, got ${val}`);
    }
}

export function summary() {
    const total = _passed + _failed;
    const msg = `\n${_passed}/${total} passed, ${_failed} failed`;
    log(msg, _failed ? 'summary-fail' : 'summary-pass');
    if (_errors.length > 0) {
        log('\nFailures:', 'fail');
        _errors.forEach(e => log(`  [${e.suite}] ${e.test}: ${e.error}`, 'fail'));
    }
    return { passed: _passed, failed: _failed, total, errors: _errors };
}

export function reset() {
    _passed = 0;
    _failed = 0;
    _errors = [];
    _currentSuite = '';
}
