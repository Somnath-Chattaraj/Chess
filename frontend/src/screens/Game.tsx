import React, { useEffect, useState } from 'react'
import { useSocket } from '../hook/useSocket';
import ChessBoard from '../components/ChessBoard';
import { Button } from '../components/Button';
import { Chess } from 'chess.js';

export const INIT_GAME = "init_game";
export const MOVE = "move";
export const GAME_OVER = "game_move";

export const Game = () => {
    const socket = useSocket();
    const [chess , setChess] = useState(new Chess());
    const [board, setBoard] = useState(chess.board());

    useEffect(() => {
        if (!socket) {
            return;
        }
        socket.onmessage = (event) => {
            const message = JSON.parse(event.data);
            console.log(message);
            switch (message.type) {
                case INIT_GAME:
                    setChess(new Chess());
                    setBoard(chess.board());
                    console.log("Game is starting");
                    break;
                case MOVE:
                    const move = message.payload;
                    chess.move(move);
                    setBoard(chess.board());
                    console.log("Move made");
                    break;
                case GAME_OVER:
                    // board.isGameOver();
                    console.log("Game over");
                    break;
            }
        }
    })
    if (!socket) return <div>Connecting...</div>

  return (
    <div className='justify-center flex'>
        <div className='pt-8 max-w-screen-lg w-full'>
            <div className='grid grid-cols-6 gap-4 w-ful'>
                <div className='col-span-4 w-full flex justify-content'>
                    <ChessBoard socket={socket} board={board} />
                </div>
                <div className='col-span-2 bg-slate-900 w-full flex justify-center'>
                    <div className='pt-8'>
                        <Button onClick={() => socket.send(JSON.stringify({type: INIT_GAME}))}>Play</Button>
                    </div>
                </div>
            </div>
        </div>
    </div>
  )
}

