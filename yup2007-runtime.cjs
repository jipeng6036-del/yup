const fs = require('node:fs');
const path = require('node:path');
const root = process.argv[2];
const ts = require(path.join(root, 'node_modules/typescript'));
require.extensions['.ts'] = function (module, filename) {
  const source = fs.readFileSync(filename, 'utf8');
  const result = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true } });
  module._compile(result.outputText, filename);
};
const yup = require(path.join(root, process.argv[3] === 'built' ? 'lib/index.js' : 'src/index.ts'));
(async () => {
  const rows=[];
  const permutations = ['abc','acb','bac','bca','cab','cba'];
  for (const fields of permutations) {
    for (const compactAt of ['inner','outer','declaredDependencies']) {
      for (const b of [true, 'true', 1, false, 'false', 0]) {
        const before = yup.array();
        const dependent = compactAt === 'declaredDependencies'
          ? before.when(['a','b'], {is:(a,b)=>a === true && b === true, then:s=>s.compact().min(1)})
          : before.when('a', {is:true,then:s=>(compactAt === 'outer' ? s.compact() : s).when('b',{is:true,then:s=>(compactAt === 'inner' ? s.compact() : s).min(1)})});
        const source={a:yup.boolean(),b:yup.boolean(),c:dependent};
        const schema=yup.object().shape(Object.fromEntries([...fields].map(k=>[k,source[k]])));
        const input={a:true,b,c:['']};
        let cast,error;
        try {cast=schema.cast(input);} catch(e) {error=e.message;}
        const valid=await schema.isValid(input);
        rows.push({fields,compactAt,b,nodes:schema._nodes,deps:dependent.deps,cast,error,valid});
      }
    }
  }
  console.log(JSON.stringify({node:process.version, sourceRoot:root, rows},null,2));
})().catch(e=>{console.error(e);process.exitCode=1;});
