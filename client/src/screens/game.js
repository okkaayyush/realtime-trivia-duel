import { showToast } from '../app.js';

export function GameScreen(socket, state) {
  const el = document.createElement('div');
  el.id = 'screen-game';

  const room      = state.roomState;
  const isSolo    = room.mode === 'solo';
  const isJeopardy = room.mode === 'jeopardy';
  let timerInterval = null;
  let dotResults    = [];

  // ── Scaffold ─────────────────────────────────────────────────
  el.innerHTML = `
    <header class="game-header">
      <span class="logo">TRIVIADUEL</span>
      <span class="room-tag mono">#${room.id} · ${isSolo ? 'Solo' : 'Jeopardy'}</span>
    </header>
    <main class="game-main" id="game-main"></main>
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

  // ── Scoreboard ────────────────────────────────────────────────
  function renderScores(r) {
    const sb = el.querySelector('#scoreboard');
    const players = Object.values(r.players).sort((a, b) => b.score - a.score);
    sb.innerHTML = `<h3>Scores</h3>` + players.map(p => `
      <div class="score-row${p.id === state.playerId ? ' me' : ''}">
        <span class="score-name">${p.name}</span>
        <span class="score-pts${p.score < 0 ? ' negative' : ''}">${p.score.toLocaleString()}</span>
      </div>
    `).join('');
  }

  // ── Timer bar ─────────────────────────────────────────────────
  function startTimer(durationMs, el) {
    clearInterval(timerInterval);
    const bar = el;
    const start = Date.now();
    bar.style.width = '100%';
    timerInterval = setInterval(() => {
      const pct = Math.max(0, 1 - (Date.now() - start) / durationMs);
      bar.style.width = (pct * 100) + '%';
      if (pct < 0.25) bar.classList.add('urgent');
      if (pct === 0)  clearInterval(timerInterval);
    }, 200);
  }

  // ── Jeopardy board ────────────────────────────────────────────
  function renderJeopardyBoard(r) {
    if (!r.board) return;
    const cats = Object.keys(r.board);
    const hasActiveQ = !!r.currentQuestion;

    let html = `<div class="jeopardy-board">`;
    // Header row
    cats.forEach(cat => {
      html += `<div class="jboard-cat">${cat}</div>`;
    });
    // Point rows (5 rows)
    for (let i = 0; i < 5; i++) {
      cats.forEach(cat => {
        const cell = r.board[cat][i];
        const cls  = cell.answered ? 'answered' : hasActiveQ ? 'disabled' : '';
        html += `<div class="jboard-cell ${cls}" data-cat="${cat}" data-idx="${i}">
          ${cell.answered ? '' : cell.points}
        </div>`;
      });
    }
    html += `</div>`;

    let questionHtml = '';
    if (r.currentQuestion) {
      const q    = r.currentQuestion;
      const canBuzz  = q.phase === 'buzz' && !r.buzzedPlayer;
      const myTurn   = q.phase === 'answering' && r.buzzedPlayer === state.playerId;
      const waitTurn = q.phase === 'answering' && r.buzzedPlayer !== state.playerId;
      const buzzerName = r.buzzedPlayer ? r.players[r.buzzedPlayer]?.name : null;

      questionHtml = `
        <div class="question-card">
          <div class="q-meta">
            <span class="q-category">${q.category}</span>
            <span class="q-points">${q.points}</span>
          </div>
          <div class="q-text">${q.text}</div>
          <div class="timer-bar-wrap"><div class="timer-bar" id="timer-bar"></div></div>
          ${canBuzz ? `<div class="buzz-panel">
            <span class="buzz-label">Be first to buzz in</span>
            <button class="buzz-btn" id="buzz-btn">BUZZ</button>
          </div>` : ''}
          ${waitTurn ? `<p class="muted" style="margin-top:16px;font-size:14px;">${buzzerName} is answering…</p>` : ''}
        </div>
      `;
    }

    mainEl.innerHTML = questionHtml + html;

    // Board click
    mainEl.querySelectorAll('.jboard-cell:not(.answered):not(.disabled)').forEach(cell => {
      cell.addEventListener('click', () => {
        socket.emit('jeopardy:pick', {
          roomId:     r.id,
          category:   cell.dataset.cat,
          pointIndex: parseInt(cell.dataset.idx),
        });
      });
    });

    // Buzz btn
    const buzzBtn = mainEl.querySelector('#buzz-btn');
    if (buzzBtn) {
      buzzBtn.addEventListener('click', () => {
        socket.emit('jeopardy:buzz', { roomId: r.id });
        buzzBtn.disabled = true;
      });
    }

    // Input area
    if (r.currentQuestion?.phase === 'answering' && r.buzzedPlayer === state.playerId) {
      renderAnswerInput(r);
    } else {
      inputEl.innerHTML = '';
    }

    // Start timers
    if (r.currentQuestion) {
      const bar = mainEl.querySelector('#timer-bar');
      if (bar) {
        const duration = r.currentQuestion.phase === 'buzz' ? 8000 : 10000;
        startTimer(duration, bar);
      }
    } else {
      clearInterval(timerInterval);
    }

    renderScores(r);
  }

  // ── Solo board ────────────────────────────────────────────────
  function renderSolo(r) {
    if (!r.currentQuestion) {
      mainEl.innerHTML = `<p class="muted">Loading question…</p>`;
      return;
    }
    const q      = r.currentQuestion;
    const isMyQ  = r.soloAnswering === state.playerId || Object.keys(r.players).length === 1;

    mainEl.innerHTML = `
      <div class="solo-progress">
        <span>Question ${q.index + 1} of ${q.total}</span>
        <div class="progress-dots">
          ${Array.from({length: q.total}, (_, i) => {
            let cls = 'progress-dot';
            if (i < dotResults.length)  cls += ' ' + (dotResults[i] ? 'correct' : 'wrong');
            else if (i === q.index)     cls += ' current';
            return `<div class="${cls}"></div>`;
          }).join('')}
        </div>
      </div>
      <div class="question-card">
        <div class="q-meta">
          <span class="q-category">${r.category}</span>
          <span class="q-points">+100 pts</span>
        </div>
        <div class="q-text">${q.text}</div>
        <div class="timer-bar-wrap"><div class="timer-bar" id="timer-bar"></div></div>
      </div>
    `;

    if (isMyQ) {
      renderAnswerInput(r);
      const bar = mainEl.querySelector('#timer-bar');
      if (bar) startTimer(15000, bar);
    }

    renderScores(r);
  }

  // ── Answer input ──────────────────────────────────────────────
  function renderAnswerInput(r) {
    inputEl.innerHTML = `
      <input type="text" id="answer-input" placeholder="Type your answer…" autocomplete="off" />
      <button class="btn btn-primary" id="btn-submit">Submit</button>
    `;
    const input = inputEl.querySelector('#answer-input');
    const btn   = inputEl.querySelector('#btn-submit');
    input.focus();

    const submit = () => {
      const answer = input.value.trim();
      if (!answer) return;
      socket.emit('answer:submit', { roomId: r.id, answer });
      input.disabled = true;
      btn.disabled   = true;
      btn.textContent = 'Judging…';
    };

    btn.addEventListener('click', submit);
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') submit(); });
  }

  // ── Main update ───────────────────────────────────────────────
  function update(r) {
    state.roomState = r;
    if (isSolo)    renderSolo(r);
    if (isJeopardy) renderJeopardyBoard(r);
  }

  // ── Chat ──────────────────────────────────────────────────────
  function onChat(msg) {
    const chat = el.querySelector('#chat-messages');
    if (!chat) return;
    const div = document.createElement('div');
    div.className = `chat-msg${msg.system ? ' system' : ''}`;
    div.innerHTML  = msg.system ? msg.msg : `<strong>${msg.name}</strong> ${msg.msg}`;
    chat.appendChild(div);
    chat.scrollTop = chat.scrollHeight;
  }

  // ── Answer result ─────────────────────────────────────────────
  function onResult(result) {
    clearInterval(timerInterval);
    inputEl.innerHTML = '';

    if (isSolo) {
      dotResults.push(result.correct);
    }

    const banner = document.createElement('div');
    banner.className = `result-banner ${result.correct ? 'correct' : 'wrong'}`;
    banner.innerHTML = result.correct
      ? `✓ Correct! +${result.points} pts`
      : `✗ ${result.timeout ? 'Time up! ' : 'Wrong! '}Answer: <strong style="margin-left:6px;">${result.correctAnswer}</strong>`;
    mainEl.prepend(banner);
    setTimeout(() => banner.remove(), 2000);
  }

  // ── Initial render ────────────────────────────────────────────
  update(state.roomState);

  return { name: 'game', el, update, onChat, onResult };
}