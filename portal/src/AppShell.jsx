import { Outlet } from "react-router-dom";
import NavBar from "./components/NavBar.jsx";

// Layout shell — renders persistent navigation chrome above every route.
// Phase 2: add client/env identity bar above <NavBar /> here.
export default function AppShell() {
  return (
    <div>
      <NavBar />
      <Outlet />
    </div>
  );
}
