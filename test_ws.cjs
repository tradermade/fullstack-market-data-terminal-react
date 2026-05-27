const WebSocket = require('ws');

const ws = new WebSocket("wss://stream.tradermade.com/feedAdv");
ws.on("open", () => {
  console.log("Connected");
  ws.send(JSON.stringify({ action: "login", key: "ws5QZGKmKSdgZgAEhd1g", fmt: "JSON" }));
});
let step = 0;
ws.on("message", (data) => {
  const msg = data.toString();
  console.log("MSG:", msg.substring(0, 600));
  step++;
  if (step === 1) {
    setTimeout(() => {
      console.log(">> Trying plain EURUSD...");
      ws.send(JSON.stringify({ action: "subscribe", symbols: ["EURUSD"] }));
    }, 500);
  }
  if (step === 2) {
    setTimeout(() => {
      console.log(">> Trying EURUSD:QUOTE...");
      ws.send(JSON.stringify({ action: "subscribe", symbols: ["EURUSD:QUOTE"] }));
    }, 1000);
  }
});
ws.on("error", e => console.log("ERR:", e.message));
setTimeout(() => { ws.close(); process.exit(); }, 12000);
