require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const Anthropic = require('@anthropic-ai/sdk');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });
const client = new Anthropic();

app.use(express.static(path.join(__dirname, '../client')));
app.use(express.json());

// ── In-memory state ──────────────────────────────────────────────
const rooms = {}; // roomId -> room object

// ── Trivia bank ──────────────────────────────────────────────────
const CATEGORIES = {
  'Science': [
    { q: 'What is the chemical symbol for gold?', a: 'Au' },
    { q: 'How many bones are in the adult human body?', a: '206' },
    { q: 'What planet is known as the Red Planet?', a: 'Mars' },
    { q: 'What is the powerhouse of the cell?', a: 'mitochondria' },
    { q: 'What gas do plants absorb from the atmosphere?', a: 'carbon dioxide' },
    { q: 'What is the speed of light in km/s?', a: '299792' },
    { q: 'What element has atomic number 1?', a: 'hydrogen' },
    { q: 'What is the hardest natural substance on Earth?', a: 'diamond' },
    { q: 'How many chromosomes do humans have?', a: '46' },
    { q: 'What force keeps planets in orbit around the sun?', a: 'gravity' },
  ],
  'History': [
    { q: 'In what year did World War II end?', a: '1945' },
    { q: 'Who was the first President of the United States?', a: 'George Washington' },
    { q: 'In what year did the Berlin Wall fall?', a: '1989' },
    { q: 'Which empire was ruled by Julius Caesar?', a: 'Roman Empire' },
    { q: 'What year did the Titanic sink?', a: '1912' },
    { q: 'Who wrote the Declaration of Independence?', a: 'Thomas Jefferson' },
    { q: 'What ancient wonder was located in Alexandria?', a: 'Lighthouse of Alexandria' },
    { q: 'In what year did India gain independence from Britain?', a: '1947' },
    { q: 'Who was the first woman to win a Nobel Prize?', a: 'Marie Curie' },
    { q: 'What war was fought between the North and South in the USA?', a: 'Civil War' },
  ],
  'Geography': [
    { q: 'What is the capital of Australia?', a: 'Canberra' },
    { q: 'Which is the longest river in the world?', a: 'Nile' },
    { q: 'What country has the most natural lakes?', a: 'Canada' },
    { q: 'What is the smallest country in the world?', a: 'Vatican City' },
    { q: 'On which continent is the Sahara Desert?', a: 'Africa' },
    { q: 'What is the capital of Japan?', a: 'Tokyo' },
    { q: 'Which ocean is the largest?', a: 'Pacific' },
    { q: 'What mountain range separates Europe from Asia?', a: 'Ural Mountains' },
    { q: 'In which country is Machu Picchu located?', a: 'Peru' },
    { q: 'What is the capital of Canada?', a: 'Ottawa' },
  ],
  'Pop Culture': [
    { q: 'Who played Iron Man in the Marvel Cinematic Universe?', a: 'Robert Downey Jr' },
    { q: 'What TV show featured a chemistry teacher turned drug dealer?', a: 'Breaking Bad' },
    { q: 'Which band performed Bohemian Rhapsody?', a: 'Queen' },
    { q: 'What is the best-selling video game of all time?', a: 'Minecraft' },
    { q: 'Who wrote the Harry Potter series?', a: 'J.K. Rowling' },
    { q: 'What streaming service produced Stranger Things?', a: 'Netflix' },
    { q: 'Which artist released the album Thriller?', a: 'Michael Jackson' },
    { q: 'What sport does Serena Williams play?', a: 'tennis' },
    { q: 'Who directed Inception?', a: 'Christopher Nolan' },
    { q: 'What app is known for short videos and the For You page?', a: 'TikTok' },
  ],
  'Math': [
    { q: 'What is the square root of 144?', a: '12' },
    { q: 'What is 15% of 200?', a: '30' },
    { q: 'How many sides does a hexagon have?', a: '6' },
    { q: 'What is pi rounded to two decimal places?', a: '3.14' },
    { q: 'What is 7 factorial (7!)?', a: '5040' },
    { q: 'What is the sum of angles in a triangle?', a: '180' },
    { q: 'What is 2 to the power of 10?', a: '1024' },
    { q: 'What is the next prime number after 11?', a: '13' },
    { q: 'What is 25 squared?', a: '625' },
    { q: 'If a circle has radius 5, what is its area? (use pi=3.14)', a: '78.5' },
  ],
};

const POINT_VALUES = [200, 400, 600, 800, 1000];

