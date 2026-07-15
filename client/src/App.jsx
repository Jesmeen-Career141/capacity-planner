import { Routes, Route } from 'react-router-dom';
import Layout from './layout/Layout';
import Dashboard from './pages/Dashboard';
import TABoard from './pages/TABoard';
import Positions from './pages/Positions';
import PositionDetails from './pages/PositionDetails';
import NewPosition from './pages/NewPosition';
import Clients from './pages/Clients';
import TAs from './pages/TAs';
import Archive from './pages/Archive';

function App() {
  return (
    <Routes>
      <Route path="/" element={<Layout />}>
        <Route index element={<Dashboard />} />
        <Route path="ta-board" element={<TABoard />} />
        <Route path="positions" element={<Positions />} />
        <Route path="positions/new" element={<NewPosition />} />
        <Route path="positions/:id" element={<PositionDetails />} />
        <Route path="clients" element={<Clients />} />
        <Route path="tas" element={<TAs />} />
        <Route path="archive" element={<Archive />} />
      </Route>
    </Routes>
  );
}

export default App;
