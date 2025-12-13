import builtins, { validateSchema } from './index';
import assert from 'assert';
console.log('[core test] verifying builtins registry presence...');
assert(builtins['Button'], 'Button builtin missing');
assert(builtins['Header'], 'Header builtin missing');
assert(builtins['button'], 'lowercase button alias missing');
assert(builtins['h1'], 'h1 alias missing');
console.log('[core test] validating schemas...');
for (const key of Object.keys(builtins)) {
    const entry = builtins[key];
    if (entry && entry.schema) {
        try {
            validateSchema(entry.schema);
        }
        catch (err) {
            console.error('[core test] invalid schema for builtin', key, err);
            process.exit(1);
        }
    }
}
console.log('[core test] all checks passed');
//# sourceMappingURL=test-core.js.map