const express = require("express");
const path = require("path");

const app = express();
const PORT = 8000;

app.use(express.json());
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

app.listen(PORT, () => {
  console.log(`Scoreboard server running at http://localhost:${PORT}`);
});