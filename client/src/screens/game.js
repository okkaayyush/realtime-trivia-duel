import { showToast } from '../app.js';

export function GameScreen(socket, state) {
  const el = document.createElement('div');
  el.id = 'screen-game';

  const room = state.roomState;
  const isSolo = room.mode === 'solo';
  const isJeopardy = room.mode === 'jeopardy';

  let timerInterval = null;
  let dotResults = [];
  let currentQuestionIndex = -1;

  el.innerHTML = `
    <header class="game-header">
      <span class="logo">TRIVIADUEL</span>
      <span class="room-tag mono">#${room.id} · ${isSolo ? 'Solo' : 'Jeopardy'}</span>
    </header>
    <main class="game-main" id="game-main">
      <p class="muted" style="padding:24px;">Waiting for first question…</p>
    </main>
    <div class="game-input" id="game-input"></div>
    <aside class="game-sidebar">
      <div class="scoreboard" id="scoreboard"><h3>Scores</h3></div>
      <div class="chat-panel">
        <div class="chat-messages" id="chat-messages"></div>
      </div>
    </aside>
  `;

  const mainEl  = el.querySelector('#game-main');
  const inputEl = el.querySelector('#game-input');

  // ── Helpers ───────────────────────────────────────────────────

  function renderScores(players) {
    const sb = el.querySelector('#scoreboard');
    const sorted = Object.values(players).sort((a, b) => b.score - a.score);
    sb.innerHTML = `<h3>Scores</h3>` + sorted.map(p => `
      <div class="score-row${p.id === state.playerId ? ' me' : ''}">
        <span class="score-name">${p.name}</span>
        <span class="score-pts${p.score < 0 ? ' negative' : ''}">${p.score.toLocaleString()}</span>
      </div>
    `).join('');
  }

  function startTimer(ms) {
    clearInterval(timerInterval);
    const bar = mainEl.querySelector('#timer-bar');
    if (!bar) return;
    const start = Date.now();
    bar.style.width = '100%';
    bar.classList.remove('urgent');
    timerInterval = setInterval(() => {
      const pct = Math.max(0, 1 - (Date.now() - start) / ms);
      bar.style.width = (pct * 100) + '%';
      if (pct < 0.25) bar.classList.add('urgent');
      if (pct <= 0) clearInterval(timerInterval);
    }, 100);
  }

  function showAnswerInput(roomId) {
    inputEl.innerHTML = `
      <input type="text" id="answer-input" placeholder="Type your answer…" autocomplete="off" />
      <button class="btn btn-primary" id="btn-submit">Submit</button>
    `;
    const input = inputEl.querySelector('#answer-input');
    const btn   = inputEl.querySelector('#btn-submit');
    input.focus();

    let submitted = false;
    const submit = () => {
      if (submitted) return;
      const answer = input.value.trim();
      if (!answer) return showToast('Type an answer first');
      submitted = true;
      input.disabled = true;
      btn.disabled = true;
      btn.textContent = 'Judging…';
      socket.emit('answer:submit', { roomId, answer });
    };
    btn.addEventListener('click', submit);
    input.addEventListener('keydown', e => { if (e.key === 'Enter') submit(); });
  }

  function hideAnswerInput() {
    inputEl.innerHTML = '';
  }

  // ── Solo question handler (dedicated event) ───────────────────

  function showSoloQuestion(data) {
    clearInterval(timerInterval);
    currentQuestionIndex = data.index;

    const dots = Array.from({ length: data.total }, (_, i) => {
      let cls = 'progress-dot';
      if (i < dotResults.length) cls += ' ' + (dotResults[i] ? 'correct' : 'wrong');
      else if (i === data.index) cls += ' current';
      return `<div class="${cls}"></div>`;
    }).join('');

    mainEl.innerHTML = `
      <div class="solo-progress">
        <span>Question ${data.index + 1} of ${data.total}</span>
        <div class="progress-dots">${dots}</div>
      </div>
      <div class="question-card">
        <div class="q-meta">
          <span class="q-category">${data.category}</span>
          <span class="q-points">+100 pts</span>
        </div>
        <div class="q-text">${data.text}</div>
        <div class="timer-bar-wrap"><div class="timer-bar" id="timer-bar"></div></div>
      </div>
    `;

    if (data.scores) renderScores(data.scores);
    showAnswerInput(room.id);
    startTimer(15000);
  }

  // ── Answer result ─────────────────────────────────────────────

  function onResult(result) {
    clearInterval(timerInterval);
    hideAnswerInput();

    if (isSolo) dotResults.push(result.correct);

    // Update dots
    const dots = mainEl.querySelectorAll('.progress-dot');
    if (dots[currentQuestionIndex]) {
      dots[currentQuestionIndex].classList.remove('current');
      dots[currentQuestionIndex].classList.add(result.correct ? 'correct' : 'wrong');
    }

    // Show result on the question card
    const card = mainEl.querySelector('.question-card');
    if (card) {
      const resultEl = document.createElement('div');
      resultEl.className = `result-banner ${result.correct ? 'correct' : 'wrong'}`;
      resultEl.style.marginTop = '16px';
      resultEl.innerHTML = result.correct
        ? `✓ Correct! +${result.points} pts`
        : `✗ ${result.timeout ? 'Time up! ' : 'Wrong! '}The answer was: <strong style="margin-left:4px;">${result.correctAnswer}</strong>`;
      card.appendChild(resultEl);
    }
  }

  // ── Jeopardy update (via room:state) ──────────────────────────

  function updateJeopardy(r) {
    if (!r.board) return;
    const cats = Object.keys(r.board);
    const hasActiveQ = !!r.currentQuestion;

    let boardHtml = `<div class="jeopardy-board">`;
    cats.forEach(cat => { boardHtml += `<div class="jboard-cat">${cat}</div>`; });
    for (let i = 0; i < 5; i++) {
      cats.forEach(cat => {
        const cell = r.board[cat][i];
        const cls = cell.answered ? 'answered' : hasActiveQ ? 'disabled' : '';
        boardHtml += `<div class="jboard-cell ${cls}" data-cat="${cat}" data-idx="${i}">${cell.answered ? '' : cell.points}</div>`;
      });
    }
    boardHtml += `</div>`;

    let questionHtml = '';
    if (r.currentQuestion) {
      const q = r.currentQuestion;
      const canBuzz = q.phase === 'buzz';
      const myTurn  = q.phase === 'answering' && r.buzzedPlayer === state.playerId;
      const waiting = q.phase === 'answering' && r.buzzedPlayer !== state.playerId;
      const buzzerName = r.buzzedPlayer ? r.players[r.buzzedPlayer]?.name : '';

      questionHtml = `
        <div class="question-card">
          <div class="q-meta">
            <span class="q-category">${q.category}</span>
            <span class="q-points">${q.points}</span>
          </div>
          <div class="q-text">${q.text}</div>
          <div class="timer-bar-wrap"><div class="timer-bar" id="timer-bar"></div></div>
          ${canBuzz ? `<div class="buzz-panel"><span class="buzz-label">Buzz in to answer</span><button class="buzz-btn" id="buzz-btn">BUZZ</button></div>` : ''}
          ${waiting ? `<p class="muted" style="margin-top:16px;font-size:14px;">${buzzerName} is answering…</p>` : ''}
        </div>
      `;
    }

    mainEl.innerHTML = questionHtml + boardHtml;

    mainEl.querySelectorAll('.jboard-cell:not(.answered):not(.disabled)').forEach(cell => {
      cell.addEventListener('click', () => {
        socket.emit('jeopardy:pick', { roomId: r.id, category: cell.dataset.cat, pointIndex: parseInt(cell.dataset.idx) });
      });
    });

    const buzzBtn = mainEl.querySelector('#buzz-btn');
    if (buzzBtn) {
      buzzBtn.addEventListener('click', () => {
        socket.emit('jeopardy:buzz', { roomId: r.id });
        buzzBtn.disabled = true;
      });
    }

    if (r.currentQuestion?.phase === 'answering' && r.buzzedPlayer === state.playerId) {
      showAnswerInput(r.id);
      startTimer(10000);
    } else {
      hideAnswerInput();
      if (r.currentQuestion?.phase === 'buzz') startTimer(8000);
      else clearInterval(timerInterval);
    }

    renderScores(r.players);
  }

  // ── Socket listeners (scoped to this screen) ──────────────────

  socket.on('solo:question', showSoloQuestion);
  socket.on('answer:result', onResult);

  // ── app.js calls update() when room:state arrives ─────────────

  function update(r) {
    state.roomState = r;
    if (isJeopardy) updateJeopardy(r);
    // solo: driven by solo:question events, not room:state
    if (isSolo) renderScores(r.players);
  }

  function onChat(msg) {
    const chat = el.querySelector('#chat-messages');
    if (!chat) return;
    const div = document.createElement('div');
    div.className = `chat-msg${msg.system ? ' system' : ''}`;
    div.innerHTML = msg.system ? msg.msg : `<strong>${msg.name}</strong> ${msg.msg}`;
    chat.appendChild(div);
    chat.scrollTop = chat.scrollHeight;
  }

  // Initial render for jeopardy
  if (isJeopardy) updateJeopardy(room);
  renderScores(room.players);

  // Cleanup when screen is replaced
  function destroy() {
    clearInterval(timerInterval);
    socket.off('solo:question', showSoloQuestion);
    socket.off('answer:result', onResult);
  }

  return { name: 'game', el, update, onChat, destroy };
}