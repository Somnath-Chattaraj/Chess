"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Game = void 0;
const chess_js_1 = require("chess.js");
const messages_1 = require("./messages");
// const chess = new Chess();
// chess.move("e4")
class Game {
    constructor(player1, player2) {
        this.player1 = player1;
        this.player2 = player2;
        this.board = new chess_js_1.Chess();
        this.moveCount = 0;
        this.startTime = new Date();
        this.player1.send(JSON.stringify({
            type: messages_1.INIT_GAME,
            payload: {
                color: "white"
            }
        }));
        this.player2.send(JSON.stringify({
            type: messages_1.INIT_GAME,
            payload: {
                color: "black",
            }
        }));
    }
    makeMove(player, move) {
        //  validation here
        // console.log("1");
        if (this.moveCount % 2 == 0 && player != this.player1) {
            // console.log("2");
            return;
        }
        if (this.moveCount % 2 == 1 && player != this.player2) {
            // console.log("3");
            return;
        }
        try {
            this.board.move(move);
            // console.log("4");
        }
        catch (e) {
            console.log(e);
            return;
        }
        //  Is it this user move
        //  Is the move valid
        if (this.board.isGameOver()) {
            this.player1.send(JSON.stringify({
                type: messages_1.GAME_OVER,
                payload: {
                    winner: this.board.turn() == "w" ? "black" : "white"
                }
            }));
            this.player2.send(JSON.stringify({
                type: messages_1.GAME_OVER,
                payload: {
                    winner: this.board.turn() == "w" ? "black" : "white"
                }
            }));
            return;
        }
        if (this.moveCount % 2 == 0) {
            this.player2.send(JSON.stringify({
                type: messages_1.MOVE,
                payload: move
            }));
        }
        else {
            this.player1.send(JSON.stringify({
                type: messages_1.MOVE,
                payload: move
            }));
        }
        this.moveCount++;
        //  Update the board
        //  Push the move
        //  Check if the game is over
        //  Send the updated board to both the players.
    }
}
exports.Game = Game;
