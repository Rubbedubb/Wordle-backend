// server.js
const express = require("express");
const http = require("http");
const cors = require("cors");
const { Server } = require("socket.io");
const fs = require("fs");
const path = require("path");

// Läs in wordList.txt (samma lista som klienten använder)
const WORDLIST_PATH = path.join(__dirname, "wordList.txt");
let wordList = [];
try {
  wordList = fs
    .readFileSync(WORDLIST_PATH, "utf8")
    .split(",")
    .map((w) => w.trim().toLowerCase())
    .filter((w) => w.length === 5);
  console.log(`Loaded ${wordList.length} words from wordList.txt`);
} catch (err) {
  console.error("Kunde inte läsa wordList.txt:", err);
  process.exit(1);
}

const app = express();
app.use(cors());
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

// ----------------- Speldata -----------------
/**
 * Struktur:
 * games = {
 *   PARTYCODE: {
 *     word: "xxxxx",
 *     hostId: "<socketId>",
 *     started: false,
 *     startTime: null,
 *     players: {
 *       "<socketId>": { name, score, finished, totalTime }
 *     }
 *   }
 * }
 */
const games = {};
const POINTS = [5, 3, 2, 1];

function generateWord() {
  return wordList[Math.floor(Math.random() * wordList.length)];
}

function simplifyPlayers(players) {
  return Object.values(players).map((p) => ({ name: p.name, score: p.score }));
}

// ----------------- Socket.IO -----------------
io.on("connection", (socket) => {
  // ---------- JOIN ----------
  socket.on("join", ({ name, party }) => {
    if (!games[party]) {
      games[party] = {
        word: generateWord(),
        hostId: socket.id,
        started: false,
        startTime: null,
        players: {},
      };
    }
    const game = games[party];

    game.players[socket.id] = {
      name,
      score: 0,
      finished: false,
      totalTime: null,
    };

    socket.join(party);

    // Skicka ordet direkt om rundan redan är igång
    if (game.started) {
      socket.emit("start", { word: game.word });
    }

    io.to(party).emit("leaderboard", { players: simplifyPlayers(game.players) });
    io.to(party).emit("message", `${name} gick med i party ${party}`);
  });

  // ---------- START GAME ----------
  socket.on("startGame", ({ party }) => {
    const game = games[party];
    if (!game || socket.id !== game.hostId) return;

    game.word = generateWord();
    game.started = true;
    game.startTime = Date.now();
    for (const p of Object.values(game.players)) {
      p.score = 0; // nollställ rundpoäng
      p.finished = false;
      p.totalTime = null;
    }

    io.to(party).emit("start", { word: game.word });
    io.to(party).emit("leaderboard", {
      players: simplifyPlayers(game.players),
    });
  });

  // ---------- RESTART GAME ----------
  socket.on("restartGame", ({ party }) => {
    const game = games[party];
    if (!game || socket.id !== game.hostId) return;

    game.word = generateWord();
    game.started = true;
    game.startTime = Date.now();
    for (const p of Object.values(game.players)) {
      p.score = 0;
      p.finished = false;
      p.totalTime = null;
    }

    io.to(party).emit("restart", { word: game.word });
    io.to(party).emit("leaderboard", {
      players: simplifyPlayers(game.players),
    });
  });

  // ---------- GUESS ----------
  socket.on("guess", ({ party, guess }) => {
    const game = games[party];
    if (!game || !game.started) return;

    // Exempel: broadcasta gissning till alla i partyt
    io.to(party).emit("feedback", {
      guess,
      from: game.players[socket.id].name,
    });
  });

  // ---------- FINISH ----------
  socket.on("finish", ({ party, tries, finishTime, lost = false }) => {
    const game = games[party];
    if (!game || !game.started) return;

    const player = game.players[socket.id];
    if (!player || player.finished) return;

    player.finished = true;

    if (lost) {
      player.totalTime = Infinity; // hamnar sist
    } else {
      const elapsed = (finishTime - game.startTime) / 1000; // sekunder
      player.totalTime = elapsed + tries * 10; // +10 s per gissning
    }

    const allFinished = Object.values(game.players).every((p) => p.finished);
    if (allFinished) {
      const sorted = Object.values(game.players).sort(
        (a, b) => a.totalTime - b.totalTime,
      );

      sorted.forEach((p, i) => {
        p.score = POINTS[i] || 0;
      });

      io.to(party).emit("leaderboard", {
        players: sorted.map((p) => ({ name: p.name, score: p.score })),
      });

      game.started = false; // möjliggör ny omstart
    }
  });

  // ---------- DISCONNECT ----------
  socket.on("disconnect", () => {
    for (const party in games) {
      const game = games[party];
      if (game.players[socket.id]) {
        const name = game.players[socket.id].name;
        delete game.players[socket.id];

        io.to(party).emit("leaderboard", {
          players: simplifyPlayers(game.players),
        });
        io.to(party).emit("message", `${name} har lämnat spelet`);
      }
    }
  });
});

// ----------------- Start HTTP -----------------
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Servern körs på port ${PORT}`);
});
