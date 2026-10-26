import { BrowserRouter, Navigate, Route, Routes, useNavigate } from "react-router-dom";
import Landing from "./components/pages/Landing";
import AppShell from "./components/layout/AppShell";
import CaseIntake from "./components/pages/CaseIntake";
import ErrorBoundary from "./components/common/ErrorBoundary";

function LandingRoute() {
  const navigate = useNavigate();
  return <Landing onEnter={() => navigate("/cases/new")} />;
}

export default function App() {
  return (
    <ErrorBoundary>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<LandingRoute />} />
          <Route element={<AppShell />}>
            <Route path="/cases/new" element={<CaseIntake />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </ErrorBoundary>
  );
}