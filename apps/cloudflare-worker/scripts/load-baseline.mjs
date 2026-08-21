/* global console, process */

import { writeFile } from "node:fs/promises";
import {
  createRoomCode,
  createSummary,
  executeRoomScenario,
  LoadBaselineError,
  readConfiguration,
} from "./load-baseline-lib.mjs";

let configuration;
try {
  configuration = readConfiguration();
} catch (error) {
  if (error instanceof LoadBaselineError) {
    console.error(`[${error.stage}/${error.code}] ${error.message}`);
  } else {
    console.error(error instanceof Error ? error.message : String(error));
  }
  process.exit(2);
}

const { workerUrl, roomsRequested, timeoutMs, outputPath } = configuration;
const startedAt = new Date();
console.log(
  `Running bounded load baseline against ${workerUrl.origin}: ${roomsRequested} rooms / ${roomsRequested * 2} WebSockets planned (40 max)`,
);

const rooms = await Promise.all(
  Array.from({ length: roomsRequested }, (_, offset) => executeRoomScenario({
    index: offset + 1,
    roomCode: createRoomCode(),
    workerUrl,
    timeoutMs,
  })),
);
const summary = createSummary({
  target: workerUrl,
  startedAt,
  finishedAt: new Date(),
  rooms,
});

console.log(JSON.stringify(summary, null, 2));

if (outputPath) {
  await writeFile(outputPath, `${JSON.stringify(summary, null, 2)}\n`, "utf8");
  console.log(`Saved load baseline JSON to ${outputPath}`);
}

if (summary.roomsFailed > 0) {
  process.exitCode = 1;
}
