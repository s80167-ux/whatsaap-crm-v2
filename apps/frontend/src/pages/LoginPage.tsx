import { useState } from "react";
import { motion } from "framer-motion";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import loginBanner from "../../asset/rezeki_dashboard_login_banner.png";
import { login, startGoogleLogin } from "../api/auth";
import { Button } from "../components/Button";
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
    <main className="login-backdrop-scene relative h-dvh overflow-hidden bg-[#f4f8ff] text-[#071f52]">
      <img
        src={loginBanner}
        alt="Rezeki Dashboard campaign management preview"
        className="login-backdrop-image absolute inset-0 h-full w-full"
      />

      <motion.div
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.28 }}
        className="login-panel-slot relative z-10 flex h-dvh w-full items-center justify-center overflow-hidden px-4 py-3 sm:px-8 sm:py-4 lg:justify-end lg:px-[clamp(2rem,3.8vw,4.75rem)]"
      >
        <section className="login-auth-card relative w-full max-w-[32rem] border border-white/80 bg-white px-5 py-4 shadow-[0_24px_60px_rgba(2,31,98,0.22)] sm:px-8 sm:py-5 lg:w-[clamp(23rem,28vw,30rem)]">
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#0b56d9]">Rezeki Dashboard</p>
            <LanguageSwitcher compact />
          </div>
          <h1 className="mt-3 text-[1.55rem] font-semibold leading-tight tracking-tight text-[#071f52] sm:text-[1.85rem]">{t("auth.signInTitle")}</h1>
          <p className="mt-1.5 max-w-md text-xs leading-5 text-[#66708d] sm:text-sm sm:leading-6">
            {t("auth.signInDescription")}
          </p>

          <form className="mt-4 space-y-2.5" onSubmit={handleSubmit}>
            <label className="block">
              <span className="mb-1.5 block text-sm font-semibold text-[#071f52]">{t("auth.emailLabel")}</span>
              <Input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="nama@email.com"
                required
                className="h-10 border-[#d9e1ef] bg-white py-2 text-[#071f52]"
              />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-sm font-semibold text-[#071f52]">{t("auth.passwordLabel")}</span>
              <Input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder={t("auth.passwordPlaceholder")}
                required
                className="h-10 border-[#d9e1ef] bg-white py-2 text-[#071f52]"
              />
            </label>
            {visibleError ? <p className="text-sm text-destructive">{visibleError}</p> : null}
            <Button type="submit" disabled={isSubmitting} className="h-10 w-full bg-[#0751d8] py-2 hover:bg-[#0646bd]">
              {isSubmitting ? t("auth.signingIn") : t("auth.signIn")}
            </Button>
            <div className="flex items-center gap-5 text-sm font-medium text-[#66708d]">
              <span className="h-px flex-1 bg-[#e2e8f2]" />
              <span>atau</span>
              <span className="h-px flex-1 bg-[#e2e8f2]" />
            </div>
            <Button type="button" variant="secondary" className="h-10 w-full border-[#d9e1ef] bg-white py-2 text-[#071f52]" onClick={startGoogleLogin}>
              <span className="flex h-5 w-5 items-center justify-center rounded-full border border-border bg-card text-xs font-bold text-[#4285f4]">
                G
              </span>
              {t("auth.continueGoogle")}
            </Button>
          </form>

          <div className="mt-3 text-center text-sm text-[#66708d]">
            Belum ada akaun?{" "}
            <button type="button" className="font-semibold text-[#0751d8] hover:underline" onClick={startGoogleLogin}>
              {t("auth.requestGoogle")}
            </button>
          </div>
        </section>
      </motion.div>
    </main>
  );
}
