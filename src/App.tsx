import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowRight,
  Building2,
  CheckCircle2,
  Compass,
  DraftingCompass,
  House,
  Layers,
  Moon,
  Sparkles,
  Sun,
  X,
} from "lucide-react";
import VirtualTour from "./components/VirtualTour";
import FloorPlanTo3DLab from "./components/FloorPlanTo3DLab.tsx";
import { TOUR_CONFIGS } from "./constants/tourConfigs";
import { DEFAULT_TOUR_ID, isTourId, type TourId } from "./types/tours";
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

  const [selectedTour, setSelectedTour] = useState<TourId>(() => {
    const params = new URLSearchParams(window.location.search);
    const tour = params.get("tour");

    return isTourId(tour) ? tour : DEFAULT_TOUR_ID;
  });

  const [showTourSelector, setShowTourSelector] = useState(false);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem("mrx-theme", theme);
  }, [theme]);

  useEffect(() => {
    const url = new URL(window.location.href);
    if (currentView === "tour") {
      url.searchParams.set("view", "tour");
      if (selectedTour === "office") {
        url.searchParams.set("tour", selectedTour);
      } else {
        url.searchParams.delete("tour");
      }
    } else if (currentView === "feature2") {
      url.searchParams.set("view", "feature2");
      url.searchParams.delete("tour");
    } else {
      url.searchParams.delete("view");
      url.searchParams.delete("tour");
    }
    window.history.replaceState({}, "", url);
  }, [currentView, selectedTour]);

  useEffect(() => {
    if (!showTourSelector) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [showTourSelector]);

  useEffect(() => {
    if (!showTourSelector) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setShowTourSelector(false);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [showTourSelector]);

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
        state: "Completed" as FeatureState,
        description:
          "The 2D floor plan pipeline now maps plans into interactive 3D spaces for faster scene creation and alignment.",
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

  const tourOptions = useMemo(
    () => [
      {
        id: "home" as TourId,
        title: TOUR_CONFIGS.home.title,
        description:
          "Open the existing residential walkthrough with the current home panorama and XR component flow.",
        image: TOUR_CONFIGS.home.previewImage,
        icon: House,
        badge: "Residential",
      },
      {
        id: "office" as TourId,
        title: TOUR_CONFIGS.office.title,
        description:
          "Launch the IOCL office demo with isolated storage, reception entry, and office-specific preloading.",
        image: TOUR_CONFIGS.office.previewImage,
        icon: Building2,
        badge: "Corporate",
      },
    ],
    [],
  );

  const openTourSelector = () => {
    setShowTourSelector(true);
  };

  const handleTourSelection = (tourId: TourId) => {
    setSelectedTour(tourId);
    setCurrentView("tour");
    setShowTourSelector(false);
  };

  const handleFeatureClick = (featureId: number) => {
    if (featureId === 1) {
      openTourSelector();
      return;
    }

    if (featureId === 2) {
      setCurrentView("feature2");
      return;
    }

    document.getElementById("roadmap")?.scrollIntoView({ behavior: "smooth" });
  };

  if (currentView === "tour") {
    return (
      <VirtualTour
        key={selectedTour}
        tourId={selectedTour}
        onGoHome={() => setCurrentView("landing")}
      />
    );
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
                  onClick={openTourSelector}
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
                <span className="timeline-dot completed" />
                <div>
                  <h4>Phase 2 · Delivered</h4>
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

      <AnimatePresence>
        {showTourSelector && (
          <motion.div
            className="tour-selector-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setShowTourSelector(false)}
          >
            <motion.div
              className="tour-selector-modal"
              initial={{ opacity: 0, y: 48, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 24, scale: 0.98 }}
              transition={{ type: "spring", damping: 24, stiffness: 280 }}
              onClick={(event) => event.stopPropagation()}
            >
              <div className="tour-selector-header">
                <div>
                  <p className="tour-selector-kicker">Choose Demo Tour</p>
                  <h2>Open the right spatial walkthrough.</h2>
                  <p>
                    Home and IOCL office now keep separate route state, room
                    markers, and XR component data.
                  </p>
                </div>
                <button
                  type="button"
                  className="tour-selector-close"
                  onClick={() => setShowTourSelector(false)}
                  aria-label="Close tour selector"
                >
                  <X size={18} />
                </button>
              </div>

              <div className="tour-selector-grid">
                {tourOptions.map((option, index) => {
                  const Icon = option.icon;

                  return (
                    <motion.button
                      key={option.id}
                      type="button"
                      className="tour-option-card"
                      onClick={() => handleTourSelection(option.id)}
                      initial={{ opacity: 0, y: 24 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: 16 }}
                      transition={{ delay: index * 0.08, duration: 0.32 }}
                      whileHover={{ y: -6, scale: 1.01 }}
                      whileTap={{ scale: 0.99 }}
                    >
                      <img
                        src={option.image}
                        alt={option.title}
                        className="tour-option-image"
                      />
                      <div className="tour-option-glow" />
                      <div className="tour-option-content">
                        <span className="tour-option-badge">
                          <Icon size={16} />
                          {option.badge}
                        </span>
                        <h3>{option.title}</h3>
                        <p>{option.description}</p>
                        <span className="tour-option-action">
                          Enter Tour
                          <ArrowRight size={15} />
                        </span>
                      </div>
                    </motion.button>
                  );
                })}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default App;
