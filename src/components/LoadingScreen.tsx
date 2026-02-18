import React from "react";

interface LoadingScreenProps {
  message?: string;
}

const LoadingScreen: React.FC<LoadingScreenProps> = ({
  message = "Loading...",
}) => {
  return (
    <div className="loading-screen">
      <div className="loading-content">
        <div className="spinner"></div>
        <h2>{message}</h2>
        <p>Please wait while we prepare your virtual tour experience</p>
      </div>
    </div>
  );
};

export default LoadingScreen;
