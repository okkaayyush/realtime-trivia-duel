import { showToast } from '../app.js';

export function HomeScreen(socket) {
  const el = document.createElement('div');
  el.id = 'screen-home';
  el.innerHTML = `
    <div class="home-logo">
      <h1>TRIVIA<span>DUEL</span></h1>
      <p>Compete live · Jeopardy-style or solo · AI-judged answers</p>
      <div class="signal-bar">
        ${Array.from({length:7}, () => '<div class="bar"></div>').join('')}
      </div>
    </div>

    <div class="home-cards">
      <!-- Create game -->
      <div class="home-card">
        <h2>New Game</h2>
        <div class="card-fields">
          <div>
            <label>Your name</label>
            <input type="text" id="create-name" placeholder="Enter your name" maxlength="24" />
          </div>
          <div>
            <label>Mode</label>
            <select id="create-mode">
              <option value="jeopardy">Jeopardy Duel (multiplayer)</option>
              <option value="solo">Solo Round (10 questions)</option>
            </select>
          </div>
          <div id="cat-wrap">
            <label>Category (solo)</label>
            <select id="create-category">
              <option value="Mixed">Mixed</option>
              <option value="Science">Science</option>
              <option value="History">History</option>
              <option value="Geography">Geography</option>
              <option value="Pop Culture">Pop Culture</option>
              <option value="Math">Math</option>
            </select>
          </div>
        </div>
        <button class="btn btn-primary btn-lg" id="btn-create">Create game</button>
      </div>

      <!-- Join game -->
      <div class="home-card">
        <h2>Join Game</h2>
        <div class="card-fields">
          <div>
            <label>Your name</label>
            <input type="text" id="join-name" placeholder="Enter your name" maxlength="24" />
          </div>
          <div>
            <label>Room code</label>
            <input type="text" id="join-code" placeholder="e.g. A1B2C3" maxlength="6" style="text-transform:uppercase;font-family:var(--mono);letter-spacing:0.1em;" />
          </div>
        </div>
        <button class="btn btn-secondary btn-lg" id="btn-join">Join game</button>
      </div>
    </div>
  `;

  const modeSelect = el.querySelector('#create-mode');
  const catWrap    = el.querySelector('#cat-wrap');
  modeSelect.addEventListener('change', () => {
    catWrap.style.display = modeSelect.value === 'solo' ? 'block' : 'none';
  });
  catWrap.style.display = 'none';

  el.querySelector('#btn-create').addEventListener('click', () => {
    const name = el.querySelector('#create-name').value.trim();
    if (!name) return showToast('Please enter your name');
    socket.emit('room:create', {
      mode:     modeSelect.value,
      name,
      category: el.querySelector('#create-category').value,
    });
  });

  el.querySelector('#btn-join').addEventListener('click', () => {
    const name = el.querySelector('#join-name').value.trim();
    const code = el.querySelector('#join-code').value.trim().toUpperCase();
    if (!name) return showToast('Please enter your name');
    if (code.length !== 6) return showToast('Room code must be 6 characters');
    socket.emit('room:join', { roomId: code, name });
  });

  return { name: 'home', el };
}