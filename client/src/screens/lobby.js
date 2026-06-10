export function LobbyScreen(socket, state) {
  const el = document.createElement('div');
  el.id = 'screen-lobby';

  function render(room) {
    const isHost = room.host === state.playerId;
    const players = Object.values(room.players);
    el.innerHTML = `
      <div class="lobby-header">
        <h2>${room.mode === 'jeopardy' ? 'Jeopardy Duel' : 'Solo Round'} · Lobby</h2>
        <div class="room-code">${room.id}</div>
        <p class="muted" style="margin-top:10px;font-size:13px;">Share this code with friends to join</p>
      </div>
      <div class="player-list">
        ${players.map(p => `
          <div class="player-row">
            <span>${p.name}${p.id === state.playerId ? ' <span style="color:var(--amber);font-size:12px;">(you)</span>' : ''}</span>
            ${p.isHost ? '<span class="badge">Host</span>' : ''}
          </div>
        `).join('')}
      </div>
      ${isHost
        ? `<button class="btn btn-primary btn-lg" id="btn-start">
             Start game &rarr;
           </button>`
        : `<p class="muted" style="font-size:14px;">Waiting for the host to start…</p>`
      }
    `;
    if (isHost) {
      el.querySelector('#btn-start').addEventListener('click', () => {
        socket.emit('game:start', { roomId: room.id });
      });
    }
  }

  render(state.roomState);

  return {
    name: 'lobby',
    el,
    update(room) { render(room); },
  };
}