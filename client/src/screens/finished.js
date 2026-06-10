import { goHome } from '../app.js';

export function FinishedScreen(socket, state, room) {
  const el = document.createElement('div');
  el.id = 'screen-finished';

  const players = Object.values(room.players).sort((a, b) => b.score - a.score);
  const isSolo  = room.mode === 'solo';

  el.innerHTML = `
    <h2>${isSolo ? 'Round Complete' : 'Game Over'}</h2>
    <p class="muted">${isSolo ? 'Your final score' : 'Final standings'}</p>
    <div class="final-scores">
      ${players.map((p, i) => `
        <div class="final-row ${i === 0 ? 'first' : ''}">
          <span class="rank mono">${i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `#${i+1}`}</span>
          <span class="final-name">${p.name}${p.id === state.playerId ? ' <span style="color:var(--text-muted);font-size:12px;">(you)</span>' : ''}</span>
          <span class="final-pts">${p.score.toLocaleString()}</span>
        </div>
      `).join('')}
    </div>
    <button class="btn btn-primary btn-lg" id="btn-home">Play again</button>
  `;

  el.querySelector('#btn-home').addEventListener('click', () => goHome());

  return { name: 'finished', el };
}