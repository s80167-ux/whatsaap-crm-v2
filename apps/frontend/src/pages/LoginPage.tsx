import { useState } from "react";
import { motion } from "framer-motion";
import { BarChart3, MessageCircle, ShieldCheck } from "lucide-react";
import { useNavigate, useSearchParams } from "react-router-dom";
import brandBanner from "../../asset/rezeki_dashboard_banner.png";
import brandLogo from "../../asset/rezeki_dashboard_logo_glass.png";
import { login, startGoogleLogin } from "../api/auth";
import { Button } from "../components/Button";
import { Card } from "../components/Card";
import { Input } from "../components/Input";

export function LoginPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const queryError = searchParams.get("error");
  const googleError =
    queryError === "google_signup_pending"
      ? "Your Google signup request has been submitted and is pending approval."
      : queryError === "google_account_not_linked"
      ? "This Google account is not linked to an active CRM workspace. Please contact your admin."
      : queryError === "google_login_failed"
        ? "Google sign-in failed. Please try again or use email/password."
        : null;
  const visibleError = error ?? googleError;

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);

    try {
      await login({ email, password });
      navigate("/", { replace: true });
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Unable to sign in");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-hero-grid px-4 py-8">
      <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.28 }} className="w-full max-w-6xl">
        <Card className="grid overflow-hidden border-primary/10 bg-white p-0 shadow-lift md:grid-cols-[1.08fr,0.92fr]" elevated>
          <div className="hidden border-r border-border bg-[linear-gradient(145deg,#f8fbff_0%,#ffffff_47%,#f2f7fb_100%)] p-10 md:flex md:min-h-[640px] md:flex-col md:justify-between">
            <div className="max-w-md">
              <p className="brand-badge bg-white text-primary">WhatsApp CRM for PMKS</p>
              <h2 className="mt-5 text-3xl font-semibold leading-tight tracking-tight text-text">
                Customer conversations, sales visibility, and team control in one workspace.
              </h2>
            </div>

            <div className="relative my-8">
              <div className="relative overflow-hidden rounded-2xl border border-border bg-white shadow-[0_24px_60px_rgba(1,19,39,0.12)]">
                <img src={brandBanner} alt="Rezeki Dashboard product preview" className="h-auto w-full object-cover" />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-5 border-t border-border pt-5">
              <div>
                <MessageCircle className="h-5 w-5 text-accent" />
                <p className="mt-3 text-xs font-semibold uppercase tracking-[0.14em] text-text-soft">Inbox</p>
                <p className="mt-1 text-sm font-semibold text-text">Realtime chats</p>
              </div>
              <div>
                <BarChart3 className="h-5 w-5 text-primary" />
                <p className="mt-3 text-xs font-semibold uppercase tracking-[0.14em] text-text-soft">Sales</p>
                <p className="mt-1 text-sm font-semibold text-text">Clear pipeline</p>
              </div>
              <div>
                <ShieldCheck className="h-5 w-5 text-secondary" />
                <p className="mt-3 text-xs font-semibold uppercase tracking-[0.14em] text-text-soft">Access</p>
                <p className="mt-1 text-sm font-semibold text-text">Role-based</p>
              </div>
            </div>
          </div>

          <div className="flex min-h-[620px] flex-col justify-center p-8 md:p-12">
            <img
              src={brandLogo}
              alt="Rezeki Dashboard logo"
              className="mb-7 h-16 w-auto object-contain"
            />
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">Rezeki Dashboard</p>
            <h1 className="mt-4 text-3xl font-semibold tracking-tight text-text sm:text-4xl">Sign in to your workspace</h1>
            <p className="mt-3 max-w-md text-sm leading-6 text-text-muted">
              Manage WhatsApp conversations, customer activity, and team access in one secure CRM workspace for PMKS.
            </p>

            <form className="mt-9 space-y-4" onSubmit={handleSubmit}>
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
              {visibleError ? <p className="text-sm text-coral">{visibleError}</p> : null}
              <Button type="submit" disabled={isSubmitting} className="w-full">
                {isSubmitting ? "Signing in..." : "Sign in"}
              </Button>
              <Button type="button" variant="secondary" className="w-full" onClick={startGoogleLogin}>
                <span className="flex h-5 w-5 items-center justify-center rounded-full border border-border bg-white text-xs font-bold text-text">
                  G
                </span>
                Continue with Google
              </Button>
              <Button type="button" variant="ghost" className="w-full text-text-muted" onClick={startGoogleLogin}>
                Request access with Google
              </Button>
            </form>

            <div className="mt-7 flex items-start gap-3 rounded-2xl border border-border bg-background-tint/70 p-4 text-sm leading-6 text-text-muted">
              <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-accent" />
              <p>Secure access for authorized users. Google accounts must be linked to an active CRM workspace.</p>
            </div>
          </div>
        </Card>
      </motion.div>
    </main>
  );
}
