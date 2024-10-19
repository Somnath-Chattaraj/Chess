import { Route, Routes, BrowserRouter } from 'react-router-dom';
import Landing from './screens/Landing';
import {Game} from './screens/Game';
import './App.css';
import { Signup } from './screens/Signup';
import { Login } from './screens/Login';

function App() {
  return (
    <div className='w-screen h-screen bg-slate-950'>

    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/signup" element={<Signup />} />
        <Route path="/login" element={<Login />} />
        <Route path="/game" element={<Game />} />
        {/* <Route path="/dashboard" component={Dashboard} /> */}
      </Routes>
    </BrowserRouter>
    </div>
  );
}

export default App;
