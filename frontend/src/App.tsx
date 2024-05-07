import { BrowserRouter as Router, Route, Routes, BrowserRouter } from 'react-router-dom';
import Landing from './screens/Landing';
import {Game} from './screens/Game';
import './App.css';

function App() {
  return (
    <div className='w-screen h-screen bg-slate-950'>

    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/game" element={<Game />} />
        {/* <Route path="/dashboard" component={Dashboard} /> */}
      </Routes>
    </BrowserRouter>
    </div>
  );
}

export default App;
