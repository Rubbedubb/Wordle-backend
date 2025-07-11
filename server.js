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

const games = {}; // { partyCode: { word: "glada", players: {} } }

io.on("connection", (socket) => {
  socket.on("join", ({ name, party }) => {
    if (!games[party]) {
      games[party] = {
        word: "glada", // Testord
        players: {}
      };
    }

    games[party].players[socket.id] = name;
    socket.join(party);

    io.to(party).emit("message", `${name} gick med i party ${party}`);
  });

  socket.on("guess", ({ party, guess }) => {
    const game = games[party];
    if (!game) return;

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
