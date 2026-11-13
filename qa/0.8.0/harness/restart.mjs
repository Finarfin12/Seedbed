import { launch, killProfile, sleep } from "./obs.mjs";
import { execSync } from "node:child_process";
killProfile(); await sleep(2500);
execSync("node gen-fixtures.mjs", { stdio: "inherit" });
console.log("pid", launch()); await sleep(7000);
