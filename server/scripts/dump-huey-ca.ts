import path = require("path");
import { CachePipeline } from "../src/main/typescript/elvarg/game/cache/CachePipeline";
import { CacheDefinitions } from "../src/main/typescript/elvarg/game/cache/CacheDefinitions";

async function main() {
  await CachePipeline.initialize(path.resolve(__dirname, ".."));
  const monsters = new Map([...CacheDefinitions.getEnumValues(3970)].map(([k, v]) => [Number(k), String(v)]));
  const hueyKeys = [...monsters].filter(([, v]) => /huey/i.test(v)).map(([k]) => k);
  console.log("huey monster keys:", JSON.stringify(hueyKeys));
  for (const enumId of [3981, 3982, 3983, 3984, 3985, 3986]) {
    for (const [, struct] of CacheDefinitions.getEnumValues(enumId)) {
      const params = CacheDefinitions.getStructParams(Number(struct)) as Map<number, unknown>;
      const m = params.get(1312);
      const mid = typeof m === "number" ? m : Number(m);
      if (!hueyKeys.includes(mid)) continue;
      console.log(JSON.stringify({ id: params.get(1306), name: params.get(1308), desc: params.get(1309), tier: params.get(1310), type: params.get(1311) }));
    }
  }
}
main();
