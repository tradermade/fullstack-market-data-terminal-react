import { Routes, Route, Navigate } from 'react-router-dom';
import GlobalStyles from './styles/GlobalStyles';
import TradingPortal from './components/TradingPortal';
import LiveRates from './pages/LiveRates';
import { MarketDataProvider } from './context/MarketDataContext.jsx';

function App() {
  return (
    <MarketDataProvider>
      <div className="w-full h-full flex flex-col overflow-hidden">
        <GlobalStyles />
        <Routes>
          <Route path="/" element={<LiveRates />} />
          <Route path="/forex-charts" element={<TradingPortal />} />
          <Route path="*" element={<Navigate to="/forex-charts" replace />} />
        </Routes>
      </div>
    </MarketDataProvider>
  );
}

export default App;
