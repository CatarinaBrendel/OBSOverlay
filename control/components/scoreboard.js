import { getState, setState } from './state.js';

export function initScoreboard() {
  function bindTextInput(id) {
    const input = document.getElementById(id);
    if (!input) return;
    input.addEventListener('input', async (e) => {
      const state = await getState();
      state[id] = e.target.value;
      await setState(state);
    });
  }

  function bindFooterInputs(leftId, rightId) {
    const left = document.getElementById(leftId);
    const right = document.getElementById(rightId);
    if (!left || !right) return;
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
    const key = side === 'left' ? 'leftScore' : 'rightScore';
    state[key] = Math.max(0, Number(state[key] || 0) + delta);
    await setState(state);
  }

  async function resetScores() {
    const state = await getState();
    state.leftScore = 0; state.rightScore = 0; await setState(state);
  }

  async function swapPlayers() {
    const state = await getState();
    [state.leftName, state.rightName] = [state.rightName, state.leftName];
    [state.leftScore, state.rightScore] = [state.rightScore, state.leftScore];
    await setState(state);
  }

  // expose helpers on window for inline buttons / keybindings
  window.changeScore = changeScore;
  window.resetScores = resetScores;
  window.swapPlayers = swapPlayers;

  bindTextInput('leftName');
  bindTextInput('rightName');
  bindTextInput('roundText');
  bindFooterInputs('footerLeft', 'footerRight');
}
