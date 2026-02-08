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
import PlaceholderPage from './pages/PlaceholderPage';
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
          <Route path="/project-management/projects/:projectId/joblist" element={<ProtectedRoute><PlaceholderPage title="잡리스트" description="잡리스트 관리 화면은 다음 단계에서 구현될 예정입니다." /></ProtectedRoute>} />
          <Route path="/project-management/projects/:projectId/schedule" element={<ProtectedRoute><PlaceholderPage title="일정 관리" description="일정 관리 화면은 다음 단계에서 구현될 예정입니다." /></ProtectedRoute>} />
          <Route path="/project-management/projects/:projectId/spec" element={<ProtectedRoute><PlaceholderPage title="사양 관리" description="사양 관리 화면은 다음 단계에서 구현될 예정입니다." /></ProtectedRoute>} />
          <Route path="/project-management/projects/:projectId/fabrication" element={<ProtectedRoute><PlaceholderPage title="제작 관리" description="제작 관리 화면은 다음 단계에서 구현될 예정입니다." /></ProtectedRoute>} />
          <Route path="/project-management/projects/:projectId/installation" element={<ProtectedRoute><PlaceholderPage title="설치 관리" description="설치 관리 화면은 다음 단계에서 구현될 예정입니다." /></ProtectedRoute>} />
          <Route path="/project-management/projects/:projectId/as" element={<ProtectedRoute><PlaceholderPage title="AS 관리" description="AS 관리 화면은 다음 단계에서 구현될 예정입니다." /></ProtectedRoute>} />
          <Route path="/project-management/projects/:projectId/edit/:section" element={<ProtectedRoute><BudgetProjectEditor /></ProtectedRoute>} />
          <Route path="/knowledge" element={<ProtectedRoute><PlaceholderPage title="지식 베이스" description="지식 베이스 화면은 다음 단계에서 구현될 예정입니다." /></ProtectedRoute>} />
          <Route path="/settings" element={<ProtectedRoute><PlaceholderPage title="설정" description="설정 화면은 다음 단계에서 구현될 예정입니다." /></ProtectedRoute>} />
          <Route path="/budget-management/*" element={<LegacyBudgetManagementRedirect />} />
        </Routes>
      </Layout>
    </BrowserRouter>
  );
}

export default App;
