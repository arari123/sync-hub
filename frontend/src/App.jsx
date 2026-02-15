import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import Layout from './components/Layout';
import ProtectedRoute from './components/ProtectedRoute';
import SearchResults from './pages/SearchResults';
import BudgetProjectCreate from './pages/BudgetProjectCreate';
import BudgetProjectOverview from './pages/BudgetProjectOverview';
import BudgetProjectInfoEdit from './pages/BudgetProjectInfoEdit';
import BudgetProjectBudget from './pages/BudgetProjectBudget';
import BudgetProjectEditor from './pages/BudgetProjectEditor';
import AgendaList from './pages/AgendaList';
import AgendaCreate from './pages/AgendaCreate';
import AgendaDetail from './pages/AgendaDetail';
import DataHub from './pages/DataHub';
import ProjectPlaceholderPage from './pages/ProjectPlaceholderPage';
import BudgetProjectSchedule from './pages/BudgetProjectSchedule';
import BudgetProjectScheduleManagement from './pages/BudgetProjectScheduleManagement';
import Login from './pages/Login';
import Signup from './pages/Signup';
import VerifyEmail from './pages/VerifyEmail';
import './App.css';

function LegacyBudgetManagementRedirect() {
  const location = useLocation();
  const redirectedPath = location.pathname.replace(/^\/budget-management/, '/project-management');
  return <Navigate to={`${redirectedPath}${location.search}${location.hash}`} replace />;
}

function LegacySearchRedirect() {
  const location = useLocation();
  return <Navigate to={`/home${location.search}${location.hash}`} replace />;
}

function App() {
  return (
    <BrowserRouter>
      <Layout>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/signup" element={<Signup />} />
          <Route path="/verify-email" element={<VerifyEmail />} />
          <Route path="/" element={<ProtectedRoute><Navigate to="/home" replace /></ProtectedRoute>} />
          <Route path="/home" element={<ProtectedRoute><SearchResults /></ProtectedRoute>} />
          <Route path="/search" element={<ProtectedRoute><LegacySearchRedirect /></ProtectedRoute>} />
          <Route path="/project-management" element={<ProtectedRoute><Navigate to="/home" replace /></ProtectedRoute>} />
          <Route path="/project-management/projects/new" element={<ProtectedRoute><BudgetProjectCreate /></ProtectedRoute>} />
          <Route path="/project-management/projects/:projectId" element={<ProtectedRoute><BudgetProjectOverview /></ProtectedRoute>} />
          <Route path="/project-management/projects/:projectId/info/edit" element={<ProtectedRoute><BudgetProjectInfoEdit /></ProtectedRoute>} />
          <Route path="/project-management/projects/:projectId/budget" element={<ProtectedRoute><BudgetProjectBudget /></ProtectedRoute>} />
          <Route path="/project-management/projects/:projectId/budget-dashboard" element={<ProtectedRoute><Navigate to="../budget" replace /></ProtectedRoute>} />
          <Route path="/project-management/projects/:projectId/agenda" element={<ProtectedRoute><AgendaList /></ProtectedRoute>} />
          <Route path="/project-management/projects/:projectId/agenda/new" element={<ProtectedRoute><AgendaCreate /></ProtectedRoute>} />
          <Route path="/project-management/projects/:projectId/agenda/:agendaId" element={<ProtectedRoute><AgendaDetail /></ProtectedRoute>} />
          <Route path="/project-management/projects/:projectId/joblist" element={<ProtectedRoute><Navigate to="../agenda" replace /></ProtectedRoute>} />
          <Route path="/project-management/projects/:projectId/schedule" element={<ProtectedRoute><BudgetProjectScheduleManagement /></ProtectedRoute>} />
          <Route path="/project-management/projects/:projectId/schedule/write" element={<ProtectedRoute><BudgetProjectSchedule /></ProtectedRoute>} />
          <Route path="/project-management/projects/:projectId/spec" element={<ProtectedRoute><ProjectPlaceholderPage title="사양 관리" description="사양 관리 화면은 다음 단계에서 구현될 예정입니다." /></ProtectedRoute>} />
          <Route path="/project-management/projects/:projectId/data" element={<ProtectedRoute><ProjectPlaceholderPage title="데이터 관리" description="데이터 관리 화면은 다음 단계에서 구현될 예정입니다." /></ProtectedRoute>} />
          <Route path="/project-management/projects/:projectId/edit/:section" element={<ProtectedRoute><BudgetProjectEditor /></ProtectedRoute>} />
          <Route path="/data-hub" element={<ProtectedRoute><DataHub /></ProtectedRoute>} />
          <Route path="/knowledge" element={<ProtectedRoute><Navigate to="/home" replace /></ProtectedRoute>} />
          <Route path="/settings" element={<ProtectedRoute><Navigate to="/home" replace /></ProtectedRoute>} />
          <Route path="/budget-management/*" element={<LegacyBudgetManagementRedirect />} />
        </Routes>
      </Layout>
    </BrowserRouter>
  );
}

export default App;
