import chessBoard from "../assets/ChessBoard.jpeg";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button"; 
import { motion } from "framer-motion"; 
import Navbar from "@/Elements/Navbar";

const Landing: React.FC = () => {
    const navigate = useNavigate();

    return (<>
    
            <Navbar btnName="Login" navigateUrl={'/login'} display={true} loadingUsr={false}/>
        <div className="min-h-screen px-10 bg-gradient-to-br from-gray-900 via-purple-900 to-black flex">
            <motion.div
                initial={{ opacity: 0, y: -50 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 1.2 }}
                className="flex flex-col md:flex-row justify-center items-center pt-[10rem] space-y-6 md:space-y-0 md:space-x-8"
            >
                {/* Animated Image */}
                <motion.img 
                    src={chessBoard} 
                    alt="Chessboard" 
                    className="w-[300px] md:w-[600px] h-auto rounded-lg shadow-xl"
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ duration: 1.2, delay: 0.2 }}
                />

                <div className="text-center mt-12 md:mt-0 max-w-4xl p-6">
                    {/* Main Heading */}
                    <motion.h1
                        className="font-extrabold text-4xl md:text-7xl lg:text-8xl text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-pink-600"
                        initial={{ opacity: 0, y: 50 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 1.4, delay: 0.5 }}
                    >
                        Play Chess Online
                    </motion.h1>

                    <p className="text-md md:text-lg text-gray-300 mt-6">
                        Challenge your friends or take on players from around the world. Improve your chess skills and have fun.
                    </p>

                    {/* Play Button with Animation */}
                    <motion.div
                        initial={{ opacity: 0, y: 30 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 1.6, delay: 0.8 }}
                        className="mt-10"
                    >
                        <Button
                            onClick={() => navigate('/game')}
                            className="hover:bg-gradient-to-r from-green-400 to-green-600 hover:scale-105 transition-transform transform text-2xl md:text-4xl font-semibold text-white py-7 md:py-6 px-8 md:px-12 rounded-lg shadow-lg"
                        >
                            Play Now
                        </Button>
                    </motion.div>
                </div>
            </motion.div>
        </div>
        </>
    );
};

export default Landing;
