// server.js
const express = require("express");
const http = require("http");
const cors = require("cors");
const { Server } = require("socket.io");

const app = express();
app.use(cors());

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*"
  }
});

const games = {}; // { partyCode: { word: "glada", players: {}, hostId: "", started: false } }

function generateWord() {
  const wordList = ["glada", "spela", "orden", "stark", "bilen", "lampa", "kasta"];
  return wordList[Math.floor(Math.random() * wordList.length)].toLowerCase();
}

io.on("connection", (socket) => {
  socket.on("join", ({ name, party }) => {
    if (!games[party]) {
      games[party] = {
        word: generateWord(),
        players: {},
        hostId: socket.id,
        started: false
      };
    }

    games[party].players[socket.id] = name;
    socket.join(party);

    io.to(party).emit("message", `${name} gick med i party ${party}`);
  });

  socket.on("startGame", ({ party }) => {
    const game = games[party];
    if (!game || socket.id !== game.hostId) return;

    game.word = generateWord();
    game.started = true;

    io.to(party).emit("start", { word: game.word });
  });

  socket.on("restartGame", ({ party }) => {
    const game = games[party];
    if (!game || socket.id !== game.hostId) return;

    game.word = generateWord();
    game.started = false;

    io.to(party).emit("restart", { word: game.word });
  });

  socket.on("guess", ({ party, guess }) => {
    const game = games[party];
    if (!game || !game.started) return;

    const feedback = checkGuess(guess, game.word);
    const name = game.players[socket.id] || "Okänd";

    io.to(party).emit("feedback", { guess, feedback, from: name });
  });

  socket.on("disconnect", () => {
    for (const party in games) {
      if (games[party].players[socket.id]) {
        const name = games[party].players[socket.id];
        delete games[party].players[socket.id];
        io.to(party).emit("message", `${name} har lämnat spelet`);
      }
    }
  });
});

function checkGuess(guess, solution) {
  let feedback = Array(5).fill("⬜");
  let used = Array(5).fill(false);

  for (let i = 0; i < 5; i++) {
    if (guess[i] === solution[i]) {
      feedback[i] = "🟩";
      used[i] = true;
    }
  }

  for (let i = 0; i < 5; i++) {
    if (feedback[i] === "🟩") continue;
    for (let j = 0; j < 5; j++) {
      if (!used[j] && guess[i] === solution[j]) {
        feedback[i] = "🟨";
        used[j] = true;
        break;
      }
    }
  }

  return feedback;
}

server.listen(3000, () => {
  console.log("Servern körs på port 3000");
});
