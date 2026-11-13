// Checks that every release file agrees on the version before a release is made.
// Usage: node scripts/check-release.mjs [tag] [--notes <file>]
//   tag      optional; when given it must equal the manifest version (the release workflow passes the git tag).
//   --notes  optional; writes this version's CHANGELOG section to <file> for the release notes.
import { readFileSync, writeFileSync } from "node:fs";

const read = (f) => readFileSync(f, "utf8");
const json = (f) => JSON.parse(read(f));
const errors = [];
const check = (ok, msg) => {
	if (!ok) errors.push(msg);
};

const args = process.argv.slice(2);
const notesAt = args.indexOf("--notes");
const notesFile = notesAt >= 0 ? args[notesAt + 1] : undefined;
const tag = args.find((a, i) => !a.startsWith("--") && (notesAt < 0 || i !== notesAt + 1));

const manifest = json("manifest.json");
const pkg = json("package.json");
const lock = json("package-lock.json");
const versions = json("versions.json");
const changelog = read("CHANGELOG.md");
const v = manifest.version;
const semver = /^\d+\.\d+\.\d+$/;

check(semver.test(v), `manifest.json version "${v}" is not x.y.z`);
check(semver.test(manifest.minAppVersion ?? ""), `manifest.json minAppVersion "${manifest.minAppVersion}" is not x.y.z`);
for (const k of ["id", "name", "version", "minAppVersion", "description", "author", "isDesktopOnly"]) {
	check(k in manifest, `manifest.json is missing "${k}"`);
}
check(pkg.version === v, `package.json version ${pkg.version} != manifest ${v}`);
check(lock.version === v, `package-lock.json version ${lock.version} != manifest ${v}`);
check(lock.packages?.[""]?.version === v, `package-lock.json packages[""].version ${lock.packages?.[""]?.version} != manifest ${v}`);
check(versions[v] === manifest.minAppVersion, `versions.json["${v}"] = ${versions[v]} != manifest minAppVersion ${manifest.minAppVersion}`);
if (tag !== undefined) check(tag === v, `tag ${tag} != manifest version ${v}`);

const lines = changelog.split(/\r?\n/);
const start = lines.findIndex((l) => l.trim() === `## ${v}`);
check(start >= 0, `CHANGELOG.md has no "## ${v}" section`);

if (errors.length > 0) {
	console.error(`Release check failed for ${v}:\n- ${errors.join("\n- ")}`);
	process.exit(1);
}

if (notesFile) {
	let end = lines.findIndex((l, i) => i > start && l.startsWith("## "));
	if (end < 0) end = lines.length;
	writeFileSync(notesFile, `${lines.slice(start + 1, end).join("\n").trim()}\n`);
}
console.log(`Release check OK: ${v} (minAppVersion ${manifest.minAppVersion})`);
