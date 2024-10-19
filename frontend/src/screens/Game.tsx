import { useEffect, useState } from 'react';
import { useSocket } from '../hook/useSocket';
import ChessBoard from '../Elements/ChessBoard';
import { Chess } from 'chess.js';
import { Button } from '@/components/ui/button'; 
import { Card, CardHeader, CardContent, CardFooter } from '@/components/ui/card'; 

export const INIT_GAME = "init_game";
export const MOVE = "move";
export const GAME_OVER = "game_over"; 

export const Game = () => {
    const socket = useSocket();
    const [chess, setChess] = useState(new Chess());
    const [board, setBoard] = useState(chess.board());
    const [started, setStarted] = useState(false); 

    useEffect(() => {
        if (!socket) return;

        socket.onmessage = (event) => {
            const message = JSON.parse(event.data);
            console.log(message);
            switch (message.type) {
                case INIT_GAME:
                    setBoard(chess.board());
                    setStarted(true);
                    console.log("Game is starting");
                    break;
                case MOVE:
                    const move = message.payload;
                    chess.move(move);
                    setBoard(chess.board());
                    console.log("Move made");
                    break;
                case GAME_OVER:
                    console.log("Game over");
                    break;
            }
        }
    }, [socket, chess]);

    if (!socket) return <div>Connecting...</div>;

    return (
        <div className="flex justify-center py-12 min-h-screen bg-gradient-to-br from-gray-900 to-gray-800">
            <div className="max-w-screen-lg w-full px-4 md:px-6">
                {/* Adjust grid layout for different screen sizes */}
                <div className="grid grid-cols-1 md:grid-cols-6 gap-6 w-full">
                    {/* Chessboard Section */}
                    <div className="col-span-1 md:col-span-4 flex justify-center items-center">
                        <Card className="bg-gray-900 shadow-xl w-full">
                            <CardHeader className="text-white text-xl font-semibold text-center p-4">
                                Chess Game
                            </CardHeader>
                            <CardContent className="p-4 sm:p-8 justify-center items-center md:ml-8">
                                <ChessBoard 
                                    chess={chess} 
                                    setBoard={setBoard} 
                                    socket={socket} 
                                    board={board} 
                                />
                            </CardContent>
                        </Card>
                    </div>

                    {/* Control Panel Section */}
                    <div className="col-span-1 md:col-span-2">
                        <Card className="bg-gray-800 shadow-xl w-full">
                            <CardHeader className="text-white text-center text-2xl font-semibold p-6">
                                Game Control
                            </CardHeader>
                            <CardContent className="flex flex-col items-center">
                                {!started && (
                                    <Button
                                        variant="outline"
                                        className="bg-green-600 hover:bg-green-700 text-white text-lg font-semibold py-4 px-8 rounded-full shadow-lg"
                                        onClick={() => socket.send(JSON.stringify({ type: INIT_GAME }))}
                                    >
                                        Play Game
                                    </Button>
                                )}
                            </CardContent>
                            <CardFooter className="text-gray-400 text-center p-4">
                                {/* Add any footer content if necessary */}
                            </CardFooter>
                        </Card>
                    </div>
                </div>
            </div>
        </div>
    );
};
