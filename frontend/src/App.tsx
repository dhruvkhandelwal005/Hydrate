import { BrowserRouter, Navigate, Route, Routes, useNavigate } from "react-router-dom";
import Landing from "./components/pages/Landing";
import AppShell from "./components/layout/AppShell";
import Packs from "./components/pages/Packs";
import CaseIntake from "./components/pages/CaseIntake";

function LandingRoute() {
  const navigate = useNavigate();
  return <Landing onEnter={() => navigate("/cases/new")} />;
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<LandingRoute />} />
        <Route element={<AppShell />}>
          <Route path="/packs" element={<Packs />} />
          <Route path="/cases/new" element={<CaseIntake />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}