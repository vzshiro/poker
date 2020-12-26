var express = require('express');
var app = express();
var fs = require("fs");
var http = require('http').createServer(app);
var io = require('socket.io')(http);
const port = process.env.PORT || 3000;

app.use(express.static('public'))
app.use('/css', express.static('css', { maxAge: 31557600 }))
app.use('/js', express.static('js', { maxAge: 31557600 }))
app.use('/webfonts', express.static('webfonts', { maxAge: 31557600 }))

var lobbies = {};
var lobbyCards = {};
var players = {};
var stages = ['Preflop', 'Flop', 'Turn', 'River'];

// Add Legends, Save sequence, tokens to player object
// Add Leave / Join capabilities, Add Pots during All-In
// Add Money Sharing
function validPlayer(player) {
  return player && player.name && players[player.id] && players[player.id].name && players[player.id].name.toUpperCase() == player.name.toUpperCase();
}
function removePlayerFromLobby(socket) {
  let lobby = lobbies[players[socket.id].lobby];
  if (lobby && lobby.players.includes(socket.id)) {
    var index = lobby.players.indexOf(socket.id);
    if (lobby.fold && !lobby.fold.includes(socket.id)) {
      // lobby.fold.push(socket.id);
      lobby.history.push({ name: players[socket.id].name, stage: lobby.stage, action: "auto-fold" });
    }
    if (lobby.host == socket.id) {
      lobby.host = lobby.players[(index+1)%lobby.players.length]
    }
    if (lobby.raised == socket.id) {
      lobby.raised = getPrevActingPlayer(socket.id, lobby);
    }
    if (lobby.actingPlayer == socket.id) {
      moveActingPlayer(socket, lobby);
    }
    lobby.players.splice(index, 1);
    if (lobby.seq && lobby.seq.includes(socket.id)) {
      index = lobby.seq.indexOf(socket.id);
      if (lobby.dealer == socket.id) {
        lobby.dealer = lobby.seq[(index+1)%lobby.seq.length]
      }
      lobby.seq.splice(index, 1);
      lobby.history.push({ name: players[socket.id].name, stage: lobby.stage, action: "auto-all-in", amount: players[socket.id].token });
      lobby.pool += players[socket.id].token;
    }
    if (lobby.players.length == 0) {
      delete lobbies[players[socket.id].lobby];
    } else if (lobby.status == 'Start') {
      io.to(lobby.id).emit('proceed round', getLobbyInfo(lobby.id));
    }
  }
}
function rejoinLobby(socket, oldId) {
  let lobbyId = players[socket.id].lobby;
  if (lobbyId && lobbies[lobbyId] && lobbies[lobbyId].players.includes(oldId)) {
    let index = lobbies[lobbyId].players.indexOf(oldId);
    if (index !== -1) {
      lobbies[lobbyId].players[index] = socket.id;
    } else {
      lobbies[lobbyId].players.push(socket.id)
    }
    if (lobbies[lobbyId].seq) {
      index = lobbies[lobbyId].seq.indexOf(oldId);
      if (index !== -1) {
        lobbies[lobbyId].seq[index] = socket.id;
      }
    }
    if (lobbies[lobbyId].fold) {
      index = lobbies[lobbyId].fold.indexOf(oldId);
      if (index !== -1) {
        lobbies[lobbyId].fold[index] = socket.id;
      }
    }
    if (lobbies[lobbyId].host == oldId || lobbies[lobbyId].players.length == 1) {
      lobbies[lobbyId].host = socket.id;
    }
    if (lobbies[lobbyId].actingPlayer == oldId) {
      lobbies[lobbyId].actingPlayer = socket.id;
    }
    if (lobbies[lobbyId].dealer == oldId) {
      lobbies[lobbyId].dealer = socket.id;
    }
    if (lobbies[lobbyId].raised == oldId) {
      lobbies[lobbyId].raised = socket.id;
    }
    socket.join(lobbyId);
    switch (lobbies[lobbyId].status) {
      case 'New':
        socket.emit("join lobby", getLobbyInfo(lobbyId));
        break;
      case 'Start':
        socket.emit("start game", getLobbyInfo(lobbyId));
        break;
    }
    io.to(lobbyId).emit('lobby info', getLobbyInfo(lobbyId));
    console.log("Rejoined Lobby")
    if (lobbies[lobbyId].stage == 'Showdown' && lobbies[lobbyId].host == socket.id) {
      io.to(socket.id).emit('Showdown');
    }
    saveLobby();
  } else {
    delete players[socket.id].lobby;
    savePlayer();
    socket.emit('player info', players[socket.id]);
    console.log("Lobby not found")
  }
}
function getLobbyInfo(lobbyId) {
  let lobbyInfo = {};
  for(let p of lobbies[lobbyId].players) {
    lobbyInfo[p] = {};
    lobbyInfo[p].id = players[p].id;
    lobbyInfo[p].name = players[p].name;
    lobbyInfo[p].color = players[p].color;
    lobbyInfo[p].icon = players[p].icon;
    lobbyInfo[p].token = players[p].token;
    lobbyInfo[p].currentBet = players[p].currentBet;
    if (lobbies[lobbyId].stage == 'Showdown' && !lobbies[lobbyId].fold.includes(p)) {
      lobbyInfo[p].cards = players[p].cards
    }
  }
  lobbyInfo.lobby = lobbies[lobbyId];
  return lobbyInfo;
}
function startRound(lobbyId) {
  let lobby = lobbies[lobbyId];
  let actingIndex = (lobby.round) % lobby.seq.length
  let smallBlindIndex = (lobby.round + 1) % lobby.seq.length
  let bigBlindIndex = (lobby.round + 2) % lobby.seq.length
  lobby.dealer = lobby.seq[actingIndex];
  lobby.actingPlayer = lobby.seq[smallBlindIndex];
  lobby.fold = [];
  lobby.cards = [];
  lobby.pool = 0;
  lobby.raised = false;
  lobbyCards[lobby.id].cards= Array.from({length: 52}, (x, i) => i);
  // Preflop (When hands are dealt), Flop (First 3 cards), Turn (Next card), River (Last card)
  lobby.stage = stages[0];
  lobby.seq.forEach(p => {
    players[p].currentBet = 0;
    players[p].cards = [];
    lobbyCards[lobby.id][p] = [];
  })
  // Deal all player 2 cards
  dealPlayerCards(lobby);
  dealPlayerCards(lobby);
  lobby.seq.forEach(p => {
    io.to(p).emit('player info', players[p])
  });
  if (players[lobby.seq[smallBlindIndex]].token >= lobby.smallBlind) {
    players[lobby.seq[smallBlindIndex]].token -= lobby.smallBlind;
    players[lobby.seq[smallBlindIndex]].currentBet = lobby.smallBlind;
    lobby.history.push({ name: players[lobby.seq[smallBlindIndex]].name, stage: lobby.stage, action: "Small Blind", amount: lobby.smallBlind })
    lobby.pool += lobby.smallBlind;
  } else {
    lobby.pool += players[lobby.seq[smallBlindIndex]].token;
    players[lobby.seq[smallBlindIndex]].currentBet = players[lobby.seq[smallBlindIndex]].token;
    lobby.history.push({ name: players[lobby.seq[smallBlindIndex]].name, stage: lobby.stage, action: "Small Blind", amount: players[lobby.seq[smallBlindIndex]].token })
    players[lobby.seq[smallBlindIndex]].token = 0;
  }
  if (players[lobby.seq[bigBlindIndex]].token >= lobby.bigBlind) {
    players[lobby.seq[bigBlindIndex]].token -= lobby.bigBlind;
    players[lobby.seq[bigBlindIndex]].currentBet = lobby.bigBlind;
    lobby.history.push({ name: players[lobby.seq[bigBlindIndex]].name, stage: lobby.stage, action: "Big Blind", amount: lobby.bigBlind })
    lobby.pool += lobby.bigBlind;
  } else {
    players[lobby.seq[bigBlindIndex]].currentBet = players[lobby.seq[bigBlindIndex]].token;
    lobby.pool += players[lobby.seq[bigBlindIndex]].token;
    lobby.history.push({ name: players[lobby.seq[bigBlindIndex]].name, stage: lobby.stage, action: "Big Blind", amount: players[lobby.seq[bigBlindIndex]].token })
    players[lobby.seq[bigBlindIndex]].token = 0;
  }
  lobby.highestBet = lobby.bigBlind;
}
function getRandomCardFromLobby(lobby) {
  let randomIndex = Math.floor(Math.random() * lobbyCards[lobby.id].cards.length);
  return lobbyCards[lobby.id].cards.splice(randomIndex, 1);
}
function dealPlayerCards(lobby) {
  lobby.players.forEach(p => {
    let card = getRandomCardFromLobby(lobby);
    lobbyCards[lobby.id][p].push(card);
    players[p].cards.push(card);
  })
}
function proceedRound(socket, action) {
  let lobby = lobbies[players[socket.id].lobby];
  switch (action.name) {
    case 'fold':
      console.log("Fold");
      lobby.history.push({ name: players[socket.id].name, stage: lobby.stage, action: "fold" });
      lobby.fold.push(socket.id);
      break;
    case 'follow':
      console.log("Follow");
      var diff = lobby.highestBet - players[socket.id].currentBet;
      players[socket.id].token -= diff;
      lobby.history.push({ name: players[socket.id].name, stage: lobby.stage, action: "follow", amount: diff });
      players[socket.id].currentBet = lobby.highestBet;
      lobby.pool += diff;
      break;
    case 'check':
      console.log("Check");
      lobby.history.push({ name: players[socket.id].name, stage: lobby.stage, action: "check" })
      break;
    case 'follow-raise':
      console.log("Follow Raise");
      lobby.history.push({ name: players[socket.id].name, stage: lobby.stage, action: "follow-raise", amount: action.amount });
      var diff = lobby.highestBet - players[socket.id].currentBet;
      players[socket.id].token -= diff;
      players[socket.id].currentBet = lobby.highestBet;
      lobby.pool += diff;
      players[socket.id].token -= action.amount;
      players[socket.id].currentBet += action.amount;
      lobby.highestBet += action.amount;
      lobby.pool += action.amount;
      lobby.raised = socket.id;
      break;
    case 'raise':
      console.log("Raise");
      lobby.history.push({ name: players[socket.id].name, stage: lobby.stage, action: "raise", amount: action.amount });
      players[socket.id].token -= action.amount;
      players[socket.id].currentBet += action.amount;
      lobby.highestBet += action.amount;
      lobby.pool += action.amount;
      lobby.raised = socket.id;
      break;
    case 'all-in':
      console.log("All In");
      let tokenAmount = players[socket.id].token;
      lobby.history.push({ name: players[socket.id].name, stage: lobby.stage, action: "all-in", amount: tokenAmount });
      players[socket.id].token = 0;
      if ((tokenAmount+players[socket.id].currentBet) > lobby.highestBet) {
        lobby.highestBet = tokenAmount+players[socket.id].currentBet;
        lobby.raised = socket.id;
      }
      players[socket.id].currentBet = lobby.highestBet;
      lobby.pool += tokenAmount;
      break;
  }
  moveActingPlayer(socket, lobby);
  saveLobby();
  savePlayer();
}
function moveActingPlayer(socket, lobby) {
  if (lobby.seq.length-1 == lobby.fold.length) {
    endRound(lobby, lobby.seq.filter(x => !lobby.fold.includes(x)));
  } else {
    getNextActingPlayer(lobby.actingPlayer, lobby)
    if (lobby.raised && lobby.actingPlayer == lobby.raised) {
      // Has raise and next acting player is the person who raised
      nextStage(lobby);
    } else if (!lobby.raised && ((socket.id == lobby.dealer) || (lobby.fold.includes(lobby.dealer) && socket.id == getPrevActingPlayer(lobby.dealer, lobby)))) {
      // If no raise and current player is dealer OR
      // If no raise and dealer folds (Current player is right before dealer)
      nextStage(lobby);
    } else {
      io.to(lobby.id).emit('proceed round', getLobbyInfo(lobby.id));
    }
  }
}
function getPrevActingPlayer(fromPlayerId, lobby) {
  let index = 1, prevPlayer = "";
  while(prevPlayer == "") {
    prevPlayer = lobby.seq[(lobby.seq.indexOf(fromPlayerId) + lobby.seq.length - index)][0];
    if (lobby.fold.includes(prevPlayer)) {
      index++;
      prevPlayer = "";
    } else {
      return prevPlayer;
    }
  }
}
function getNextActingPlayer(fromPlayerId, lobby) {
  let index = 1, actingIndex = -1;
  while(actingIndex == -1) {
    actingIndex = (lobby.seq.indexOf(fromPlayerId) + index) % lobby.seq.length;
    if (lobby.fold.includes(lobby.seq[actingIndex])) {
      index++;
      actingIndex = -1;
    } else {
      lobby.actingPlayer = lobby.seq[actingIndex];
    }
  }
}
function nextStage(lobby) {
  let stageIndex = stages.indexOf(lobby.stage) + 1
  if (stageIndex == stages.length) {
    lobby.stage = 'Showdown';
    askWinner(lobby);
  } else {
    lobby.stage = stages[stageIndex];
    lobby.raised = false;
    lobby.highestBet = 0;
    lobby.players.forEach(p => {
      players[p].currentBet = 0;
    })
    getNextActingPlayer(lobby.dealer, lobby)
    // Draw and burn cards
    switch (lobby.stage) {
      case 'Flop':
        lobby.cards.push(getRandomCardFromLobby(lobby));
        getRandomCardFromLobby(lobby);
        lobby.cards.push(getRandomCardFromLobby(lobby));
        getRandomCardFromLobby(lobby);
        lobby.cards.push(getRandomCardFromLobby(lobby));
        getRandomCardFromLobby(lobby);
        break;
      case 'Turn':
        lobby.cards.push(getRandomCardFromLobby(lobby));
        getRandomCardFromLobby(lobby);
        break;
      case 'River':
        lobby.cards.push(getRandomCardFromLobby(lobby));
        getRandomCardFromLobby(lobby);
        break;
    }
    io.to(lobby.id).emit('proceed round', getLobbyInfo(lobby.id));
  }
}
function askWinner(lobby) {
  io.to(lobby.id).emit('proceed round', getLobbyInfo(lobby.id));
  io.to(lobby.host).emit('Showdown');
}
function endRound(lobby, winners) {
  winners.forEach(winner => {
    players[winner].token += Math.floor(lobby.pool/winners.length);
    lobby.history.push({ name: players[winner].name, action: 'win', stage: 'Showdown', amount: Math.floor(lobby.pool/winners.length) })
  })
  lobby.pool = 0;
  lobby.round += 1;
  startRound(lobby.id);
  io.to(lobby.id).emit('proceed round', getLobbyInfo(lobby.id));
}
io.on('connection', (socket) => {
  console.log('A user connected');
  socket.on('old player', (player, callback) => {
    if (validPlayer(player)) {
      let oldId = players[player.id].id;
      players[socket.id] = players[oldId];
      delete players[oldId];
      players[socket.id].id = socket.id;
      savePlayer();
      socket.emit('player info', players[socket.id]);
      if (players[socket.id].color && players[socket.id].icon) {
        if (players[socket.id].lobby) {
          rejoinLobby(socket, oldId);
        } else {
          socket.emit('lobbies', lobbies);
        }
      }
      callback(true);
    } else {
      callback(false);
    }
  });
  socket.on('name', (name, callback) => {
    if (!players[socket.id]) {
      players[socket.id] = { id: socket.id }
    }
    players[socket.id].name = name;
    savePlayer();
    callback(true);
  });
  socket.on('player info', player => {
    savePlayer(socket, player);
    socket.emit('lobbies', lobbies);
  });
  socket.on('get lobbies', () => {
    socket.emit('lobbies', lobbies);
  })
  socket.on('create lobby', (lobby, callback) => {
    if (!lobbies[socket.id]) {
      lobby.id = lobby.name + '_' + socket.id;
      lobby.players = [socket.id];
      lobby.host = socket.id;
      lobby.status = 'New';
      saveLobby(lobby);
      players[socket.id].lobby = lobby.id;
      savePlayer();
      socket.join(lobby.id);
      socket.broadcast.emit('lobbies', lobbies)
      callback(lobby);
    }
  })
  socket.on('join lobby', (lobbyId, callback) => {
    if (lobbies[lobbyId] && lobbies[lobbyId].status != 'Start') {
      if (!lobbies[lobbyId].players.includes(socket.id)) {
        io.to(lobbyId).emit('player join', players[socket.id]);
        lobbies[lobbyId].players.push(socket.id);
        socket.join(lobbyId);
        players[socket.id].lobby = lobbyId;
        saveLobby();
        savePlayer();
      }
      callback(getLobbyInfo(lobbyId));
    }
  })
  socket.on('quit lobby', () => {
    let player = players[socket.id];
    if (player && player.lobby) {
      let lobby = lobbies[player.lobby];
      if (lobby && lobby.players.includes(socket.id)) {
        removePlayerFromLobby(socket);
        io.emit('lobbies', lobbies);
        saveLobby();
        savePlayer();
      }
    }
  })
  socket.on('start game', lobby => {
    if (lobbies[lobby.id] && lobbies[lobby.id].host == socket.id) {
      console.log("Start Game", lobby)
      lobbies[lobby.id].seq = lobby.seq;
      lobbies[lobby.id].round = 0;
      lobbies[lobby.id].history = [];
      lobbies[lobby.id].status = 'Start';
      lobbies[lobby.id].seq.forEach(p => {
        players[p].token = lobbies[lobby.id].token;
      });
      lobbyCards[lobby.id] = {};
      startRound(lobby.id);
      saveLobby();
      savePlayer();
      io.to(lobby.id).emit('start game', getLobbyInfo(lobby.id));
    }
  })
  socket.on('proceed round', action => {
    if (lobbies[players[socket.id].lobby]) {
      proceedRound(socket, action);
      saveLobby();
      savePlayer();
    }
  })
  socket.on('winners', playerIds => {
    let lobby = lobbies[players[socket.id].lobby]
    endRound(lobby, playerIds);
  })
  socket.on('logout', () => {
    removePlayerFromLobby(socket);
    delete players[socket.id];
    savePlayer();
    saveLobby();
    io.emit('lobbies', lobbies);
  });
  socket.on('disconnect', () => {
    console.log(socket.id + " Disconnected")
  });
});

