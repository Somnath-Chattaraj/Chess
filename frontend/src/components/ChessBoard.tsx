import { useState } from 'react'
import { Color, PieceSymbol, Square } from 'chess.js'

const ChessBoard = ({chess, setBoard , board, socket} : {
    setBoard: any;
    chess: any;
    board: ({
        square: Square;
        type: PieceSymbol;
        color: Color
    } | null)[][];
    socket: WebSocket;
}) => {
    const [from, setFrom] = useState<null| Square>(null)
    const [to, setTo] = useState(null)
  return (
    <div className='text-white-200'>
        {board.map((row, i) => {
            return (
                <div key={i} className='flex'>
                
                    {row.map((square, j) => {
                        const squareRepresentation = String.fromCharCode(97 + (j % 8)) + "" + (8 - i) as Square
                        return (
                            <div key={j} onClick={() => {
                                if (!from) {
                                    setFrom(squareRepresentation)
                                } else {
                                    socket.send(JSON.stringify({type: "move", payload: {
                                        move: {
                                            from,
                                            to: squareRepresentation
                                        }
                                    }}))
                                    setFrom(null);
                                    chess.move({
                                        from,
                                        to: squareRepresentation
                                    });
                                    setBoard(chess.board());
                                    console.log({from, to: squareRepresentation})
                                }
                            }} className={`w-16 h-16 ${(i+j)%2 == 0 ? 'bg-green-700' : 'bg-green-300'}`}>
                                <div className='w-full h-full flex justify-center'>
                                    <div className='h-full flex justify-center flex-col'>
                                        {square ? 
                                        <img src={`/${square?.color === "b" ? square?.type : `${square?.type?.toUpperCase()} copy`}.png`} className='w-10' alt="" />
                                        : null}
                                    </div>
                                </div>
                            </div>
                        )
                    })}
                </div>
            )
        })}
    </div>
  )
}

export default ChessBoard
