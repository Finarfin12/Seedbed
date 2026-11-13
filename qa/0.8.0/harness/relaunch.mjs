import { killProfile, relaunch, sleep } from "./obs.mjs";
killProfile(); await sleep(3000);
console.log("pid", relaunch()); await sleep(8000);
