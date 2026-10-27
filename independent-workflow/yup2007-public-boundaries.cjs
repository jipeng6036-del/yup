const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const root = path.resolve(process.argv[2]);
const mode = process.argv[3] || 'built';
const ts = require(path.join(root, 'node_modules/typescript'));
require.extensions['.ts'] = function (module, filename) {
  const source = fs.readFileSync(filename, 'utf8');
  const result = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true } });
  module._compile(result.outputText, filename);
};
const entry = path.join(root, mode === 'built' ? 'lib/index.js' : 'src/index.ts');
const yup = require(entry);
const rows = [];
function errorOf(fn) { try { fn(); } catch (e) { return e; } throw Error('Expected validation to fail'); }
async function test(name, fn, expectedToChange = false) {
  try { const observations = await fn(); rows.push({name, expectedToChange, status:'PASS', observations}); }
  catch (e) { rows.push({name, expectedToChange, status:'FAIL', error:{name:e.name,message:e.message,actual:e.actual,expected:e.expected,stack:e.stack}}); }
}
function nestedC(predicate=true, branch=s=>s.compact().min(1)) {
  return yup.array().when('a', {is:true,then:s=>s.when('b', {is:predicate,then:branch})});
}
function fieldsInOrder(fields,order) { return yup.object(Object.fromEntries([...order].map(k=>[k,fields[k]]))); }
(async () => {
  for (const order of ['abc','acb','bac','bca','cab','cba']) {
    for (const b of [true,'true',1,false,'false',0]) {
      await test(`permutation/${order}/b=${JSON.stringify(b)}`, async()=> {
        const schema=fieldsInOrder({a:yup.boolean(),b:yup.boolean(),c:nestedC()},order);
        const input={a:true,b,c:['']};
        const actual=schema.cast(input);
        const selected=[true,'true',1].some(v=>v===b);
        assert.deepEqual(actual,{a:true,b:selected,c:selected?[]:['']});
        assert.equal(await schema.isValid(input),!selected);
        assert.equal(schema.isValidSync(input),!selected);
        assert.deepEqual(input,{a:true,b,c:['']});
        return {cast:actual,valid:!selected};
      },true);
    }
  }
  await test('default-true-sibling',()=>{
    const schema=yup.object({a:yup.boolean(),b:yup.boolean().default(true),c:nestedC()});
    assert.deepEqual(schema.cast({a:true,c:['']}),{a:true,b:true,c:[]});
    assert.equal(schema.isValidSync({a:true,c:['']}),false);
  },true);
  await test('strip-sibling-remains-absent',()=>{
    const fixed=yup.object({a:yup.boolean(),b:yup.boolean().strip(),c:nestedC(v=>v===undefined)});
    const out=fixed.cast({a:true,b:true,c:['']});
    assert.deepEqual(out,{a:true,c:[]});assert.equal(Object.hasOwn(out,'b'),false);
    assert.equal(fixed.isValidSync({a:true,b:true,c:['']}),false);
  });
  await test('strict-object-intentionally-skips-transforms',async()=>{
    const input={a:true,b:true,c:['']};const schema=yup.object({a:yup.boolean(),b:yup.boolean(),c:nestedC()}).strict();
    assert.equal(await schema.isValid(input),true);assert.equal(schema.validateSync(input),input);
  });
  await test('strict-field-keeps-raw-boolean-for-validation',()=>{
    const input={a:true,b:'true',c:['']};const schema=yup.object({a:yup.boolean(),b:yup.boolean().strict(),c:nestedC()});
    const err=errorOf(()=>schema.validateSync(input,{abortEarly:false}));
    assert.equal(err.name,'ValidationError');assert.deepEqual(err.inner.map(e=>[e.path,e.type]),[['b','typeError']]);
    assert.deepEqual(err.value.c,['']);
  });
  await test('cast-ignores-field-strict-as-before',()=>{
    const schema=yup.object({a:yup.boolean(),b:yup.boolean().strict(),c:nestedC()});
    assert.deepEqual(schema.cast({a:true,b:'true',c:['']}),{a:true,b:true,c:[]});
  },true);
  await test('nested-dotpath-default-coercion',()=>{
    const schema=yup.object({a:yup.boolean(),b:yup.object({enabled:yup.boolean().default(true)}),c:yup.array().when('a',{is:true,then:s=>s.when('b.enabled',{is:true,then:s=>s.compact().min(1)})})});
    assert.deepEqual(schema.cast({a:true,b:{enabled:'true'},c:['']}),{a:true,b:{enabled:true},c:[]});
    assert.deepEqual(schema.cast({a:true,c:['']}),{a:true,b:{enabled:true},c:[]});
  },true);
  await test('otherwise-inner-branch-reads-cast-sibling',()=>{
    const schema=yup.object({a:yup.boolean(),b:yup.boolean().default(false),c:yup.array().when('a',{is:true,then:s=>s.when('b',{is:true,then:s=>s.min(0),otherwise:s=>s.compact().min(1)})})});
    assert.deepEqual(schema.cast({a:true,b:'false',c:['']}),{a:true,b:false,c:[]});
    assert.equal(schema.isValidSync({a:true,b:'false',c:['']}),false);
  });
  await test('outer-otherwise-can-introduce-sibling-dependency',()=>{
    const schema=yup.object({a:yup.boolean(),b:yup.boolean().default(true),c:yup.array().when('a',{is:true,then:s=>s,otherwise:s=>s.when('b',{is:true,then:s=>s.compact().min(1)})})});
    assert.deepEqual(schema.cast({a:false,c:['']}),{a:false,b:true,c:[]});
  },true);
  await test('inactive-outer-then-not-invoked',()=>{
    let calls=0;const c=yup.array().when('a',{is:true,then:s=>{calls++;return s.when('b',{is:true,then:s=>s.compact()});}});
    const input={a:false,b:true,c:['']};const schema=yup.object({a:yup.boolean(),b:yup.boolean(),c});
    assert.equal(schema.cast(input),input);assert.equal(calls,0);
  });
  await test('identity-no-transform-selected-schema',()=>{
    const c=yup.array().when('a',{is:true,then:s=>s.when('b',{is:true,then:s=>s.min(1)})});
    const input={a:true,b:true,c:['x']};const schema=yup.object({a:yup.boolean(),b:yup.boolean(),c});
    assert.equal(schema.cast(input),input);assert.equal(schema.validateSync(input),input);
  });
  for (const api of ['cast','validateSync','validate']) {
    await test(`non-idempotent-transforms-once/${api}`,async()=>{
      const calls={a:0,b:0,c:0};const fields={
        a:yup.boolean().transform(v=>{calls.a++;return v;}),
        b:yup.number().transform(v=>{calls.b++;return v+1;}),
        c:yup.array().transform(v=>{calls.c++;return v;}).when('a',{is:true,then:s=>s.when('b',{is:2,then:s=>s.compact().min(1)})}),
      };
      const schema=yup.object(fields), input={a:true,b:1,c:['']};
      let out;
      if(api==='cast')out=schema.cast(input);
      else {let err;try{await schema[api](input);}catch(e){err=e;}assert.equal(err?.name,'ValidationError');out=err.value;assert.equal(err.type,'min');assert.equal(err.path,'c');}
      assert.deepEqual(out,{a:true,b:2,c:[]});assert.deepEqual(calls,{a:1,b:1,c:1});assert.deepEqual(input,{a:true,b:1,c:['']});
      return {calls,out};
    },true);
  }
  for (const unknown of [true,false,undefined]) {
    await test(`unknown-sibling/${unknown}`,()=>{
      const schema=yup.object({a:yup.boolean(),c:nestedC()});const input={a:true,c:['']};if(unknown!==undefined)input.b=unknown;
      const out=schema.cast(input);assert.deepEqual(out.c,unknown===true?[]:['']);
      if(unknown!==undefined)assert.equal(out.b,unknown);else assert.equal(Object.hasOwn(out,'b'),false);
    },unknown===true);
  }
  await test('static-cycle-keeps-build-time-error',()=>{
    const err=errorOf(()=>yup.object({a:yup.boolean().when('b',{is:true,then:s=>s}),b:yup.boolean().when('a',{is:true,then:s=>s})}));
    assert.match(err.message,/Cyclic dependency/);
  });
  await test('excluded-edge-static-control',()=>{
    const schema=yup.object().shape({a:yup.boolean().when('b',{is:true,then:s=>s}),b:yup.boolean().when('a',{is:true,then:s=>s})},[['a','b']]);
    assert.deepEqual(schema.cast({a:true,b:true}),{a:true,b:true});
  });
  await test('excluded-edge-keeps-unresolved-sibling-semantics',()=>{
    const schema=yup.object().shape({a:yup.boolean(),b:yup.boolean().when('c',{is:v=>Array.isArray(v),then:s=>s}),c:yup.array().when('b',{is:true,then:s=>s.compact()})},[['c','b']]);
    const out=schema.cast({a:true,b:true,c:['']});
    // c->b was explicitly excluded: do not re-enable it through dynamic resolution.
    assert.deepEqual(out,{a:true,b:true,c:['']});
  });
  for (const a of [false,true]) {
    await test(`dynamic-cycle/outer=${a}`,()=>{
      const schema=yup.object({a:yup.boolean(),b:yup.boolean().when('c',{is:()=>true,then:s=>s}),c:nestedC()});
      const run=()=>schema.cast({a,b:true,c:['']});
      if(a){const err=errorOf(run);assert.match(err.message,/Cyclic dependency/);}
      else assert.deepEqual(run(),{a:false,b:true,c:['']});
    },a);
  }
  for (const defaultB of [true,false]) {
    await test(`pseudo-cycle/defaultB=${defaultB}`,()=>{
      const c=yup.array().when('a',{is:true,then:s=>s.when('b',{is:v=>v===undefined,then:s=>s.when('d',{is:()=>true,then:s=>s.compact()})})});
      const schema=yup.object({a:yup.boolean(),b:defaultB?yup.boolean().default(true):yup.boolean(),c,d:yup.boolean().when('c',{is:()=>true,then:s=>s.default(true)})});
      const run=()=>schema.cast({a:true,c:['']});
      if(defaultB)assert.deepEqual(run(),{a:true,b:true,c:[''],d:true});
      else {const err=errorOf(run);assert.match(err.message,/Cyclic dependency/);}
    },true);
  }
  await test('explicit-excluded-dynamic-edge-is-not-reenabled',()=>{
    const schema=yup.object().shape({a:yup.boolean(),b:yup.boolean(),c:nestedC()},[['c','b']]);
    assert.deepEqual(schema.cast({a:true,b:true,c:['']}),{a:true,b:true,c:['']});
  });
  for (const api of ['cast','validateSync']) {
    await test(`condition-builders-count/${api}`,()=>{
      const calls={outer:0,inner:0};
      const c=yup.array().when('a',([a],s)=>{calls.outer++;return s.when('b',([b],s)=>{calls.inner++;return s.min(0);});});
      const schema=yup.object({a:yup.boolean(),b:yup.boolean(),c});const input={a:true,b:true,c:['x']};
      assert.equal(schema[api](input),input);
      assert.deepEqual(calls,api==='cast'?{outer:1,inner:1}:{outer:2,inner:2});
      return calls;
    });
  }
  await test('context-dependency-stays-outside-object-resolution',()=>{
    const c=yup.array().when('a',{is:true,then:s=>s.when('$b',{is:true,then:s=>s.compact()})});
    const schema=yup.object({a:yup.boolean(),b:yup.boolean().default(false),c});
    assert.deepEqual(schema.cast({a:true,c:['']},{context:{b:true}}),{a:true,b:false,c:[]});
  });
  for (const dotted of [false,true]) {
    await test(`reference-chain-preserves-casted-sibling/dotted=${dotted}`,()=>{
      const b=yup.ref(dotted?'d.enabled':'d');
      const schema=yup.object({a:yup.boolean(),b,c:nestedC(),d:dotted?yup.object({enabled:yup.boolean().default(true)}):yup.boolean().default(true)});
      const out=schema.cast({a:true,c:['']});
      assert.equal(out.b,true);assert.deepEqual(out.c,[]);assert.deepEqual(out.d,dotted?{enabled:true}:true);
    },true);
  }
  await test('transitive-sibling-reference-chain',()=>{
    const schema=yup.object({a:yup.boolean(),b:yup.ref('d'),c:nestedC(),d:yup.ref('e'),e:yup.boolean().default(true)});
    assert.deepEqual(schema.cast({a:true,c:['']}),{a:true,b:true,c:[],d:true,e:true});
  },true);
  for (const order of ['abcde','deabc','cbade']) {
    await test(`excluded-reference-edge/${order}`,()=>{
      const fields={a:yup.boolean(),b:yup.ref('d'),c:nestedC(),d:yup.boolean().default(true),e:yup.string()};
      const schema=yup.object().shape(Object.fromEntries([...order].map(k=>[k,fields[k]])),[['b','d']]);
      const controlFields={...fields,c:yup.array().when(['a','b'],{is:(a,b)=>a===true&&b===true,then:s=>s.compact().min(1)})};
      const control=yup.object().shape(Object.fromEntries([...order].map(k=>[k,controlFields[k]])),[['b','d']]);
      // Excluding b->d means the selected order may expose undefined. Both public constructions must agree on b.
      const actual=schema.cast({a:true,c:['']}),expected=control.cast({a:true,c:['']});
      assert.equal(actual.b,expected.b);assert.equal(Object.hasOwn(actual,'b'),Object.hasOwn(expected,'b'));
      assert.deepEqual(actual.c,actual.b===true?[]:['']);
    },true);
  }
  for (const active of [false,true]) {
    await test(`dynamic-cycle-through-reference/active=${active}`,()=>{
      const schema=yup.object({a:yup.boolean(),b:yup.ref('d'),c:nestedC(),d:yup.boolean().when('c',{is:()=>true,then:s=>s.default(true)})});
      const run=()=>schema.cast({a:active,c:['']});
      if(active)assert.match(errorOf(run).message,/Cyclic dependency/);
      else assert.deepEqual(run(),{a:false,b:true,c:[''],d:true});
    },active);
  }
  await test('excluded-reference-cycle-edge-remains-usable',()=>{
    const schema=yup.object().shape({a:yup.boolean(),b:yup.ref('d'),c:nestedC(),d:yup.boolean().when('c',{is:()=>true,then:s=>s.default(true)})},[['d','c']]);
    assert.deepEqual(schema.cast({a:true,c:['']}),{a:true,b:true,c:[],d:true});
  },true);
  await test('unknown-sibling-stripUnknown-stays-absent',()=>{
    const schema=yup.object({a:yup.boolean(),c:nestedC(v=>v===undefined)});
    assert.deepEqual(schema.cast({a:true,b:true,c:['']},{stripUnknown:true}),{a:true,c:[]});
  });
  await test('resolver-removed-after-throw-and-new-call-is-independent',()=>{
    let throwOnce=true;const b=yup.boolean().transform(v=>{if(throwOnce){throwOnce=false;throw Error('independent-transform-sentinel');}return v;});
    const schema=yup.object({a:yup.boolean(),b,c:nestedC()});
    assert.match(errorOf(()=>schema.cast({a:true,b:true,c:['']})).message,/independent-transform-sentinel/);
    assert.deepEqual(schema.cast({a:true,b:true,c:['']}),{a:true,b:true,c:[]});
  },true);
  const receipt={node:process.version,root,mode,entry,entrySha256:crypto.createHash('sha256').update(fs.readFileSync(entry)).digest('hex'),counts:{total:rows.length,pass:rows.filter(r=>r.status==='PASS').length,fail:rows.filter(r=>r.status==='FAIL').length},rows};
  console.log(JSON.stringify(receipt,null,2));process.exitCode=receipt.counts.fail?1:0;
})().catch(e=>{console.error(e);process.exitCode=2;});
