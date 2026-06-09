import { io } from "socket.io-client";
import type { Socket } from "socket.io-client";

const REALTIME_URL = process.env.REALTIME_URL || "http://127.0.0.1:3001";

async function checkHealth() {
  console.log(`Checking health endpoint: ${REALTIME_URL}/health`);
  const response = await fetch(`${REALTIME_URL}/health`);
  if (!response.ok) {
    throw new Error(`Health check failed: ${response.statusText}`);
  }
  const data = await response.json();
  console.log("Health check response:", JSON.stringify(data, null, 2));
  if (!data.ok) {
    throw new Error("Health check returned ok: false");
  }
}

async function checkSocket() {
  console.log(`Checking socket connection: ${REALTIME_URL}`);
  return new Promise<void>((resolve, reject) => {
    const socket: Socket = io(REALTIME_URL, {
      transports: ["websocket"],
      timeout: 5000
    });

    const timeout = setTimeout(() => {
      socket.disconnect();
      reject(new Error("Socket connection timeout"));
    }, 10000);

    socket.on("connect", () => {
      console.log("Socket connected successfully");
      
      // Try a room:create
      socket.emit("room:create", { nickname: "SmokeTest", guestId: "smoke-test-guest" }, (response) => {
        if (response.ok) {
          console.log("Room created successfully:", response.data.roomCode);
          socket.disconnect();
          clearTimeout(timeout);
          resolve();
        } else {
          socket.disconnect();
          clearTimeout(timeout);
          reject(new Error(`Room creation failed: ${response.error}`));
        }
      });
    });

    socket.on("connect_error", (err) => {
      socket.disconnect();
      clearTimeout(timeout);
      reject(new Error(`Socket connection error: ${err.message}`));
    });
  });
}

async function main() {
  try {
    await checkHealth();
    await checkSocket();
    console.log("Smoke test passed!");
    process.exit(0);
  } catch (error) {
    console.error("Smoke test failed:", error);
    process.exit(1);
  }
}

main();
