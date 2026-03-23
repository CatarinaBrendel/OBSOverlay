const express = require("express");
const path = require("path");
const http = require("http");
const WebSocket = require("ws");

const app = express();
app.use(express.static(__dirname));

// parse JSON bodies for POST requests
app.use(express.json());

let scoreboardState = {
  leftName: "PLAYER 1",
  rightName: "PLAYER 2",
  leftScore: 0,
  rightScore: 0,
  roundText: "POOLS",
  footerText: "TWITCH.TV/YOURCHANNEL"
};

app.get("/state", (req, res) => {
  res.json(scoreboardState);
});


// Serve control UI at root and index.html
app.get(["/", "/index.html"], (req, res) => {
  res.sendFile(path.join(__dirname, "control.html"));
});

// Convenience route to open the overlay directly
app.get(["/overlay", "/overlay.html"], (req, res) => {
  res.sendFile(path.join(__dirname, "overlay.html"));
});

const port = process.env.PORT || 3000;

// create HTTP server and attach WebSocket server so WS uses same port
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

function broadcastState() {
  const msg = JSON.stringify({ type: "state", state: scoreboardState });
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) client.send(msg);
  });
}

// broadcast updates when state changes via HTTP endpoints

// Attach WebSocket connection handler
wss.on('connection', (ws) => {
  ws.send(JSON.stringify({ type: "state", state: scoreboardState }));
});

// Overwrite the POST handlers to broadcast after updating state
// (simple approach: wrap the handlers by re-defining endpoints)
app.post('/state', (req, res) => {
  scoreboardState = { ...scoreboardState, ...req.body };
  broadcastState();
  res.json({ ok: true, state: scoreboardState });
});

app.post('/reset', (req, res) => {
  scoreboardState = {
    leftName: "PLAYER 1",
    rightName: "PLAYER 2",
    leftScore: 0,
    rightScore: 0,
    roundText: "POOLS",
    footerText: "TWITCH.TV/YOURCHANNEL"
  };
  broadcastState();
  res.json({ ok: true, state: scoreboardState });
});

server.listen(port, () => {
  console.log(`Listening on ${port}`);
});