const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const root = 'F:/Github-PR/inspection/heartbeat1140-js-yup';
const ts = require(path.join(root, 'node_modules/typescript'));
require.extensions['.ts'] = (module, filename) => {
  module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
  }).outputText, filename);
};
function run(yup, mode) {
  let calls = 0;
  let caught = 0;
  const a = yup.boolean();
  const b = yup.string().transform(() => {
    calls += 1;
    if (calls === 1) throw new Error('dependent field failed on first cast');
    return 'retried-and-accepted';
  });
  const c = yup.string().when('a', (_values, schema, options) => {
    try {
      yup.string().when('b', (_v, s) => s).cast('probe', { parent: options.parent });
    } catch (error) {
      caught += 1;
    }
    return schema;
  });
  const schema = yup.object({ a, b, c });
  let output;
  let error;
  try { output = schema.cast({ a: true, b: 'input', c: 'value' }); }
  catch (e) { error = e.message; }
  return { mode, nodes: schema._nodes, calls, caught, output, error };
}
const sha = p => crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const lib = path.join(root, 'lib/index.js');
const rows = [];
if (sha(lib).startsWith('7cf6db6d')) rows.push(run(require(lib), 'exact-recorded-baseline-build'));
rows.push(run(require(path.join(root, 'src/index.ts')), 'candidate-public-source'));
console.log(JSON.stringify({ node: process.version, baselineBuildSha: sha(lib),
  sourceHashes: Object.fromEntries(['src/object.ts', 'src/Condition.ts', 'src/util/siblingResolvers.ts'].map(p => [p, sha(path.join(root, p))])), rows }, null, 2));
