import builtins, { validateSchema, libraryCategories } from './index.js';
import assert from 'assert';

console.log('[core test] verifying builtins registry presence...');
assert(builtins['Button'], 'Button builtin missing');
assert(builtins['Header'], 'Header builtin missing');
assert(builtins['button'], 'lowercase button alias missing');
assert(builtins['h1'], 'h1 alias missing');

console.log('[core test] verifying libraryCategories presence...');
assert(Array.isArray(libraryCategories) && libraryCategories.length > 0, 'libraryCategories missing/empty');
assert(typeof libraryCategories[0].key === 'string', 'libraryCategories[0].key missing');
assert(Array.isArray(libraryCategories[0].components), 'libraryCategories[0].components missing');

console.log('[core test] validating schemas...');
for (const key of Object.keys(builtins)) {
  const entry = builtins[key];
  if (entry && entry.schema) {
    try {
      validateSchema(entry.schema);
    } catch (err) {
      console.error('[core test] invalid schema for builtin', key, err);
      process.exit(1);
    }
  }
}

console.log('[core test] all checks passed');
