import { Room, Client, Delayed } from "colyseus";
import { Schema, type, MapSchema, ArraySchema } from "@colyseus/schema";

export class Player extends Schema {
  @type("string")
  discardTo = "";

  @type("string")
  discardFrom = "";

  @type(["string"])
  cards = new ArraySchema<string>();

  @type("boolean")
  enableBurro = false;

  @type("string")
  burro = "";

  playerIdNext = "";
  playerIdPrev = "";

  playerId: string;

  isBot = false;

  dateBurro: Date = null;

  constructor(playerId: string) {
    super();
    this.playerId = playerId;
  }

  setEnableBurro() {
    if (this.cards.length === 4) {
      let countVal = 0;
      let countFig = 0;
      const firstCard = this.cards[0];
      for (const card of this.cards) {
        if (card[0] === firstCard[0]) {
          countVal++;
        }
        if (card[1] === firstCard[1]) {
          countFig++;
        }
      }
      if (countVal === 4 || countFig === 4) {
        this.enableBurro = true;
        return;
      }
    }
    this.enableBurro = false;
  }
}
export class State extends Schema {
  @type({ map: Player })
  players = new MapSchema<Player>();

  numPlayers: number = 2;

  cards: string[];

  enableBurro = false;

  constructor(numPlayers: number) {
    super();
    this.numPlayers = numPlayers;
  }

  init() {
    const cards = ["2C", "2D", "2H", "2S", "3C", "3D", "3H", "3S", "4C",
      "4D", "4H", "4S", "5C", "5D", "5H", "5S", "6C", "6D", "6H", "6S",
      "7C", "7D", "7H", "7S", "8C", "8D", "8H", "8S", "9C", "9D", "9H",
      "9S", "AC", "AD", "AH", "AS", "JC", "JD", "JH", "JS", "KC", "KD",
      "KH", "KS", "QC", "QD", "QH", "QS", "TC", "TD", "TH", "TS"];
    // Se revuelve el mazo
    for (let i = 0; i < cards.length; i++) {
      const aleatorio = Math.floor(Math.random() * cards.length);
      const card = cards[aleatorio];
      cards[aleatorio] = cards[i];
      cards[i] = card;
    }

    var playersKeys = Array.from(this.players._indexes.keys());
    let index = 0;

    for (let id in this.players) {
      const playerCards = new ArraySchema<string>();
      for (let index2 = 0; index2 < 4; index2++) {
        playerCards.push(cards.pop() || '');
      }
      const next = index + 1 >= this.players._indexes.size ? "" : this.players[playersKeys[index + 1]].playerId;
      const prev = index === 0 ? "" : this.players[playersKeys[index - 1]].playerId;
      const discardFrom = index === 0 ? cards.pop() : "";

      this.players[id].cards = playerCards;
      this.players[id].playerIdPrev = prev;
      this.players[id].playerIdNext = next;
      this.players[id].discardFrom = discardFrom;
      this.players[id].dateBurro = null;

      index++;
    }
    this.enableBurro = false;
    this.cards = cards;
  }

  createPlayer(id: string): any {
    this.players[id] = new Player(id);
    console.log("this.players._indexes.size", this.players._indexes.size);
    console.log("this.numPlayers", this.numPlayers);
    if (this.players._indexes.size === this.numPlayers - 1) {
      // Iniciar Partida
      this.init();
      return { status: "start" };
    }
    return null;
  }

  removePlayer(id: string): void {
    this.players[id].isBot = true;
  }

  playerDiscard(id: string, index: number) {
    const cards: ArraySchema<string> = this.players[id].cards;
    const discard = cards[index];
    cards.splice(index, 1);
    this.players[id].cards = cards;
    this.players[id].discardTo = discard;
    if (this.players[id].next) {
      this.players[this.players[id].next].discardFrom = discard;
    } else {
      this.cards.unshift(discard);
    }
  }

  playerTakeNext(id: string) {
    if (this.players[id].cards.length === 3 && this.players[id].discardFrom) {
      this.players[id].cards.push(this.players[id].discardFrom);
      this.players[id].discardFrom = "";
      if (!this.players[id].playerIdPrev) {
        this.players[id].discardFrom = this.cards.pop();
      } else {
        this.players[this.players[id].playerIdPrev].discardTo = "";
      }
      this.players[id].setEnableBurro();
    }
  }

  playerBurro(id: string) {
    if ((this.players[id].enableBurro || this.enableBurro) && !this.players[id].dateBurro) {
      this.players[id].dateBurro = new Date();
      if (!this.enableBurro) {
        this.enableBurro = true;
      } else {
        const loser: any = {};
        let countNull = 0;
        for (const pId in this.players) {
          const data = this.players[pId];
          if (data.dateBurro) {
            if (!loser.dateBurro || loser.dateBurro < data.dateBurro) {
              loser.dateBurro = data.dateBurro;
              loser.player = data;
            }
          } else {
            countNull++;
            loser.playerNull = data;
          }
        }
        if (countNull < 2) {
          const data = countNull === 0 ? loser.player : loser.playerNull;
          let burro = data.burro || '';
          if (burro !== 'BURRO') {
            const letter = 'BURRO'[burro.length];
            burro += letter;
            data.burro = burro;
            this.init();
            return { type: "endRound", playerIdLoser: data.playerId, burro: burro, letter: letter };
          } else {
            return { type: "end", playerIdLoser: data.playerId };
          }
        }
      }
    }
    return null;
  }
}

export class BurroRoom extends Room<State> {

  onCreate(options: any) {
    console.log("onCreate", options);
    this.setState(new State(options.numPlayers));

    this.onMessage("discard", (client, message) => {
      console.log("discard", client, message);
      this.state.playerDiscard(client.sessionId, message.index);
    });
    this.onMessage("takeNext", (client, message) => {
      console.log("takeNext", client, message);
      this.state.playerTakeNext(client.sessionId);
    });
    this.onMessage("burro", (client, message) => {
      console.log("burro", client, message);
      var result = this.state.playerBurro(client.sessionId);
      if(result?.type == "endRound") {
        this.broadcast('endRound', result);
      }
      if(result?.type == "end") {
        this.broadcast('endGame', result);
        this.disconnect();
      }
    });
    /*this.onMessage("status", (client, message) => {
      if(message.status === "end") {
        this.disconnect();
      }
    });*/
  }

  onJoin(client: Client, options: any) {
    console.log("onJoin", options);
    const response = this.state.createPlayer(client.sessionId);
    console.log("onJoin response", response);
    if (response?.status === "start") {
      this.broadcast('start');
      this.lock();
    }
  }

  onLeave(client: Client, consented: boolean) {
    console.log("onLeave", client, consented);
  }

  onDispose() {
  }

}