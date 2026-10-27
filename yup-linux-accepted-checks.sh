set -eu
export YARN_GLOBAL_FOLDER=/work/yarn-global
export COREPACK_HOME=/work/corepack
node --version > /evidence/yup-linux-accepted-node-version.raw
node -p 'process.execPath' > /evidence/yup-linux-accepted-node-execpath.raw
sha256sum /usr/local/bin/node /work/preflight/esbuild > /evidence/yup-linux-accepted-binaries.sha256
/work/preflight/esbuild --version > /evidence/yup-linux-accepted-esbuild-version.raw
cat /proc/mounts > /evidence/yup-linux-accepted-mounts.raw
run() {
 label="$1"
 shift
 start=$(date +%s)
 set +e
 "$@" > "/evidence/yup-linux-accepted-${label}.stdout.raw" 2> "/evidence/yup-linux-accepted-${label}.stderr.raw"
 result=$?
 set -e
 end=$(date +%s)
 printf '{"exitCode":%s,"elapsedSeconds":%s}\n' "$result" "$((end-start))" > "/evidence/yup-linux-accepted-${label}.json"
 printf '%s exit=%s\n' "$label" "$result"
 if [ "$result" != 0 ]; then exit "$result"; fi
}
for variant in baseline candidate; do
 mkdir -p "/work/yup-${variant}"
 tar -xf "/evidence/yup-${variant}-canonical.tar" -C "/work/yup-${variant}"
 cd "/work/yup-${variant}"
 node -e 'const fs=require("node:fs"),crypto=require("node:crypto");let d=JSON.parse(fs.readFileSync(process.argv[1]));for(let x of d){if(crypto.createHash("sha256").update(fs.readFileSync(x.path)).digest("hex")!==x.sha256)throw Error(x.path)}console.log(JSON.stringify({files:d.length,matched:true}));' "/evidence/yup-${variant}-canonical-manifest.json" > "/evidence/yup-linux-accepted-${variant}-source-before.json"
 run "${variant}-install" yarn install --frozen-lockfile
 run "${variant}-node" yarn node -p 'process.version'
 run "${variant}-test" yarn test
 run "${variant}-source-types" yarn tsc --noEmit -p .
 run "${variant}-test-types" yarn tsc --noEmit -p test
 if [ "$variant" = candidate ]; then
  run candidate-format yarn prettier --check src/Condition.ts src/object.ts src/util/siblingResolvers.ts test/object-conditional.ts
 fi
 cp README.md "/evidence/yup-linux-accepted-${variant}-readme-before.raw"
 run "${variant}-build" yarn build
 cp README.md "/evidence/yup-linux-accepted-${variant}-readme-after.raw"
 cp "/evidence/yup-linux-accepted-${variant}-readme-before.raw" README.md
 node -e 'const fs=require("node:fs"),crypto=require("node:crypto");let d=JSON.parse(fs.readFileSync(process.argv[1]));for(let x of d){if(crypto.createHash("sha256").update(fs.readFileSync(x.path)).digest("hex")!==x.sha256)throw Error(x.path)}console.log(JSON.stringify({files:d.length,matched:true}));' "/evidence/yup-${variant}-canonical-manifest.json" > "/evidence/yup-linux-accepted-${variant}-source-after.json"
 mkdir -p "/work/${variant}-consumer"
 cd "/work/${variant}-consumer"
 printf '{"name":"yup2007-consumer","private":true}\n' > package.json
 run "${variant}-consumer-install" npm install --no-audit --no-fund "/evidence/${variant}-package/yup-1.7.1.tgz"
 run "${variant}-consumer" node /evidence/yup2007-installed-consumer.cjs "/work/${variant}-consumer"
done