// ── AI Judge ──────────────────────────────────────────────────────
async function judgeAnswer(question, correctAnswer, playerAnswer) {
  if (!playerAnswer || playerAnswer.trim() === '') return false;
  try {
    const msg = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 100,
      messages: [{
        role: 'user',
        content: `You are a trivia judge. Determine if the player's answer is correct.
Question: ${question}
Correct Answer: ${correctAnswer}
Player Answer: ${playerAnswer}

Rules:
- Accept minor spelling errors, abbreviations, and partial matches if clearly correct
- Accept "Civil War" for "American Civil War"
- Reject completely wrong answers
- Respond with ONLY: CORRECT or INCORRECT`,
      }],
    });
    const verdict = msg.content[0].text.trim().toUpperCase();
    return verdict.includes('CORRECT') && !verdict.includes('INCORRECT');
  } catch (e) {
    console.error('Judge error:', e.message);
    // Fallback: simple string comparison
    return playerAnswer.trim().toLowerCase().includes(correctAnswer.toLowerCase());
  }
}

// ── Room helpers ──────────────────────────────────────────────────
function buildJeopardyBoard() {
  const board = {};
  for (const [cat, questions] of Object.entries(CATEGORIES)) {
    board[cat] = POINT_VALUES.map((pts, i) => ({
      points: pts,
      question: questions[i],
      answered: false,
      answeredBy: null,
    }));
  }
  return board;
}

function buildSoloRound(category) {
  const pool = category === 'Mixed'
    ? Object.values(CATEGORIES).flat()
    : CATEGORIES[category] || Object.values(CATEGORIES).flat();
  const shuffled = pool.sort(() => Math.random() - 0.5).slice(0, 10);
  return shuffled;
}

function createRoom(mode, hostId, hostName, category) {
  const roomId = uuidv4().slice(0, 6).toUpperCase();
  const room = {
    id: roomId,
    mode, // 'jeopardy' | 'solo'
    players: {},
    state: 'lobby', // lobby | playing | finished
    currentQuestion: null,
    answerTimer: null,
    buzzTimer: null,
    buzzedPlayer: null,
    board: mode === 'jeopardy' ? buildJeopardyBoard() : null,
    soloQuestions: mode === 'solo' ? buildSoloRound(category) : null,
    soloIndex: 0,
    category: category || 'Mixed',
    host: hostId,
  };
  room.players[hostId] = { id: hostId, name: hostName, score: 0, isHost: true };
  rooms[roomId] = room;
  return room;
}

function getRoomSafe(roomId) {
  return rooms[roomId] || null;
}

function clearRoomTimers(room) {
  if (room.answerTimer) { clearTimeout(room.answerTimer); room.answerTimer = null; }
  if (room.buzzTimer) { clearTimeout(room.buzzTimer); room.buzzTimer = null; }
}

function emitRoomState(room) {
  io.to(room.id).emit('room:state', sanitizeRoom(room));
}

function sanitizeRoom(room) {
  // Don't send answer to clients
  const r = { ...room };
  if (r.currentQuestion) {
    r.currentQuestion = { ...r.currentQuestion };
    delete r.currentQuestion.answer;
  }
  return r;
}

