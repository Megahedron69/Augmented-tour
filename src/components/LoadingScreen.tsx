import React from "react";

interface LoadingScreenProps {
  message?: string;
  progress?: { loaded: number; total: number };
}

const LoadingScreen: React.FC<LoadingScreenProps> = ({
  message = "Loading...",
  progress,
}) => {
  const percentage =
    progress && progress.total > 0
      ? Math.round((progress.loaded / progress.total) * 100)
      : 0;
  const showProgress = progress && progress.total > 0;

  return (
    <div className="loading-screen">
      <div className="loading-content">
        <div className="spinner"></div>
        <h2>{message}</h2>
        <p>Please wait while we prepare your virtual tour experience</p>
        {showProgress && (
          <div
            style={{
              margin: "20px auto 0",
              width: "300px",
              textAlign: "center",
            }}
          >
            <div
              style={{
                width: "100%",
                height: "8px",
                backgroundColor: "rgba(255,255,255,0.1)",
                borderRadius: "4px",
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  width: `${percentage}%`,
                  height: "100%",
                  backgroundColor: "#00d9ff",
                  transition: "width 0.3s ease",
                  boxShadow: "0 0 10px rgba(0,217,255,0.5)",
                }}
              ></div>
            </div>
            <p
              style={{
                marginTop: "10px",
                fontSize: "14px",
                color: "rgba(255,255,255,0.7)",
              }}
            >
              Loading panoramas: {progress.loaded} / {progress.total} (
              {percentage}%)
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

export default LoadingScreen;
