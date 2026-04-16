import { sendLobbyId } from './state.js';

export function initLobbyControls() {
  const lobbySendBtn = document.getElementById('lobbySend');
  const lobbyClearBtn = document.getElementById('lobbyClear');
  const lobbyInput = document.getElementById('lobbyInput');
  const lobbyStatus = document.getElementById('lobbyStatus');

  if (lobbySendBtn && lobbyInput) {
    lobbySendBtn.addEventListener('click', async () => {
      const val = (lobbyInput.value || '').trim();
      if (!val) { lobbyStatus.textContent = 'Enter a Lobby ID.'; return; }
      lobbySendBtn.disabled = true; lobbyStatus.textContent = 'Sending...';
      try {
        const json = await sendLobbyId(val);
        if (json && json.ok) lobbyStatus.textContent = 'Lobby sent.'; else lobbyStatus.textContent = 'Error sending lobby.';
      } catch (e) { lobbyStatus.textContent = 'Network error.'; }
      finally { lobbySendBtn.disabled = false; setTimeout(() => { if (lobbyStatus) lobbyStatus.textContent = ''; }, 2000); }
    });
  }

  if (lobbyClearBtn && lobbyInput) {
    lobbyClearBtn.addEventListener('click', async () => {
      try { lobbyInput.value = 'Lobby ID: '; await sendLobbyId(''); if (lobbyStatus) lobbyStatus.textContent = 'Cleared.'; setTimeout(() => { if (lobbyStatus) lobbyStatus.textContent = ''; }, 1500); } catch (e) { if (lobbyStatus) lobbyStatus.textContent = 'Network error.'; }
    });
  }

  if (lobbyInput) {
    lobbyInput.addEventListener('focus', (e) => {
      const el = e.target; if (el.value === 'Lobby ID: ') { const len = el.value.length; el.setSelectionRange(len, len); }
    });
  }
}
