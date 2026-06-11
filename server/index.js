require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const { GoogleGenerativeAI } = require('@google/generative-ai');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

app.use(express.static(path.join(__dirname, '../client')));
app.use(express.json());

const rooms = {};

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

async function judgeAnswer(question, correctAnswer, playerAnswer) {
  if (!playerAnswer || !playerAnswer.trim()) return false;
  const fallback = playerAnswer.trim().toLowerCase().includes(correctAnswer.trim().toLowerCase());
  try {
    const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });
    const result = await Promise.race([
      model.generateContent(
        `You are a trivia judge. Is the player's answer correct?\nQuestion: ${question}\nCorrect: ${correctAnswer}\nPlayer: ${playerAnswer}\nReply with ONLY the word CORRECT or INCORRECT.`
      ),
      new Promise((_, r) => setTimeout(() => r(new Error('timeout')), 5000))
    ]);
    const text = result.response.text().trim().toUpperCase();
    console.log('Judge verdict:', text);
    return text.startsWith('CORRECT');
  } catch (e) {
    console.error('Judge fallback:', e.message);
    return fallback;
  }
}

function buildJeopardyBoard() {
  const board = {};
  for (const [cat, questions] of Object.entries(CATEGORIES)) {
    board[cat] = POINT_VALUES.map((pts, i) => ({
      points: pts,
      question: questions[i],
      answered: false,
    }));
  }
  return board;
}

function buildSoloRound(category) {
  const pool = category === 'Mixed'
    ? Object.values(CATEGORIES).flat()
    : (CATEGORIES[category] || Object.values(CATEGORIES).flat());
  return [...pool].sort(() => Math.random() - 0.5).slice(0, 10);
}

io.on('connection', (socket) => {
  console.log('connected:', socket.id);

  socket.on('room:create', ({ mode, name, category }) => {
    const roomId = uuidv4().slice(0, 6).toUpperCase();
    const room = {
      id: roomId,
      mode,
      category: category || 'Mixed',
      host: socket.id,
      players: {
        [socket.id]: { id: socket.id, name, score: 0, isHost: true }
      },
      state: 'lobby',
      // solo
      soloQuestions: mode === 'solo' ? buildSoloRound(category) : null,
      soloIndex: 0,
      soloAnswering: null,
      // jeopardy
      board: mode === 'jeopardy' ? buildJeopardyBoard() : null,
      currentQuestion: null,
      buzzedPlayer: null,
      // timers (not sent to client)
      _answerTimer: null,
      _buzzTimer: null,
    };
    rooms[roomId] = room;
    socket.join(roomId);
    socket.emit('room:joined', { roomId, playerId: socket.id });
    socket.emit('room:state', publicRoom(room));
  });

  socket.on('room:join', ({ roomId, name }) => {
    const room = rooms[roomId.toUpperCase()];
    if (!room) return socket.emit('error', { msg: 'Room not found' });
    if (room.state !== 'lobby') return socket.emit('error', { msg: 'Game already started' });
    room.players[socket.id] = { id: socket.id, name, score: 0, isHost: false };
    socket.join(room.id);
    socket.emit('room:joined', { roomId: room.id, playerId: socket.id });
    broadcast(room, 'room:state', publicRoom(room));
    broadcast(room, 'chat', { system: true, msg: `${name} joined!` });
  });

  socket.on('game:start', ({ roomId }) => {
    const room = rooms[roomId];
    if (!room || room.host !== socket.id) return;
    room.state = 'playing';
    broadcast(room, 'room:state', publicRoom(room));
    if (room.mode === 'solo') sendNextSoloQuestion(room);
  });

  socket.on('jeopardy:pick', ({ roomId, category, pointIndex }) => {
    const room = rooms[roomId];
    if (!room || room.state !== 'playing' || room.currentQuestion) return;
    const cell = room.board?.[category]?.[pointIndex];
    if (!cell || cell.answered) return;

    room.currentQuestion = { category, pointIndex, points: cell.points, text: cell.question.q, answer: cell.question.a, phase: 'buzz' };
    room.buzzedPlayer = null;
    broadcast(room, 'question:new', { category, points: cell.points, text: cell.question.q, phase: 'buzz' });
    broadcast(room, 'room:state', publicRoom(room));

    room._buzzTimer = setTimeout(() => {
      if (!room.currentQuestion) return;
      broadcast(room, 'chat', { system: true, msg: 'No one buzzed in.' });
      closeJeopardyQuestion(room);
    }, 8000);
  });

  socket.on('jeopardy:buzz', ({ roomId }) => {
    const room = rooms[roomId];
    if (!room || !room.currentQuestion || room.currentQuestion.phase !== 'buzz' || room.buzzedPlayer) return;
    clearTimeout(room._buzzTimer);
    room.buzzedPlayer = socket.id;
    room.currentQuestion.phase = 'answering';
    broadcast(room, 'chat', { system: true, msg: `${room.players[socket.id]?.name} buzzed in!` });
    broadcast(room, 'room:state', publicRoom(room));

    room._answerTimer = setTimeout(() => {
      if (!room.currentQuestion) return;
      const player = room.players[socket.id];
      if (player) player.score -= room.currentQuestion.points;
      broadcast(room, 'answer:result', { playerId: socket.id, correct: false, answer: '', correctAnswer: room.currentQuestion.answer, points: -room.currentQuestion.points, timeout: true });
      broadcast(room, 'chat', { system: true, msg: `Time ran out! ${player?.name} loses ${room.currentQuestion.points}` });
      closeJeopardyQuestion(room);
    }, 10000);
  });

  socket.on('answer:submit', async ({ roomId, answer }) => {
    const room = rooms[roomId];
    if (!room) return;

    if (room.mode === 'jeopardy') {
      if (!room.currentQuestion || room.buzzedPlayer !== socket.id) return;
      clearTimeout(room._answerTimer);
      clearTimeout(room._buzzTimer);
      const { text, answer: correct_a, points } = room.currentQuestion;
      const player = room.players[socket.id];
      const correct = await judgeAnswer(text, correct_a, answer);
      if (correct) player.score += points;
      else player.score -= points;
      broadcast(room, 'answer:result', { playerId: socket.id, correct, answer, correctAnswer: correct_a, points: correct ? points : -points });
      broadcast(room, 'chat', { system: true, msg: correct ? `${player.name} got it! +${points}` : `Wrong! ${player.name} loses ${points}` });
      closeJeopardyQuestion(room);

    } else if (room.mode === 'solo') {
      if (room.soloAnswering !== socket.id) return;
      clearTimeout(room._answerTimer);
      room.soloAnswering = null;

      const q = room.soloQuestions[room.soloIndex];
      const correct = await judgeAnswer(q.q, q.a, answer);
      const player = room.players[socket.id];
      if (correct) player.score += 100;

      console.log(`Solo answer: "${answer}" → ${correct ? 'CORRECT' : 'WRONG'}`);

      // Send result first
      socket.emit('answer:result', { correct, answer, correctAnswer: q.a, points: correct ? 100 : 0 });

      // Advance
      room.soloIndex++;
      if (room.soloIndex >= room.soloQuestions.length) {
        room.state = 'finished';
        broadcast(room, 'game:finished', { players: room.players });
      } else {
        // Wait 2s then send next question
        setTimeout(() => sendNextSoloQuestion(room), 2000);
      }
    }
  });

  socket.on('disconnect', () => {
    for (const room of Object.values(rooms)) {
      if (!room.players[socket.id]) continue;
      const name = room.players[socket.id].name;
      delete room.players[socket.id];
      if (Object.keys(room.players).length === 0) {
        delete rooms[room.id];
      } else {
        broadcast(room, 'chat', { system: true, msg: `${name} left.` });
        broadcast(room, 'room:state', publicRoom(room));
      }
    }
  });
});

