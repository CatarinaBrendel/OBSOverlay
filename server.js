const express = require("express");
const path = require("path");

const app = express();
app.use(express.static(__dirname));

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

app.post("/state", (req, res) => {
  scoreboardState = {
    ...scoreboardState,
    ...req.body
  };
  res.json({ ok: true, state: scoreboardState });
});

app.post("/reset", (req, res) => {
  scoreboardState = {
    leftName: "PLAYER 1",
    rightName: "PLAYER 2",
    leftScore: 0,
    rightScore: 0,
    roundText: "POOLS",
    footerText: "TWITCH.TV/YOURCHANNEL"
  };
  res.json({ ok: true, state: scoreboardState });
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

app.use(express.json());

app.listen(port, () => {
  console.log(`Listening on ${port}`);
});