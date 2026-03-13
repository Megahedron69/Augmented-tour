import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  ArrowRight,
  CheckCircle2,
  Compass,
  DraftingCompass,
  House,
  Layers,
  Moon,
  Sparkles,
  Sun,
  Upload,
} from "lucide-react";
import VirtualTour from "./components/VirtualTour";
import FloorPlanTo3DLab from "./components/FloorPlanTo3DLab.tsx";
import "./App.css";

type Theme = "dark" | "light";
type FeatureState = "Completed" | "In Progress" | "Coming Soon";
type AppView = "landing" | "tour" | "feature2";

const App = () => {
  const [theme, setTheme] = useState<Theme>(() => {
    const savedTheme = localStorage.getItem("mrx-theme") as Theme | null;
    if (savedTheme === "dark" || savedTheme === "light") {
      return savedTheme;
    }

    return window.matchMedia("(prefers-color-scheme: dark)").matches
      ? "dark"
      : "light";
  });

  const [currentView, setCurrentView] = useState<AppView>(() => {
    const params = new URLSearchParams(window.location.search);
    const view = params.get("view");
    if (view === "tour") {
      return "tour";
    }
    if (view === "feature2") {
      return "feature2";
    }
    return "landing";
  });

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem("mrx-theme", theme);
  }, [theme]);

  useEffect(() => {
    const url = new URL(window.location.href);
    if (currentView === "tour") {
      url.searchParams.set("view", "tour");
    } else if (currentView === "feature2") {
      url.searchParams.set("view", "feature2");
    } else {
      url.searchParams.delete("view");
    }
    window.history.replaceState({}, "", url);
  }, [currentView]);

  const features = useMemo(
    () => [
      {
        id: 1,
        title: "Virtual Tour + Custom XR Components",
        state: "Completed" as FeatureState,
        description:
          "Upload panoramas, generate immersive walkthroughs, and place custom XR components directly inside rooms.",
        icon: Sparkles,
        image: "/360Assets/panos/floor_01_partial_room_10_pano_16.jpg",
      },
      {
        id: 2,
        title: "2D Floor Plan to 3D Experience",
        state: "In Progress" as FeatureState,
        description:
          "The next milestone maps 2D floor plans into interactive 3D spaces for faster scene creation and alignment.",
        icon: Layers,
        image: "/360Assets/floor_plans/floor_01.png",
      },
      {
        id: 3,
        title: "Floorplan Creator",
        state: "Coming Soon" as FeatureState,
        description:
          "A creator tool to draw and edit floorplans directly in-app before instantly turning them into spatial experiences.",
        icon: DraftingCompass,
        image: "/360Assets/floor_plans/floor_02.png",
      },
    ],
    [],
  );

  const handleFeatureClick = (featureId: number) => {
    if (featureId === 1) {
      setCurrentView("tour");
      return;
    }

    if (featureId === 2) {
      setCurrentView("feature2");
      return;
    }

    document.getElementById("roadmap")?.scrollIntoView({ behavior: "smooth" });
  };

  if (currentView === "tour") {
    return <VirtualTour onGoHome={() => setCurrentView("landing")} />;
  }

  if (currentView === "feature2") {
    return <FloorPlanTo3DLab onGoHome={() => setCurrentView("landing")} />;
  }

  return (
    <div className="landing-app">
      <div className="landing-background" />

      <div className="landing-content-wrapper">
        <header className="landing-nav">
          <a className="brand" href="#home">
            <House size={18} />
            <span>Mixed Reality House</span>
          </a>

          <nav className="nav-links">
            <a href="#home">Home</a>
            <a href="#features">Features</a>
            <a href="#roadmap">Roadmap</a>
            <button
              type="button"
              className="nav-link-btn"
              onClick={() => setCurrentView("feature2")}
            >
              Feature 2 Lab
            </button>
          </nav>

          <button
            className="theme-toggle"
            type="button"
            onClick={() =>
              setTheme((current) => (current === "dark" ? "light" : "dark"))
            }
            aria-label="Toggle theme"
          >
            {theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
          </button>
        </header>

        <main>
          <section className="hero" id="home">
            <motion.div
              className="hero-content"
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7 }}
            >
              <p className="hero-kicker">
                <Compass size={16} />
                Spatial SaaS Platform
              </p>
              <h1>
                Build immersive property experiences from panorama to floorplan.
              </h1>
              <p className="hero-text">
                A theme-compatible, modern workflow for virtual touring, floor
                plan transformation, and creation tools for the next generation
                of mixed reality homes.
              </p>
              <div className="hero-actions">
                <button
                  type="button"
                  className="primary-btn"
                  onClick={() => setCurrentView("tour")}
                >
                  Explore Virtual Tour
                  <ArrowRight size={16} />
                </button>
                <button
                  type="button"
                  className="ghost-btn"
                  onClick={() => setCurrentView("feature2")}
                >
                  Generate 3D From Floorplan
                </button>
              </div>
            </motion.div>

            <motion.div
              className="hero-visual"
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.8, delay: 0.1 }}
            >
              <img
                src="/360Assets/panos_floor2/bedroom.jpg"
                alt="Panorama preview"
                className="hero-image"
              />
              <div className="floating-chip">
                <Upload size={14} />
                Panorama Upload Pipeline
              </div>
            </motion.div>
          </section>

          <section className="features" id="features">
            <div className="section-heading">
              <h2>Platform Features</h2>
              <p>
                What is live now and what comes next in your product roadmap.
              </p>
            </div>

            <div className="feature-grid">
              {features.map((feature, index) => {
                const Icon = feature.icon;
                return (
                  <motion.article
                    key={feature.id}
                    className="feature-card"
                    role="button"
                    tabIndex={0}
                    onClick={() => handleFeatureClick(feature.id)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        handleFeatureClick(feature.id);
                      }
                    }}
                    initial={{ opacity: 0, y: 26 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true, amount: 0.3 }}
                    transition={{ duration: 0.5, delay: index * 0.08 }}
                  >
                    <img
                      src={feature.image}
                      alt={feature.title}
                      className="feature-image"
                    />
                    <div className="feature-content">
                      <div className="feature-top">
                        <span
                          className={`status-pill ${feature.state.toLowerCase().replace(" ", "-")}`}
                        >
                          {feature.state === "Completed" && (
                            <CheckCircle2 size={14} />
                          )}
                          {feature.state}
                        </span>
                        <Icon
                          size={feature.id === 2 ? 34 : 20}
                          strokeWidth={feature.id === 2 ? 2.4 : 2}
                        />
                      </div>
                      <h3>{feature.title}</h3>
                      <p>{feature.description}</p>
                      {feature.id !== 3 && (
                        <button
                          type="button"
                          className="feature-link-btn"
                          onClick={(event) => {
                            event.stopPropagation();
                            handleFeatureClick(feature.id);
                          }}
                        >
                          {feature.id === 1
                            ? "Open Virtual Tour"
                            : "Open 2D → 3D"}
                          <ArrowRight size={15} />
                        </button>
                      )}
                      {feature.id === 3 && (
                        <span className="feature-coming-soon">
                          Planned · Coming Soon
                        </span>
                      )}
                    </div>
                  </motion.article>
                );
              })}
            </div>
          </section>

          <section className="roadmap" id="roadmap">
            <div className="section-heading">
              <h2>Roadmap</h2>
              <p>
                Clear direction across the current and upcoming delivery phases.
              </p>
            </div>

            <div className="timeline">
              <div className="timeline-item">
                <span className="timeline-dot completed" />
                <div>
                  <h4>Phase 1 · Delivered</h4>
                  <p>
                    Virtual tour from panorama upload with custom XR components.
                  </p>
                </div>
              </div>
              <div className="timeline-item">
                <span className="timeline-dot active" />
                <div>
                  <h4>Phase 2 · Next Focus</h4>
                  <p>2D floor plan to 3D pipeline and interaction mapping.</p>
                </div>
              </div>
              <div className="timeline-item">
                <span className="timeline-dot" />
                <div>
                  <h4>Phase 3 · Planned</h4>
                  <p>Floorplan creator for in-product drafting and export.</p>
                </div>
              </div>
            </div>
          </section>
        </main>
      </div>
    </div>
  );
};

export default App;