function savePlayer(socket, player) {
  if (socket && player) {
    players[socket.id] = player;
  }
  console.log("Save Players", players);
  if (!fs.existsSync('data')) {
    fs.mkdirSync('data');
  }
  fs.writeFileSync('data/players.json',JSON.stringify(players), (err) => {
    if(err) console.log(err)
  });
}

function saveLobby(lobby) {
  if (lobby) {
    lobbies[lobby.id] = lobby;
  }
  console.log("Save Lobbies", lobbies);
  // Take only last 500 history
  for (const [key, value] of Object.entries(lobbies)) {
    if (value.history) {
      value.history = value.history.slice(-500);
    }
  }
  if (!fs.existsSync('data')) {
    fs.mkdirSync('data');
  }
  fs.writeFileSync('data/lobbies.json',JSON.stringify(lobbies), (err) => {
    if(err) console.log(err)
  });
  fs.writeFileSync('data/lobby_cards.json',JSON.stringify(lobbyCards), (err) => {
    if(err) console.log(err)
  });
}

function reloadData() {
  if (fs.existsSync('data/lobbies.json')) {
    try {
      let item = fs.readFileSync('data/lobbies.json');
      if (item.length) {
        lobbies = JSON.parse(item)
      }
    } catch (err) {
      console.log("Error reading lobbies file", err)
    }
  }
  if (fs.existsSync('data/lobby_cards.json')) {
    try {
      let item = fs.readFileSync('data/lobby_cards.json');
      if (item.length) {
        lobbyCards = JSON.parse(item)
      }
    } catch (err) {
      console.log("Error reading lobby cards file", err)
    }
  }
  if (fs.existsSync('data/players.json')) {
    try {
      let item = fs.readFileSync('data/players.json');
      if (item.length) {
        players = JSON.parse(item)
      }
    } catch (err) {
      console.log("Error reading players file", err)
    }
  }
}

app.get('/', (req, res) => {
  res.sendFile(__dirname + '/index.html');
});

http.listen(port, () => {
  console.log(`listening on http://localhost:${port}`);
});

reloadData();