# Trivia Duel

Realtime multiplayer trivia with AI-judged answers. Jeopardy-style duel or solo 10-question rounds.

## Setup

\`\`\`bash
npm install
cp .env.example .env   # add your ANTHROPIC_API_KEY
npm run dev
\`\`\`

Open http://localhost:3000

## How to play

**Jeopardy Duel**  
Create a game, share the 6-letter room code. Players pick categories and point values. Buzz in to answer. Wrong answers lose points.

**Solo Round**  
Pick a category (or Mixed), answer 10 questions in 15 seconds each. AI judges your answers.

## Stack

- Node.js + Express + Socket.io
- Vanilla JS frontend (ES modules)
- Anthropic Claude as answer judge
\`\`\`