// ── Socket handlers ───────────────────────────────────────────────
io.on('connection', (socket) => {
  console.log('connect', socket.id);

  socket.on('room:create', ({ mode, name, category }) => {
    const room = createRoom(mode, socket.id, name, category);
    socket.join(room.id);
    socket.emit('room:joined', { roomId: room.id, playerId: socket.id });
    emitRoomState(room);
  });

  socket.on('room:join', ({ roomId, name }) => {
    const room = getRoomSafe(roomId.toUpperCase());
    if (!room) return socket.emit('error', { msg: 'Room not found' });
    if (room.state !== 'lobby') return socket.emit('error', { msg: 'Game already in progress' });
    room.players[socket.id] = { id: socket.id, name, score: 0, isHost: false };
    socket.join(room.id);
    socket.emit('room:joined', { roomId: room.id, playerId: socket.id });
    emitRoomState(room);
    io.to(room.id).emit('chat', { system: true, msg: `${name} joined the game!` });
  });

  socket.on('game:start', ({ roomId }) => {
    const room = getRoomSafe(roomId);
    if (!room || room.host !== socket.id) return;
    room.state = 'playing';
    if (room.mode === 'solo') {
      startSoloQuestion(room);
    }
    emitRoomState(room);
  });

  // Jeopardy: host/player picks a clue
  socket.on('jeopardy:pick', ({ roomId, category, pointIndex }) => {
    const room = getRoomSafe(roomId);
    if (!room || room.state !== 'playing' || room.mode !== 'jeopardy') return;
    if (room.currentQuestion) return; // already active
    const cell = room.board[category]?.[pointIndex];
    if (!cell || cell.answered) return;

    room.currentQuestion = {
      category,
      pointIndex,
      points: cell.points,
      text: cell.question.q,
      answer: cell.question.a,
      startedAt: Date.now(),
      phase: 'buzz', // buzz | answering
    };
    room.buzzedPlayer = null;
    emitRoomState(room);

    // 8s to buzz in
    room.buzzTimer = setTimeout(() => {
      if (!room.currentQuestion || room.currentQuestion.phase !== 'buzz') return;
      closeQuestion(room, null, 'No one buzzed in');
    }, 8000);
  });

  // Jeopardy: player buzzes in
  socket.on('jeopardy:buzz', ({ roomId }) => {
    const room = getRoomSafe(roomId);
    if (!room || !room.currentQuestion || room.currentQuestion.phase !== 'buzz') return;
    if (room.buzzedPlayer) return; // already buzzed

    clearTimeout(room.buzzTimer);
    room.buzzedPlayer = socket.id;
    room.currentQuestion.phase = 'answering';
    room.currentQuestion.answerDeadline = Date.now() + 10000;
    emitRoomState(room);
    io.to(room.id).emit('chat', { system: true, msg: `${room.players[socket.id]?.name} buzzed in!` });

    room.answerTimer = setTimeout(() => {
      closeQuestion(room, socket.id, 'Time ran out');
    }, 10000);
  });

  // Jeopardy: player submits answer
  socket.on('answer:submit', async ({ roomId, answer }) => {
    const room = getRoomSafe(roomId);
    if (!room || !room.currentQuestion) return;

    if (room.mode === 'jeopardy') {
      if (room.buzzedPlayer !== socket.id) return;
      clearRoomTimers(room);
      const correct = await judgeAnswer(room.currentQuestion.text, room.currentQuestion.answer, answer);
      const player = room.players[socket.id];
      const pts = room.currentQuestion.points;

      if (correct) {
        player.score += pts;
        io.to(room.id).emit('answer:result', { playerId: socket.id, correct: true, answer, correctAnswer: room.currentQuestion.answer, points: pts });
        closeQuestion(room, null, `${player.name} got it right! +${pts}`);
      } else {
        player.score -= pts;
        io.to(room.id).emit('answer:result', { playerId: socket.id, correct: false, answer, correctAnswer: room.currentQuestion.answer, points: -pts });
        closeQuestion(room, null, `Wrong! ${player.name} loses ${pts}`);
      }
    } else if (room.mode === 'solo') {
      if (room.soloAnswering !== socket.id) return;
      clearRoomTimers(room);
      const q = room.soloQuestions[room.soloIndex];
      const correct = await judgeAnswer(q.q, q.a, answer);
      const player = room.players[socket.id];
      if (correct) player.score += 100;
      room.soloAnswering = null;

      socket.emit('answer:result', { correct, answer, correctAnswer: q.a, points: correct ? 100 : 0 });

      room.soloIndex++;
      if (room.soloIndex >= room.soloQuestions.length) {
        room.state = 'finished';
        emitRoomState(room);
      } else {
        setTimeout(() => startSoloQuestion(room), 2000);
      }
    }
    emitRoomState(room);
  });

  socket.on('disconnect', () => {
    for (const room of Object.values(rooms)) {
      if (room.players[socket.id]) {
        const name = room.players[socket.id].name;
        delete room.players[socket.id];
        io.to(room.id).emit('chat', { system: true, msg: `${name} left.` });
        if (Object.keys(room.players).length === 0) {
          delete rooms[room.id];
        } else {
          emitRoomState(room);
        }
      }
    }
  });
});

function startSoloQuestion(room) {
  const q = room.soloQuestions[room.soloIndex];
  room.currentQuestion = {
    text: q.q,
    answer: q.a,
    index: room.soloIndex,
    total: room.soloQuestions.length,
    phase: 'answering',
    startedAt: Date.now(),
  };
  const playerId = Object.keys(room.players)[0];
  room.soloAnswering = playerId;
  emitRoomState(room);

  room.answerTimer = setTimeout(() => {
    const player = room.players[playerId];
    if (player) {
      io.to(room.id).emit('answer:result', { correct: false, answer: '', correctAnswer: q.a, points: 0, timeout: true });
    }
    room.soloIndex++;
    room.soloAnswering = null;
    if (room.soloIndex >= room.soloQuestions.length) {
      room.state = 'finished';
      emitRoomState(room);
    } else {
      setTimeout(() => startSoloQuestion(room), 2000);
    }
  }, 15000);
}

function closeQuestion(room, _winnerId, msg) {
  clearRoomTimers(room);
  const cell = room.board?.[room.currentQuestion?.category]?.[room.currentQuestion?.pointIndex];
  if (cell) {
    cell.answered = true;
    cell.answeredBy = _winnerId;
  }
  room.currentQuestion = null;
  room.buzzedPlayer = null;
  if (msg) io.to(room.id).emit('chat', { system: true, msg });

  // Check if board complete
  if (room.mode === 'jeopardy') {
    const allDone = Object.values(room.board).every(cat => cat.every(c => c.answered));
    if (allDone) {
      room.state = 'finished';
    }
  }
  emitRoomState(room);
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Trivia Duel running on http://localhost:${PORT}`));