function sendNextSoloQuestion(room) {
  const q = room.soloQuestions[room.soloIndex];
  if (!q) return;
  const playerId = Object.keys(room.players)[0];
  room.soloAnswering = playerId;
  room.currentQuestion = { text: q.q, answer: q.a, index: room.soloIndex, total: room.soloQuestions.length };

  // Send the question directly as its own event
  io.to(room.id).emit('solo:question', {
    text: q.q,
    index: room.soloIndex,
    total: room.soloQuestions.length,
    category: room.category,
    scores: room.players,
  });

  room._answerTimer = setTimeout(() => {
    if (room.soloAnswering !== playerId) return;
    room.soloAnswering = null;
    io.to(room.id).emit('answer:result', { correct: false, answer: '', correctAnswer: q.a, points: 0, timeout: true });
    room.soloIndex++;
    if (room.soloIndex >= room.soloQuestions.length) {
      room.state = 'finished';
      io.to(room.id).emit('game:finished', { players: room.players });
    } else {
      setTimeout(() => sendNextSoloQuestion(room), 2000);
    }
  }, 15000);
}

function closeJeopardyQuestion(room) {
  const cell = room.board?.[room.currentQuestion?.category]?.[room.currentQuestion?.pointIndex];
  if (cell) cell.answered = true;
  room.currentQuestion = null;
  room.buzzedPlayer = null;
  clearTimeout(room._answerTimer);
  clearTimeout(room._buzzTimer);

  const allDone = room.board && Object.values(room.board).every(cat => cat.every(c => c.answered));
  if (allDone) {
    room.state = 'finished';
    broadcast(room, 'game:finished', { players: room.players });
  } else {
    broadcast(room, 'room:state', publicRoom(room));
  }
}

function publicRoom(room) {
  return {
    id: room.id,
    mode: room.mode,
    category: room.category,
    host: room.host,
    players: room.players,
    state: room.state,
    board: room.board,
    currentQuestion: room.currentQuestion ? { ...room.currentQuestion, answer: undefined } : null,
    buzzedPlayer: room.buzzedPlayer,
  };
}

function broadcast(room, event, data) {
  io.to(room.id).emit(event, data);
}

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => console.log(`Trivia Duel on http://localhost:${PORT}`));