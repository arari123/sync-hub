import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Layout from './components/Layout';
import Home from './pages/Home';
import SearchResults from './pages/SearchResults';
import BudgetManagement from './pages/BudgetManagement';
import './App.css';

function App() {
  return (
    <BrowserRouter>
      <Layout>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/search" element={<SearchResults />} />
          <Route path="/budget-management" element={<BudgetManagement />} />
        </Routes>
      </Layout>
    </BrowserRouter>
  );
}

export default App;
