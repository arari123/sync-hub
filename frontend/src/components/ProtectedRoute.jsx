import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { isAuthenticated } from '../lib/session';

const ProtectedRoute = ({ children }) => {
    const location = useLocation();
    if (!isAuthenticated()) {
        return <Navigate to="/login" replace state={{ from: location.pathname }} />;
    }
    return children;
};

export default ProtectedRoute;
