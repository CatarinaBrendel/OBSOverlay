const DEFAULT_STATE = {
    leftName: "PLAYER 1",
    rightName: "PLAYER 2",
    leftScore: 0,
    rightScore: 0,
    roundText: "POOLS",
    footerText: "TWITCH.TV/YOURCHANNEL"
  };

  async function getState() {
    const response = await fetch("/state", { cache: "no-store" });
    return await response.json();
  }

  async function setState(state) {
    await fetch("/state", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(state)
    });

    await refreshForm();
  }

  async function refreshForm() {
    const state = await getState();

    const leftNameInput = document.getElementById("leftName");
    const rightNameInput = document.getElementById("rightName");
    const roundTextInput = document.getElementById("roundText");
    const footerLeftInput = document.getElementById("footerLeft");
    const footerRightInput = document.getElementById("footerRight");

    if (document.activeElement !== leftNameInput) leftNameInput.value = state.leftName;
    if (document.activeElement !== rightNameInput) rightNameInput.value = state.rightName;
    if (document.activeElement !== roundTextInput) roundTextInput.value = state.roundText;

    // populate split footer fields: "Left text | Right text"
    if (typeof state.footerText === 'string' && state.footerText.includes('|')) {
      const [left, right] = state.footerText.split('|').map(s => s.trim());
      if (document.activeElement !== footerLeftInput) footerLeftInput.value = left;
      if (document.activeElement !== footerRightInput) footerRightInput.value = right;
    } else {
      if (document.activeElement !== footerLeftInput) footerLeftInput.value = state.footerText || "";
      if (document.activeElement !== footerRightInput) footerRightInput.value = state.footerText || "";
    }

    document.getElementById("leftScoreDisplay").textContent = state.leftScore;
    document.getElementById("rightScoreDisplay").textContent = state.rightScore;
  }

  function bindTextInput(id) {
    const input = document.getElementById(id);
    input.addEventListener("input", async (e) => {
      const state = await getState();
      state[id] = e.target.value;
      await setState(state);
    });
  }

  function bindFooterInputs(leftId, rightId) {
    const left = document.getElementById(leftId);
    const right = document.getElementById(rightId);

    const handler = async () => {
      const state = await getState();
      state.footerText = `${left.value} | ${right.value}`;
      await setState(state);
    };

    left.addEventListener('input', handler);
    right.addEventListener('input', handler);
  }

  async function changeScore(side, delta) {
    const state = await getState();
    const key = side === "left" ? "leftScore" : "rightScore";
    state[key] = Math.max(0, Number(state[key] || 0) + delta);
    await setState(state);
  }

  async function resetScores() {
    const state = await getState();
    state.leftScore = 0;
    state.rightScore = 0;
    await setState(state);
  }

  async function swapPlayers() {
    const state = await getState();

    [state.leftName, state.rightName] = [state.rightName, state.leftName];
    [state.leftScore, state.rightScore] = [state.rightScore, state.leftScore];

    await setState(state);
  }

  async function resetAll() {
    await fetch("/reset", { method: "POST" });
    await refreshForm();
  }

  bindTextInput("leftName");
  bindTextInput("rightName");
  bindTextInput("roundText");
  bindFooterInputs("footerLeft", "footerRight");

  window.addEventListener("keydown", (event) => {
    if (["INPUT", "TEXTAREA"].includes(document.activeElement.tagName)) return;

    const key = event.key.toLowerCase();

    if (key === "a") changeScore("left", 1);
    if (key === "l") changeScore("right", 1);
    if (key === "r") resetScores();
    if (key === "s") swapPlayers();
  });

  refreshForm();