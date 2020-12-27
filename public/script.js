var socket;
var player;
var lobbiesElement;
var lobbyPlayers = {};
var hideCards = false;
var notify = true;
const cardText = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];
const cardSuit = ["S", "H", "C", "D"];

function init() {
  lobbiesElement = document.getElementById("lobbies");
  try {
    player = getPlayer();
  } catch (err) {
    console.log(err)
    localStorage.removeItem("player");
  }
  socket.on('player info', function (playerInfo) {
    player = playerInfo;
    savePlayer();
  })
  socket.on('lobby info', function (lobbyInfo) {
    lobbyPlayers = lobbyInfo;
  })
  socket.on('proceed round', function (lobbyInfo) {
    lobbyPlayers = lobbyInfo;
    generateGame();
  })
  socket.on('join lobby', function (lobbyInfo) {
    lobbyPlayers = lobbyInfo
    generateLobby();
  })
  socket.on('lobbies', function (lobbies) {
    console.log("Lobbies", lobbies)
    showLobbies(lobbies);
  })
  socket.on('start game', function (lobbyInfo) {
    lobbyPlayers = lobbyInfo;
    generateGame();
  })
  socket.on('Showdown', () => {
    // selectWinner();
  })
  socket.on('player join', function (playerInfo) {
    console.log("New player", playerInfo);
    lobbyPlayers[playerInfo.id] = playerInfo;
    lobbyPlayers.lobby.players.push(playerInfo.id);
    generateLobby();
  })
  socket.on('connect', function () {
    console.log("Connected")
    if (player && player.id) {
      reconnectOldPlayer();
    } else {
      connectNewPlayer();
    }
  })
}
function showLobbies(lobbies) {
  if (!player.lobby && player.icon && player.color) {
    lobbiesElement.innerHTML =
    `<div class="col-md-12">
      <button onclick="createLobby('public')" class="btn btn-primary">Create Public Lobby</button>
    </div>`;
    for (const [key, value] of Object.entries(lobbies)) {
      if (value.status != 'Start') {
        lobbiesElement.innerHTML += `<div class="col-md-4 col-sm-6">${lobbyInfoHTML(value)}</div>`;
      }
    }
  }
}
function lobbyInfoHTML(lobby) {
  let html =
  `<div class="lobby">
    <div>${lobby.name} (Players: ${lobby.players.length})</div>
    <div>
      <p>Starting Token <span class="fa fa-money-bill"></span>: ${lobby.token}</p>
      <p>Big Blind <span class="fa fa-dollar-sign"></span>: ${lobby.bigBlind}</p>
      <p>Small Blind <span class="fa fa-hand-holding-usd"></span>: ${lobby.smallBlind}</p>
      <p>Status: ${lobby.status}</p>
    </div>
    <button class="btn btn-primary" onclick="joinLobby('${lobby.id}')">Join Lobby</button>
  </div>`
  return html;
}
function joinLobby(lobbyId) {
  lobbiesElement.innerHTML = "";
  socket.emit("join lobby", lobbyId, function(lobbyInfo) {
    player.lobby = lobbyInfo.lobby.id;
    lobbyPlayers = lobbyInfo;
    savePlayer();
    generateLobby();
  });
}
function promptForString(msg, defValue = "") {
  let stringInput = "";
  while(!stringInput || stringInput.trim() == "") {
    stringInput = prompt(msg, defValue);
    if (stringInput == null) {
      return null;
    }
  }
  return stringInput.trim();
}
function promptForInteger(msg, defValue = "0") {
  let stringInput = "";
  while(!stringInput || stringInput.trim() == "") {
    stringInput = prompt(msg, defValue);
    if (stringInput == null) {
      return null;
    }
    try {
      let intInput = parseInt(stringInput);
      if (intInput > 0) {
        return intInput;
      } else {
        stringInput = "";
      }
    } catch (err) {
      stringInput = "";
    }
  }
}
function createLobby(lobbyType) {
  let lobby = {
    name: "",
    token: 0,
    smallBlind: 0,
    bigBlind: 0
  }
  let lobbyName = promptForString("Enter a lobby name", player.name + " Lobby"),
  startingToken = promptForInteger("Enter starting token", 5000),
  smallBlind = promptForInteger("Enter small blind", 25),
  bigBlind = promptForInteger("Enter big blind", 50)
  if (lobbyName && startingToken && smallBlind && bigBlind) {
    while(bigBlind <= smallBlind) {
      promptForInteger(`Enter big blind (higher than ${smallBlind})`)
      if (bigBlind == null) {
        return;
      }
    }
    lobby.name = lobbyName;
    lobby.token = startingToken;
    lobby.smallBlind = smallBlind;
    lobby.bigBlind = bigBlind;
    socket.emit("create lobby", lobby, function(lobbyInfo) {
      player.lobby = lobbyInfo.id;
      lobbyPlayers.lobby = lobbyInfo
      lobbyPlayers[player.id] = player;
      savePlayer();
      generateLobby();
    });
    lobbiesElement.innerHTML = "";
  }
}
function generateGame() {
  console.log("Generate Game", lobbyPlayers)
  // <h2>Lobby: ${lobbyPlayers.lobby.name}</h2>
  lobbiesElement.innerHTML = `
  <div class="col-md-12">
    <div class="lobby-user-details">
      ${lobbyPlayers.lobby.seq.reduce((prev, cur) => prev +
        `<p class="${lobbyPlayers.lobby.fold.includes(cur) ? "fold" : ""}">
          <span class="player-seq">${lobbyPlayers.lobby.actingPlayer == cur ? `<span class="fa fa-chevron-right"></span><span class="fa fa-chevron-right"></span><span class="fa fa-chevron-right"></span>` : ""}</span>
          ${cur == lobbyPlayers.lobby.dealer ? '<span class="fa fa-hand-sparkles"></span>' : ""}
          ${lobbyPlayers[cur].name}
          ${generateUserIcon(cur)}
          <span class="fa fa-money-bill"></span>
          ${lobbyPlayers[cur].token}
          ${lobbyPlayers.lobby.fold.includes(cur) ? `<span class="fa fa-dizzy"></span>` : ""}
        </p>`, "")}
    </div>
  </div>
  <div class="col-md-12">
    <h3 class="${lobbyPlayers.lobby.stage}">Stage: ${lobbyPlayers.lobby.stage}</h3>
    ${generateStageInfo(lobbyPlayers.lobby.stage)}
  </div>
  <div class="col-md-12">
    <h3>Pool: <span class="money-green"><span class="fa fa-money-bill"></span> ${lobbyPlayers.lobby.pool} ${lobbyPlayers.lobby.highestBet != 0 ? `(Bet: ${lobbyPlayers.lobby.highestBet})` : ""}</span></h3>
  </div>
  ${lobbyPlayers.lobby.stage != 'Showdown' && lobbyPlayers.lobby.actingPlayer == player.id ?
    `<div class="col-md-12">${generateActions()}<div>`: ""
  }`
  lobbiesElement.innerHTML += generateCards();
  lobbiesElement.innerHTML += `<div class="col-md-12 history">${generateHistory()}</div>`
  lobbiesElement.innerHTML += `<div class="col-md-12 history"><button onclick="showHistory()" class="btn btn-secondary">Full History</button></div>`;
  if (notify && lobbyPlayers.lobby.stage != 'Showdown' && lobbyPlayers.lobby.actingPlayer == player.id) {
    document.getElementById("notification-audio").play();
    window.navigator.vibrate(300);
  }
}
function generatePoker(card) {
  return `<div class="poker-cards">
  ${cardText[card%13]}
  <span class="poker ${cardSuit[Math.floor(card/13)]}"></span>
</div>`;
}
function generateCards() {
  console.log(player)
  let html = "";
  if (lobbyPlayers.lobby.cards && lobbyPlayers.lobby.cards.length > 0) {
    html += `<div class="col-md-12"><h3>Table Cards</h3>`;
    html += '<div class="table-cards">'
    lobbyPlayers.lobby.cards.forEach(card => {
      html += generatePoker(card)
    })
    html += "</div></div>"
  }
  if (lobbyPlayers.lobby.stage == 'Showdown') {
    lobbyPlayers.lobby.players.forEach(p => {
      if (lobbyPlayers[p].cards) {
        html += `<div class="col-md-12"><h3>${lobbyPlayers[p].name} ${generateUserIcon(p)} Cards</h3></div>`;
        html += '<div class="col-md-12">'
        lobbyPlayers[p].cards.forEach(card => {
          html += generatePoker(card)
        })
        html += "</div>"
      }
    })
  } else {
    if (player.cards) {
      html += `<div class="col-md-12"><h3>Your Cards <span onclick="togglePlayerCard(this)" class="fa fa-eye${hideCards ? "-slash" : ""} pointer"></span></h3></div>`;
      html += `<div id="player-cards" class="col-md-12 ${hideCards ? "hidden" : ""}">`
      player.cards.forEach(card => {
        html += generatePoker(card)
      })
      html += "</div>"
    }
  }
  return html;
}
function togglePlayerCard(e) {
  let playerCards = document.getElementById("player-cards")
  hideCards = !hideCards;
  if (hideCards) {
    playerCards.classList.add("hidden");
    e.classList.add("fa-eye-slash")
    e.classList.remove("fa-eye")
  } else {
    playerCards.classList.remove("hidden");
    e.classList.remove("fa-eye-slash")
    e.classList.add("fa-eye")
  }
}
function generateHistory() {
  let history = lobbyPlayers.lobby.history.slice(-5).reverse();
  return history.reduce((prev, cur) => prev + `<p><b>${cur.stage}</b>: ${cur.name} - ${cur.action == 'Big Blind' ? `<span class="fa fa-dollar-sign"></span> ` : cur.action == 'Small Blind' ? `<span class="fa fa-hand-holding-usd"></span> `: ""}${cur.action}${cur.amount ? ` <span class="fa fa-money-bill"></span> ${cur.amount}`: ""}</p>`, "");
}
function generateStageInfo(stage) {
  let html = "";
  switch (stage) {
    case 'Preflop':
      html = `<div><h3>Deal each player 2 cards (Starting from Dealer)</h3></div>`
      break;
    case 'Flop':
      html = `<div><h3>Deal 3 cards on table</h3></div>`
      break;
    case 'Turn':
      html = `<div><h3>Deal the 4th card on table</h3></div>`
      break;
    case 'River':
      html = `<div><h3>Deal the 5th (last) card on table</h3></div>`
      break;
    case 'Showdown':
      if (lobbyPlayers.lobby.host == player.id) {
        html = `<div><button class="btn btn-primary" onclick="selectWinner()">Select Winner</button></div>`
      } else {
        html = `<div><h3>Host is deciding who won!</h3></div>`
      }
      break;
  }
  return html;
}
function showHistory() {
  let html = ` 
    <table class="table table-striped table-bordered">
      <tr><th>Name</th><th>Action</th><th>Amount</th><th>Stage</th><th>Seq</th></tr>
      ${lobbyPlayers.lobby.history.reduce((prev, cur, index) => prev + `<tr><td>${cur.name}</td><td>${cur.action}</td><td>${cur.amount ? cur.amount : ""}</td><td>${cur.stage}</td><td>${index+1}</td></tr>`, "")}
    </table>
  `
  $("#history-modal .modal-body").html(html)
  $("#history-modal").modal("show");
}
function generateActions() {
  if (lobbyPlayers.lobby.stage == 'Showdown') {
    return;
  }
  let html = '<div class="actions">';
  if (lobbyPlayers.lobby.highestBet > lobbyPlayers[player.id].currentBet) {
    if ((lobbyPlayers.lobby.highestBet-lobbyPlayers[player.id].currentBet) >= lobbyPlayers[player.id].token) {
      html += `<button onclick="performAction('all-in')" class="btn btn-primary">Follow <span class="fa fa-money-bill"></span> ${lobbyPlayers[player.id].token} & All In</button>`
    } else {
      html += `<button onclick="performAction('follow')" class="btn btn-primary">Follow <span class="fa fa-money-bill"></span> ${lobbyPlayers.lobby.highestBet - lobbyPlayers[player.id].currentBet}</button>`
    }
  }
  if ((lobbyPlayers.lobby.highestBet * 2 - lobbyPlayers[player.id].currentBet) <= lobbyPlayers[player.id].token) {
    if (lobbyPlayers.lobby.highestBet == lobbyPlayers[player.id].currentBet) {
      html += `<button onclick="performAction('raise')" class="btn btn-primary ${lobbyPlayers[player.id].token > lobbyPlayers.lobby.bigBlind ? "" : "disabled"}">Raise</button>`
    } else {
      html += `<button onclick="performAction('follow-raise')" class="btn btn-primary">Follow <span class="fa fa-money-bill"></span> ${lobbyPlayers.lobby.highestBet - lobbyPlayers[player.id].currentBet} & Raise</button>`
    }
  }
  if (lobbyPlayers.lobby.highestBet == lobbyPlayers[player.id].currentBet) {
    html += `<button onclick="performAction('check')" class="btn btn-success">Check</button>`
  }
  if (lobbyPlayers[player.id].token > 0 && lobbyPlayers[player.id].token < Math.max(lobbyPlayers.lobby.pool, lobbyPlayers[player.id].token - (lobbyPlayers.lobby.highestBet - lobbyPlayers[player.id].currentBet))) {
    html += `<button onclick="performAction('all-in')" class="btn btn-primary">All In</button>`
  }
  html += `<button onclick="performAction('fold')" class="btn btn-danger">Fold</button>`
  return html + '</div>';
}
function performAction(e) {
  let confirmation = true;
  let action = {
    name: e
  };
  switch (e) {
    case 'follow':
      break;
    case 'raise':
    case 'follow-raise':
      let amount = 0, min = Math.max(lobbyPlayers.lobby.bigBlind, lobbyPlayers.lobby.highestBet), max = Math.min(lobbyPlayers.lobby.pool, lobbyPlayers[player.id].token - (lobbyPlayers.lobby.highestBet - lobbyPlayers[player.id].currentBet));
      amount = promptForInteger(`Enter raise value (min: ${min}, max: ${max})`, min)
      if (amount == null) {
        return;
      }
      if (amount < min || amount > max) {
        alert(`Please enter a valid amount between ${min} - ${max}`);
        return;
      }
      action.amount = amount;
      break;
    case 'all-in':
      confirmation = confirm("Confirm All In?")
      break;
    case 'check':
      break;
    case 'fold':
      confirmation = confirm("Confirm Fold?")
      break;
  }
  if (!confirmation) {
    return;
  }
  socket.emit('proceed round', action)
  $('div.action').remove();
}
function generateLobby() {
  console.log("Lobby", lobbyPlayers)
  lobbiesElement.innerHTML =
  `<div class="lobby col-sm-12">
    <h2>Lobby: ${lobbyPlayers.lobby.name}</h2>
  </div>
  <div class="col-md-6 col-sm-6">
    <h3>Players:</h3>
    ${lobbyPlayers.lobby.players.reduce((prev, cur) => {
      return prev + `<p>
      ${cur == lobbyPlayers.lobby.host ? `<span class="fa fa-crown host"></span> ` : ""}
      ${lobbyPlayers[cur].name}
      ${generateUserIcon(cur)}</p>`
    }, "")}
  </div>
  <div class="col-md-6 col-sm-6 col-xs-6">
    <h3>Details:</h3>
    <p><b>Starting Token</b> <span class="fa fa-money-bill"></span>: ${lobbyPlayers.lobby.token}</p>
    <p><b>Big Blind</b> <span class="fa fa-dollar-sign"></span>: ${lobbyPlayers.lobby.bigBlind}</p>
    <p><b>Small Blind</b> <span class="fa fa-hand-holding-usd"></span>: ${lobbyPlayers.lobby.smallBlind}</p>
  </div>
  <div class="col-md-12">${player.id == lobbyPlayers.lobby.host ? `<button onclick="startGame()" class="btn btn-primary">Start Game</button>` : ""}<button onclick="quitLobby()" class="btn btn-danger">Quit Lobby</button></div>`
}
function quitLobby() {
  socket.emit('quit lobby');
  delete player.lobby;
  savePlayer();
}
function generateUserIcon(playerId) {
  let icon = lobbyPlayers[playerId].icon.split(' ')
  return `<span style="color: ${lobbyPlayers[playerId].color}" class="${icon.length > 1 ? icon[1] : "fa"} fa-${icon[0]}"></span>`;
}
function startGame() {
  if (lobbyPlayers.lobby.players.length >= 2) {
    lobbyPlayers.lobby.seq = [];
    selectSequence();
  } else {
    alert("Need at least 2 players to start")
  }
}
function selectSequence() {
  let html = `${lobbyPlayers.lobby.players.reduce((prev, cur) => prev + `<div onclick="addPlayerSeq(this)" data-id="${cur}" class="seq-selection">${lobbyPlayers[cur].name}<span id="seq-${cur}" class="seq"></span></div>`, "")}`
  $("#sequence-modal .modal-body").html(html)
  $("#sequence-modal").modal("show");
}
function selectWinner() {
  let html = `${lobbyPlayers.lobby.players.filter(x => !lobbyPlayers.lobby.fold.includes(x)).reduce((prev, cur) => prev + `<div onclick="addWinner(this)" data-id="${cur}" class="winner-selection">${lobbyPlayers[cur].name}</div>`, "")}`
  $("#winner-modal .modal-body").html(html)
  $("#winner-modal").modal("show");
}
function addWinner(e) {
  if (e.classList.contains("selected")) {
    e.classList.remove("selected");
  } else {
    e.classList.add("selected");
  }
}
function confirmWinner() {
  let winners = $("#winner-modal .winner-selection.selected");
  if (winners.length == 0) {
    alert("Select at least one winner");
  } else {
    let winnerList = [];
    for(var winner of winners) {
      if (!lobbyPlayers[winner.dataset.id]) {
        alert("Some players might have reconnected, reselect the winners");
        $("#winner-modal").modal("hide");
        selectWinner();
        return;
      } else {
        winnerList.push(winner.dataset.id)
      }
    }
    $("#winner-modal").modal("hide");
    console.log("Winner List", winnerList)
    socket.emit('winners', winnerList);
  }
}
function addPlayerSeq(e) {
  console.log("Player Seq", e.dataset.id)
  if (e.classList.contains("selected")) {
    e.classList.remove("selected");
    let index = lobbyPlayers.lobby.seq.indexOf(e.dataset.id);
    if (index !== -1) {
      lobbyPlayers.lobby.seq.splice(index, 1);
    }
  } else {
    e.classList.add("selected");
    lobbyPlayers.lobby.seq.push(e.dataset.id);
  }
  lobbyPlayers.lobby.players.forEach(p => {
    let index = lobbyPlayers.lobby.seq.indexOf(p);
    if (index !== -1) {
      document.getElementById("seq-" + p).innerHTML = index + 1;
    } else {
      document.getElementById("seq-" + p).innerHTML = "";
    }
  })
}
function acceptSequence() {
  if (lobbyPlayers.lobby.seq.length != lobbyPlayers.lobby.players.length) {
    alert("Select every players");
  } else {
    $("#sequence-modal").modal("hide");
    socket.emit("start game", lobbyPlayers.lobby)
    $('div.action').remove();
  }
}
function reconnectOldPlayer() {
  socket.emit("old player", player, function (success) {
    if (success) {
      console.log("Reconnected as old player", player)
      player.id = socket.id;
      savePlayer();
    } else {
      console.log("Fail to reconnect as old player")
      connectNewPlayer();
    }
  });
}
function connectNewPlayer() {
  let name = getName();
  socket.emit('name', name, function (success) {
    if (success) {
      saveName(name);
      console.log("Connected as new player")
    } else {
      alert("An error occurred")
    }
  });
}
function getPlayer() {
  let playerItem = localStorage.getItem("player");
  if (playerItem) {
    playerItem = JSON.parse(playerItem)
    console.log("Player", playerItem)
  }
  return playerItem;
}
function removePlayer() {
  localStorage.removeItem("player");
}
function savePlayer() {
  updatePlayerInfo();
  localStorage.setItem("player", JSON.stringify(player))
}
function saveName(name) {
  player = {
    id: socket.id,
    name: name
  }
  savePlayer();
}
function updatePlayerInfo() {
  document.querySelector("#player-info .name").innerHTML = player.name;
  if (!player.icon || !player.color) {
    promptIcon();
  } else {
    document.querySelector("#player-info .icon").style.color = player.color;
    document.querySelector("#player-info .icon").style.borderColor = player.color;
    let icon = player.icon.split(' ');
    document.querySelector("#player-info .icon").innerHTML = `<span style="color: ${player.color}" class="${icon.length > 1 ? icon[1]: "fa"} fa-${icon[0]}"></span>`;
    if (!player.lobby) {
      socket.emit("get lobbies");
    }
  }
}
function selectColor(e) {
  $(".color-picker span.selected").removeClass("selected");
  $(e).addClass("selected");
  $(".large-fa-icon .fa, .large-fa-icon .fab").css('color', e.dataset.color);
  if (player.icon) {
    $(".large-fa-icon .fa, .large-fa-icon .fab").css('color', 'black');
    $(`.fa-${player.icon.split(' ')[0]}, .fab-${player.icon.split(' ')[0]}`).css('color', e.dataset.color);
  }
  player.color = e.dataset.color;
  // sendPlayerInfo();
}
function selectIcon(e) {
  $(".large-fa-icon span.selected").removeClass("selected");
  $(".large-fa-icon .fa, .large-fa-icon .fab").css('color', 'black');
  $(e).addClass("selected");
  if (player.color) {
    $(e).css('color', player.color);
  }
  player.icon = e.dataset.icon;
  // sendPlayerInfo();
}
function promptIcon() {
  let icons = ["cat", "dog", "kiwi-bird", "dragon", "fish", "frog", "horse", "spider", "ghost", "gamepad", "toilet-paper", "robot",
  "ice-cream", "egg", "studiovinari fab", "laugh-squint", "bomb", "brain", "bug", "bbok-medical", "bowling-ball", "candy-cane",
  "car-crash", "carrot", "church", "dice-five", "dna", "gem", "fire-alt", "jenkins fab", "linux fab", "meteor", "octopus-deploy fab",
  "paw", "poop", "steam fab", "user-ninja", "user-injured", "wheelchair", "yin-yang"];
  let colors = ["#D50000", "#FF4081", "#9C27B0", "#3F51B5", "#2196F3", "#00BCD4", "#4CAF50", "#FF9800", "#607D8B"]
  shuffleArray(icons);
  shuffleArray(colors);
  lobbiesElement.innerHTML = `<div class="color-picker col-md-12">
    ${colors.reduce((prev, cur) => prev + `<span onclick="selectColor(this)" data-color="${cur}" style="background-color:${cur}"></span>`, "")}
  </div>`;
  lobbiesElement.innerHTML += '<div class="col-md-12 icon-list">' + icons.reduce((prev, cur) => {
    let icons = cur.split(' ');
    return prev + 
    `<div class="large-fa-icon">
      <span onclick="selectIcon(this)" class="${icons.length > 1 ? icons[1] : "fa"} fa-${icons[0]}" data-icon="${cur}"></span>
    </div>`
  }, "") + '</div>';
  lobbiesElement.innerHTML +=
  `<div class="col-md-12">
    <button onclick="sendPlayerInfo()" class="btn btn-primary">Confirm</button>
  </div>`
}
function sendPlayerInfo() {
  if (!player.color || !player.icon) {
    return;
  }
  socket.emit("player info", player)
  savePlayer();
  $('div.action').remove();
}
function getName() {
  let nameInput = "";
  while (!nameInput || nameInput.trim() == "") {
    nameInput = prompt("Please enter your name");
  }
  return nameInput;
}
function logout() {
  let logout = confirm("Press OK to Log Out");
  if (logout) {
    logout = confirm("DOUBLE CONFIRM!!! All will be deleted after Log Out!");
    if (logout) {
      removePlayer();
      socket.emit('logout');
      location.reload();
    }
  }
}
function showGameInfo() {
  $("#info-modal").modal("show");
}
function showPlayerModal() {
  $("#player-modal").modal("show");
}
$("#vibrate-helper").on('change', function () {
  notify = this.checked;
})
$(function () {
  socket = io();
  $("#info-modal .modal-body").load("rules.html");
  init();
});
function shuffleArray(array) {
  for (let i = array.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [array[i], array[j]] = [array[j], array[i]];
  }
}
