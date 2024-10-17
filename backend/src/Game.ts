import { WebSocket } from "ws";
import { Chess } from "chess.js";
import { GAME_OVER, INIT_GAME, MOVE } from "./messages";

// const chess = new Chess();

// chess.move("e4")
export class Game {
    public player1 : WebSocket;
    public player2 : WebSocket;
    private board : Chess;
    private moveCount : number;
    private startTime : Date;

    constructor(player1: WebSocket, player2 : WebSocket) {
        this.player1 = player1;
        this.player2 = player2;
        this.board = new Chess();
        this.moveCount = 0;
        this.startTime = new Date();

        this.player1.send(JSON.stringify({
            type: INIT_GAME,
            payload: {
                color: "white"
            }
        }));
        this.player2.send(JSON.stringify({
            type: INIT_GAME,
            payload: {
                color: "black",
            }
        }));
    }

    makeMove(player: WebSocket, move: {
        from: string;
        to: string
    }) {
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
        } catch (e) {
            console.log(e);
            return;
        }
        //  Is it this user move
        //  Is the move valid

        if (this.board.isGameOver()) {
            this.player1.send(JSON.stringify({
                type: GAME_OVER,
                payload: {
                    winner: this.board.turn() == "w" ? "black" : "white"
                }
            }))
            this.player2.send(JSON.stringify({
                type: GAME_OVER,
                payload: {
                    winner: this.board.turn() == "w" ? "black" : "white"
                }
            }))
            return;
        }

        if (this.moveCount % 2 == 0) {
            this.player2.send(JSON.stringify({
                type: MOVE,
                payload: move
            }))
        } else  {
            this.player1.send(JSON.stringify({
                type: MOVE,
                payload: move
            }))
        }
        this.moveCount++;
        //  Update the board
        //  Push the move
        //  Check if the game is over

        //  Send the updated board to both the players.
    }
}