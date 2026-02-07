import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Layout from './components/Layout';
import ProtectedRoute from './components/ProtectedRoute';
import Home from './pages/Home';
import SearchResults from './pages/SearchResults';
import BudgetManagement from './pages/BudgetManagement';
import BudgetProjectCreate from './pages/BudgetProjectCreate';
import BudgetProjectOverview from './pages/BudgetProjectOverview';
import BudgetProjectEditor from './pages/BudgetProjectEditor';
import Login from './pages/Login';
import Signup from './pages/Signup';
import VerifyEmail from './pages/VerifyEmail';
import './App.css';

function App() {
  return (
    <BrowserRouter>
      <Layout>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/signup" element={<Signup />} />
          <Route path="/verify-email" element={<VerifyEmail />} />
          <Route path="/" element={<ProtectedRoute><Home /></ProtectedRoute>} />
          <Route path="/search" element={<ProtectedRoute><SearchResults /></ProtectedRoute>} />
          <Route path="/budget-management" element={<ProtectedRoute><BudgetManagement /></ProtectedRoute>} />
          <Route path="/budget-management/projects/new" element={<ProtectedRoute><BudgetProjectCreate /></ProtectedRoute>} />
          <Route path="/budget-management/projects/:projectId" element={<ProtectedRoute><BudgetProjectOverview /></ProtectedRoute>} />
          <Route path="/budget-management/projects/:projectId/edit/:section" element={<ProtectedRoute><BudgetProjectEditor /></ProtectedRoute>} />
        </Routes>
      </Layout>
    </BrowserRouter>
  );
}

export default App;
