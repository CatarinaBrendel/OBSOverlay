let previousState = {
  leftName: "PLAYER 1",
  rightName: "PLAYER 2",
  leftScore: 0,
  rightScore: 0,
  roundText: "POOLS",
  footerText: "TWITCH.TV/YOURCHANNEL"
};

function flashIfChanged(el, oldValue, newValue) {
  if (String(oldValue) !== String(newValue)) {
    el.classList.remove("flash");
    void el.offsetWidth;
    el.classList.add("flash");
  }
}

async function fetchState() {
  try {
    const response = await fetch("/state", { cache: "no-store" });
    const state = await response.json();

    const leftNameEl = document.getElementById("leftName");
    const rightNameEl = document.getElementById("rightName");
    const leftScoreEl = document.getElementById("leftScore");
    const rightScoreEl = document.getElementById("rightScore");
    const roundTextEl = document.getElementById("roundText");
    const footerLeftEl = document.getElementById("footerTextLeft");
    const footerRightEl = document.getElementById("footerTextRight");

    leftNameEl.textContent = state.leftName;
    rightNameEl.textContent = state.rightName;
    leftScoreEl.textContent = state.leftScore;
    rightScoreEl.textContent = state.rightScore;
    roundTextEl.textContent = state.roundText;

    // Support split footerText using `|` delimiter, or single string uses both sides
    if (typeof state.footerText === 'string' && state.footerText.includes('|')) {
      const [left, right] = state.footerText.split('|').map(s => s.trim());
      footerLeftEl.textContent = left || "";
      footerRightEl.textContent = right || "";
    } else {
      footerLeftEl.textContent = state.footerText || "";
      footerRightEl.textContent = state.footerText || "";
    }

    flashIfChanged(leftScoreEl, previousState.leftScore, state.leftScore);
    flashIfChanged(rightScoreEl, previousState.rightScore, state.rightScore);

    previousState = state;
  } catch (err) {
    console.error("Failed to fetch scoreboard state:", err);
  }
}

fetchState();
setInterval(fetchState, 200);
