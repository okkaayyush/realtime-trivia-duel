import { HomeScreen }     from './screens/home.js';
import { LobbyScreen }    from './screens/lobby.js';
import { GameScreen }     from './screens/game.js';
import { FinishedScreen } from './screens/finished.js';

const socket = io();
const app    = document.getElementById('app');
const toast  = document.createElement('div');
toast.id = 'toast';
document.body.appendChild(toast);

export const state = {
  playerId:  null,
  roomId:    null,
  roomState: null,
};

export function showToast(msg) {
  toast.textContent = msg;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 3000);
}

// ── Routing ───────────────────────────────────────────────────
let currentScreen = null;

function render(screen) {
  app.innerHTML = '';
  currentScreen = screen;
  app.appendChild(screen.el);
  screen.mount?.();
}

export function goHome() {
  render(HomeScreen(socket));
}

// ── Socket events ─────────────────────────────────────────────
socket.on('room:joined', ({ roomId, playerId }) => {
  state.playerId = playerId;
  state.roomId   = roomId;
});

socket.on('room:state', (room) => {
  state.roomState = room;
  if (room.state === 'lobby') {
    if (!(currentScreen?.name === 'lobby')) render(LobbyScreen(socket, state));
    else currentScreen.update?.(room);
  } else if (room.state === 'playing') {
    if (!(currentScreen?.name === 'game')) render(GameScreen(socket, state));
    else currentScreen.update?.(room);
  } else if (room.state === 'finished') {
    render(FinishedScreen(socket, state, room));
  }
});

socket.on('error', ({ msg }) => showToast(msg));

socket.on('chat', (msg) => currentScreen?.onChat?.(msg));

socket.on('answer:result', (result) => currentScreen?.onResult?.(result));

// ── Boot ──────────────────────────────────────────────────────
goHome();