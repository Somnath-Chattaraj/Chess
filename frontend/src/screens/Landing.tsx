import React from "react";
import chessBoard from "../assets/ChessBoard.jpeg";
import { useNavigate } from "react-router-dom";

const Landing: React.FC = () => {
    const navigate = useNavigate();
    return (
        <div className="justify-center item-center">
            <div className="flex flex-column justify-center items-center pt-[14rem]">   
                <img src={chessBoard} alt="Chessboard" className="pl-10 "/>
                {/* Add the rest of the chess.com landing page content here */}
                <div className=" w-[66rem] p-20">
                    <h1 className="font-bold text-9xl text-white pr-10 pt-10 text-center">Play chess online on this site</h1>
                    <button onClick={() => navigate('/game')} className="hover:bg-green-700 bg-green-600 justify-center item-center text-7xl text-white rounded-lg shadow-lg shadow-gray-500/50 font-bold ml-10  w-[51rem] h-40 mt-20">Play Online</button>
                </div>            
            </div>
        </div>
    );
};

export default Landing;