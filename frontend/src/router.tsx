import { createBrowserRouter } from "react-router-dom";
import { DashboardLayout } from "./layouts/DashboardLayout";
import { ProtectedLayout } from "./layouts/ProtectedLayout";
import { ContactsPage } from "./pages/ContactsPage";
import { InboxPage } from "./pages/InboxPage";
import { LoginPage } from "./pages/LoginPage";
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
          { index: true, element: <InboxPage /> },
          { path: "contacts", element: <ContactsPage /> },
          { path: "setup", element: <SetupPage /> }
        ]
      }
    ]
  }
]);
