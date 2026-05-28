import { Outlet } from "react-router-dom";
import { PublicFooter } from "../components/public/PublicFooter";
import { PublicNavbar } from "../components/public/PublicNavbar";
import "../public-site.css";

export function PublicLayout() {
  return (
    <div className="public-shell public-ambient min-h-screen text-[#071f52]">
      <PublicNavbar />
      <main>
        <Outlet />
      </main>
      <PublicFooter />
    </div>
  );
}
