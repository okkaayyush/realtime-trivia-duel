# Triviel : Real-time Trivia Duel

A real-time multiplayer trivia application featuring AI-judged answers and classic Jeopardy-style mechanics. 

## Features

* **Real-time Multiplayer:** Synchronized buzzer mechanics and state management.
* **AI Answer Verification:** Integrates Anthropic's Claude to intelligently judge free-text answers, accommodating typos and alternative phrasings.
* **Dual Game Modes:** Support for both competitive multiplayer duels and fast-paced solo rounds.

## Tech Stack

* **Backend:** Node.js, Express, Socket.io
* **Frontend:** Vanilla JavaScript (ES Modules)
* **AI Integration:** Anthropic Claude API

## Game Modes

### Jeopardy Duel (Multiplayer)
* Create a game session and share the generated 6-letter room code.
* Players take turns selecting categories and point values from the board.
* **Buzzer Mechanics:** First player to buzz in gets the chance to answer. 
* **Scoring:** Correct answers award points; incorrect answers deduct the selected point value.

### Solo Round
* Select a specific category or choose a 'Mixed' set.
* Face a rapid-fire sequence of 10 questions.
* Strict 15-second time limit per question.

## Local Development

1. Install the project dependencies:
   ```bash
   npm install
   ```

2. Configure your environment variables by copying the example file:
   ```bash
   cp .env.example .env
   ```

3. Open the `.env` file and add your Anthropic API key:
   ```env
   ANTHROPIC_API_KEY=your_api_key_here
   ```

4. Start the development server:
   ```bash
   npm run dev
   ```

5. Open your browser and navigate to `http://localhost:3000`.
