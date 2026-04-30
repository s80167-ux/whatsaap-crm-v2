import { useState } from "react";
import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import brandBanner from "../../asset/rezeki_dashboard_banner.png";
import brandLogo from "../../asset/rezeki_dashboard_logo_glass.png";
import { login } from "../api/auth";
import { Button } from "../components/Button";
import { Card } from "../components/Card";
import { Input } from "../components/Input";
import { storeAuthSession } from "../lib/auth";

export function LoginPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);

    try {
      const session = await login({ email, password });
      storeAuthSession(session);
      navigate("/", { replace: true });
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Unable to sign in");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-hero-grid px-4 py-8">
      <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.28 }} className="w-full max-w-5xl">
        <Card className="grid overflow-hidden border-primary/10 bg-white p-0 shadow-lift md:grid-cols-[1.1fr,0.9fr]" elevated>
          <div className="hidden border-r border-border bg-gradient-to-br from-sand via-white to-secondary-soft/40 p-4 md:flex md:min-h-[620px] md:items-center md:justify-center">
            <img src={brandBanner} alt="Rezeki Dashboard banner" className="h-4/5 w-4/5 object-contain" />
          </div>

          <div className="p-8 md:p-10">
            <img
              src={brandLogo}
              alt="Rezeki Dashboard logo"
              className="mb-5 h-14 w-auto object-contain"
            />
            <p className="brand-badge">Rezeki Dashboard</p>
            <h1 className="mt-4 text-3xl font-semibold tracking-tight text-text">Sign in to your workspace</h1>
            <p className="mt-2 text-sm leading-6 text-text-muted">
              WhatsApp CRM untuk PMKS with role-based access, realtime conversations, and operational visibility.
            </p>

            <form className="mt-8 space-y-4" onSubmit={handleSubmit}>
              <label className="block">
                <span className="mb-2 block text-sm font-medium text-text-muted">Email</span>
                <Input
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="admin@your-org.com"
                  required
                />
              </label>
              <label className="block">
                <span className="mb-2 block text-sm font-medium text-text-muted">Password</span>
                <Input
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="Enter your password"
                  required
                />
              </label>
              {error ? <p className="text-sm text-coral">{error}</p> : null}
              <Button type="submit" disabled={isSubmitting} className="w-full">
                {isSubmitting ? "Signing in..." : "Sign in"}
              </Button>
            </form>
          </div>
        </Card>
      </motion.div>
    </main>
  );
}
