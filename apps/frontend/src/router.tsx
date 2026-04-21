import { createBrowserRouter } from "react-router-dom";
import { DashboardLayout } from "./layouts/DashboardLayout";
import { ProtectedLayout } from "./layouts/ProtectedLayout";
import { ContactsPage } from "./pages/ContactsPage";
import { DashboardPage } from "./pages/DashboardPage";
import { InboxPage } from "./pages/InboxPage";
import { LoginPage } from "./pages/LoginPage";
import { PlatformPage } from "./pages/PlatformPage";
import { SalesPage } from "./pages/SalesPage";
import { SetupPage } from "./pages/SetupPage";

export const router = createBrowserRouter([
  {
    path: "/login",
    element: <LoginPage />
  },
  {
    element: <ProtectedLayout />,
    children: [
      {
        path: "/",
        element: <DashboardLayout />,
        children: [
          { path: "dashboard", element: <DashboardPage /> },
          { index: true, element: <InboxPage /> },
          { path: "contacts", element: <ContactsPage /> },
          { path: "sales", element: <SalesPage /> },
          { path: "setup", element: <SetupPage /> },
          { path: "platform", element: <PlatformPage /> }
        ]
      }
    ]
  }
]);
