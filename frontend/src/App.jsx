import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import Layout from './components/Layout';
import ProtectedRoute from './components/ProtectedRoute';
import Home from './pages/Home';
import SearchResults from './pages/SearchResults';
import BudgetManagement from './pages/BudgetManagement';
import BudgetProjectCreate from './pages/BudgetProjectCreate';
import BudgetProjectOverview from './pages/BudgetProjectOverview';
import BudgetProjectBudget from './pages/BudgetProjectBudget';
import BudgetProjectEditor from './pages/BudgetProjectEditor';
import Login from './pages/Login';
import Signup from './pages/Signup';
import VerifyEmail from './pages/VerifyEmail';
import './App.css';

function LegacyBudgetManagementRedirect() {
  const location = useLocation();
  const redirectedPath = location.pathname.replace(/^\/budget-management/, '/project-management');
  return <Navigate to={`${redirectedPath}${location.search}${location.hash}`} replace />;
}

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
          <Route path="/project-management" element={<ProtectedRoute><BudgetManagement /></ProtectedRoute>} />
          <Route path="/project-management/projects/new" element={<ProtectedRoute><BudgetProjectCreate /></ProtectedRoute>} />
          <Route path="/project-management/projects/:projectId" element={<ProtectedRoute><BudgetProjectOverview /></ProtectedRoute>} />
          <Route path="/project-management/projects/:projectId/budget" element={<ProtectedRoute><BudgetProjectBudget /></ProtectedRoute>} />
          <Route path="/project-management/projects/:projectId/edit/:section" element={<ProtectedRoute><BudgetProjectEditor /></ProtectedRoute>} />
          <Route path="/budget-management/*" element={<LegacyBudgetManagementRedirect />} />
        </Routes>
      </Layout>
    </BrowserRouter>
  );
}

export default App;
