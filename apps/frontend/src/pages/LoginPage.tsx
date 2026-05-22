import { useState } from "react";
import { motion } from "framer-motion";
import { BarChart3, MessageCircle, ShieldCheck } from "lucide-react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import brandBanner from "../../asset/rezeki_dashboard_banner.png";
import brandLogo from "../../asset/rezeki_dashboard_logo_glass.png";
import { login, startGoogleLogin } from "../api/auth";
import { Button } from "../components/Button";
import { Card } from "../components/Card";
import { Input } from "../components/Input";
import { LanguageSwitcher } from "../components/LanguageSwitcher";

export function LoginPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const queryError = searchParams.get("error");
  const googleError =
    queryError === "google_signup_pending"
      ? t("auth.googleSignupPending")
      : queryError === "google_account_not_linked"
      ? t("auth.googleAccountNotLinked")
      : queryError === "google_login_failed"
        ? t("auth.googleLoginFailed")
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
      setError(submitError instanceof Error ? submitError.message : t("auth.unableSignIn"));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-hero-grid px-4 py-8">
      <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.28 }} className="w-full max-w-6xl">
        <Card className="grid overflow-hidden border-primary/10 p-0 shadow-lift md:grid-cols-[1.08fr,0.92fr]" elevated>
          <div className="hidden border-r border-border bg-[linear-gradient(145deg,#f8fbff_0%,#ffffff_47%,#f2f7fb_100%)] p-10 md:flex md:min-h-[640px] md:flex-col md:justify-between">
            <div className="max-w-md">
              <p className="brand-badge">{t("auth.brandBadge")}</p>
              <h2 className="mt-5 text-3xl font-semibold leading-tight tracking-tight text-text">
                {t("auth.heroTitle")}
              </h2>
            </div>

            <div className="relative my-8">
              <div className="relative overflow-hidden rounded-2xl border border-border bg-card shadow-panel">
                <img src={brandBanner} alt="Rezeki Dashboard product preview" className="h-auto w-full object-cover" />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-5 border-t border-border pt-5">
              <div>
                <MessageCircle className="h-5 w-5 text-accent" />
                <p className="mt-3 text-xs font-semibold uppercase tracking-[0.14em] text-text-soft">{t("nav.inbox")}</p>
                <p className="mt-1 text-sm font-semibold text-text">{t("auth.featureInbox")}</p>
              </div>
              <div>
                <BarChart3 className="h-5 w-5 text-primary" />
                <p className="mt-3 text-xs font-semibold uppercase tracking-[0.14em] text-text-soft">{t("nav.sales")}</p>
                <p className="mt-1 text-sm font-semibold text-text">{t("auth.featureSales")}</p>
              </div>
              <div>
                <ShieldCheck className="h-5 w-5 text-secondary" />
                <p className="mt-3 text-xs font-semibold uppercase tracking-[0.14em] text-text-soft">Access</p>
                <p className="mt-1 text-sm font-semibold text-text">{t("auth.featureAccess")}</p>
              </div>
            </div>
          </div>

          <div className="flex min-h-[620px] flex-col justify-center p-8 md:p-12">
            <img
              src={brandLogo}
              alt="Rezeki Dashboard logo"
              className="mb-7 h-16 w-auto object-contain"
            />
            <div className="flex items-start justify-between gap-3">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">Rezeki Dashboard</p>
              <LanguageSwitcher compact />
            </div>
            <h1 className="mt-4 text-3xl font-semibold tracking-tight text-text sm:text-4xl">{t("auth.signInTitle")}</h1>
            <p className="mt-3 max-w-md text-sm leading-6 text-text-muted">
              {t("auth.signInDescription")}
            </p>

            <form className="mt-9 space-y-4" onSubmit={handleSubmit}>
              <label className="block">
                <span className="mb-2 block text-sm font-medium text-text-muted">{t("auth.emailLabel")}</span>
                <Input
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="admin@your-org.com"
                  required
                />
              </label>
              <label className="block">
                <span className="mb-2 block text-sm font-medium text-text-muted">{t("auth.passwordLabel")}</span>
                <Input
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder={t("auth.passwordPlaceholder")}
                  required
                />
              </label>
              {visibleError ? <p className="text-sm text-destructive">{visibleError}</p> : null}
              <Button type="submit" disabled={isSubmitting} className="w-full">
                {isSubmitting ? t("auth.signingIn") : t("auth.signIn")}
              </Button>
              <Button type="button" variant="secondary" className="w-full" onClick={startGoogleLogin}>
                <span className="flex h-5 w-5 items-center justify-center rounded-full border border-border bg-card text-xs font-bold text-text">
                  G
                </span>
                {t("auth.continueGoogle")}
              </Button>
              <Button type="button" variant="ghost" className="w-full text-text-muted" onClick={startGoogleLogin}>
                {t("auth.requestGoogle")}
              </Button>
            </form>

            <div className="mt-7 flex items-start gap-3 rounded-2xl border border-border bg-background-tint/70 p-4 text-sm leading-6 text-text-muted">
              <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-accent" />
              <p>{t("auth.secureNote")}</p>
            </div>
          </div>
        </Card>
      </motion.div>
    </main>
  );
}
