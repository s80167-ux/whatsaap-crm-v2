import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { AlertCircle, CheckCircle, RefreshCw } from "lucide-react";
import { Button } from "../components/Button";
import { Card } from "../components/Card";
import { connectMetaPage, exchangeMetaCode, type MetaExchangeCodeResponse, type MetaPageOption } from "../lib/socialChannelsApi";

const SETUP_PATH = "/setup/channels/facebook";
const NOT_READY_MESSAGE = "Facebook connection is not ready yet. Please contact your CRM administrator.";

type CallbackStatus = "loading" | "success" | "page_selection" | "error";

export function MetaOAuthCallbackPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const code = searchParams.get("code") ?? undefined;
  const state = searchParams.get("state") ?? undefined;
  const facebookError = searchParams.get("error");
  const errorDescription = searchParams.get("error_description");
  const [status, setStatus] = useState<CallbackStatus>(() => (facebookError || !code ? "error" : "loading"));
  const [message, setMessage] = useState("");
  const [pages, setPages] = useState<MetaPageOption[]>([]);
  const [selectedPageId, setSelectedPageId] = useState("");
  const [connectingPage, setConnectingPage] = useState(false);

  const errorCopy = useMemo(() => {
    if (facebookError) {
      return {
        title: "Facebook connection was cancelled",
        description: "You can reconnect your Facebook Page anytime.",
        action: "Back to Facebook Messenger Setup"
      };
    }

    if (!code) {
      return {
        title: "Unable to continue Facebook connection",
        description: "Facebook did not return the required authorization code. Please try again.",
        action: "Try Again"
      };
    }

    return {
      title: "Facebook connection is not ready yet",
      description: message || NOT_READY_MESSAGE,
      action: "Back to Facebook Messenger Setup"
    };
  }, [code, facebookError, message]);

  useEffect(() => {
    if (!code || facebookError) {
      setMessage(errorDescription ?? "");
      return;
    }

    let active = true;

    async function exchangeCode() {
      setStatus("loading");
      setMessage("");

      try {
        const result = await exchangeMetaCode({ code, state });
        if (!active) {
          return;
        }

        handleExchangeResult(result);
      } catch (error) {
        if (!active) {
          return;
        }

        setStatus("error");
        setMessage(error instanceof Error ? error.message : NOT_READY_MESSAGE);
      }
    }

    void exchangeCode();

    return () => {
      active = false;
    };
  }, [code, errorDescription, facebookError, state]);

  useEffect(() => {
    if (status !== "success") {
      return;
    }

    const timer = window.setTimeout(() => {
      navigate(SETUP_PATH);
    }, 1800);

    return () => window.clearTimeout(timer);
  }, [navigate, status]);

  function handleExchangeResult(result: MetaExchangeCodeResponse) {
    if (result.enabled === false) {
      setStatus("error");
      setMessage(result.message || NOT_READY_MESSAGE);
      return;
    }

    if (result.requiresPageSelection && result.pages?.length) {
      setPages(result.pages);
      setSelectedPageId(result.pages[0]?.id ?? "");
      setStatus("page_selection");
      setMessage(result.message);
      return;
    }

    if (result.success && result.account) {
      setStatus("success");
      setMessage("Your Facebook Page is now connected to CRM.");
      return;
    }

    setStatus("error");
    setMessage(result.message || NOT_READY_MESSAGE);
  }

  async function handleConnectSelectedPage() {
    if (!selectedPageId) {
      return;
    }

    setConnectingPage(true);
    setMessage("");

    try {
      const result = await connectMetaPage({ platform: "facebook", pageId: selectedPageId, state: state ?? null });
      handleExchangeResult(result);
    } catch (error) {
      setStatus("error");
      setMessage(error instanceof Error ? error.message : NOT_READY_MESSAGE);
    } finally {
      setConnectingPage(false);
    }
  }

  function renderProgressSteps() {
    return (
      <div className="grid gap-3 sm:grid-cols-3">
        {["Checking Facebook permission", "Getting Page information", "Activating Messenger inbox"].map((step) => (
          <div key={step} className="border border-border bg-muted/30 p-3 text-sm font-medium text-foreground">
            <CheckCircle className="mb-2 text-primary" size={16} />
            {step}
          </div>
        ))}
      </div>
    );
  }

  if (status === "loading") {
    return (
      <section className="mx-auto max-w-3xl space-y-5">
        <Card elevated className="p-6">
          <div className="flex items-start gap-3">
            <RefreshCw className="mt-1 animate-spin text-primary" size={20} />
            <div>
              <h1 className="text-2xl font-semibold text-foreground">Connecting Facebook Page...</h1>
              <p className="mt-2 text-sm leading-6 text-text-muted">We are setting up Messenger for your CRM Inbox.</p>
            </div>
          </div>
          <div className="mt-6">{renderProgressSteps()}</div>
        </Card>
      </section>
    );
  }

  if (status === "page_selection") {
    return (
      <section className="mx-auto max-w-3xl space-y-5">
        <Card elevated className="p-6">
          <h1 className="text-2xl font-semibold text-foreground">Choose Facebook Page</h1>
          <p className="mt-2 text-sm leading-6 text-text-muted">{message || "Choose the Page you want to connect to CRM."}</p>
          <div className="mt-5 space-y-3">
            {pages.map((page) => (
              <label key={page.id} className={`flex cursor-pointer items-center gap-3 border p-3 ${selectedPageId === page.id ? "border-primary bg-primary/10" : "border-border bg-background/70"}`}>
                <input
                  type="radio"
                  name="pageId"
                  className="h-4 w-4"
                  checked={selectedPageId === page.id}
                  onChange={() => setSelectedPageId(page.id)}
                />
                {page.pictureUrl ? <img src={page.pictureUrl} alt="" className="h-10 w-10 rounded-full object-cover" /> : null}
                <span className="min-w-0">
                  <span className="block text-sm font-semibold text-foreground">{page.name}</span>
                  <span className="block text-xs text-text-soft">Page ID: {page.id}</span>
                </span>
              </label>
            ))}
          </div>
          <div className="mt-6 flex flex-col gap-2 sm:flex-row">
            <Button onClick={() => void handleConnectSelectedPage()} disabled={!selectedPageId || connectingPage}>
              {connectingPage ? "Connecting..." : "Connect Selected Page"}
            </Button>
            <Button variant="secondary" onClick={() => navigate(SETUP_PATH)}>
              Back
            </Button>
          </div>
        </Card>
      </section>
    );
  }

  if (status === "success") {
    return (
      <section className="mx-auto max-w-3xl space-y-5">
        <Card elevated className="p-6">
          <div className="flex items-start gap-3">
            <CheckCircle className="mt-1 text-success" size={22} />
            <div>
              <h1 className="text-2xl font-semibold text-foreground">Facebook Messenger Connected</h1>
              <p className="mt-2 text-sm leading-6 text-text-muted">Your Facebook Page is now connected to CRM.</p>
            </div>
          </div>
          <Button className="mt-6" onClick={() => navigate(SETUP_PATH)}>
            Go to Facebook Messenger Setup
          </Button>
        </Card>
      </section>
    );
  }

  return (
    <section className="mx-auto max-w-3xl space-y-5">
      <Card elevated className="p-6">
        <div className="flex items-start gap-3">
          <AlertCircle className="mt-1 text-warning" size={22} />
          <div>
            <h1 className="text-2xl font-semibold text-foreground">{errorCopy.title}</h1>
            <p className="mt-2 text-sm leading-6 text-text-muted">{errorCopy.description}</p>
            {errorDescription ? <p className="mt-3 text-xs text-text-soft">{errorDescription}</p> : null}
          </div>
        </div>
        <Button className="mt-6" onClick={() => navigate(SETUP_PATH)}>
          {errorCopy.action}
        </Button>
      </Card>
    </section>
  );
}
