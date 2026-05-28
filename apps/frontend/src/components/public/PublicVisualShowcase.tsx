import dashboardBanner from "../../../asset/rezeki_dashboard_banner.png";
import loginBanner from "../../../asset/rezeki_dashboard_login_banner.png";

type PublicVisualShowcaseProps = {
  title: string;
  description: string;
  image?: "dashboard" | "campaign";
  highlights?: string[];
};

export function PublicVisualShowcase({ title, description, image = "dashboard", highlights = [] }: PublicVisualShowcaseProps) {
  const imageSource = image === "campaign" ? loginBanner : dashboardBanner;

  return (
    <div className="public-showcase public-reveal">
      <div className="public-showcase-copy">
        <p className="public-showcase-kicker">Rezeki Dashboard</p>
        <h2>{title}</h2>
        <p>{description}</p>
        {highlights.length > 0 ? (
          <div className="public-showcase-chips" aria-label={title}>
            {highlights.map((highlight) => (
              <span key={highlight}>{highlight}</span>
            ))}
          </div>
        ) : null}
      </div>
      <div className="public-showcase-frame" aria-hidden="true">
        <img src={imageSource} alt="" className="public-showcase-image" />
        <div className="public-showcase-card public-showcase-card-one">
          <span />
          <div>
            <strong>128</strong>
            <p>Total Leads</p>
          </div>
        </div>
        <div className="public-showcase-card public-showcase-card-two">
          <span />
          <div>
            <strong>24</strong>
            <p>Follow Up</p>
          </div>
        </div>
      </div>
    </div>
  );
}
