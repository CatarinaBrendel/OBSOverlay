// Lightweight state helpers for control UI
export async function getState() {
  const res = await fetch('/state', { cache: 'no-store' });
  return await res.json();
}

export async function setState(state) {
  await fetch('/state', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(state) });
}

export async function sendLobbyId(id) {
  const res = await fetch('/lobby', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) });
  return await res.json();
}

export async function sendCountdownCommand(action, duration) {
  await fetch('/countdown', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, duration }) });
}

export async function sendLabel(label) {
  await fetch('/countdown', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'label', label }) });
}

export async function getIframeState() {
  const res = await fetch('/iframe', { cache: 'no-store' });
  if (!res.ok) return null;
  return await res.json();
}

export async function setIframeState(payload) {
  const res = await fetch('/iframe', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
  return await res.json();
}

export async function sendAnnouncement(payload) {
  const url = (window.location && window.location.origin ? window.location.origin : '') + '/announce';
  const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
  return await res.json();
}

export async function resetAll() {
  await fetch('/reset', { method: 'POST' });
}
