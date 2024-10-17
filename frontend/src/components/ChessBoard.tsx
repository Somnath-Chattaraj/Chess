import React, { useState } from 'react'
import chessboard from '../assets/ChessBoard.jpeg'
import { Color, PieceSymbol, Square } from 'chess.js'

const ChessBoard = ({board, socket} : {
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
                        const squareRepresentation = String.fromCharCode(65 + (j % 8)) + "" + (8 - i) as Square
                        return (
                            <div key={j} onClick={() => {
                                if (!from) {
                                    setFrom(squareRepresentation)
                                } else {
                                    socket.send(JSON.stringify({type: "move", payload: {from, to: squareRepresentation}}))
                                }
                            }} className={`w-16 h-16 ${(i+j)%2 == 0 ? 'bg-green-700' : 'bg-green-300'}`}>
                                <div className='w-full h-full flex justify-center'>
                                    <div className='h-full flex justify-center flex-col'>
                                        {square ? square.type : ""}
                                    </div>
                                </div>
                            </div>
                        )
                    })}
                </div>
            )
        })}
        {/* <img src={chessboard} alt="Chessboard" className="pl-10 "/> */}
    </div>
  )
}

export default ChessBoard
