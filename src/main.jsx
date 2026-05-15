import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import "aws-amplify/auth/enable-oauth-listener";
import App from "./App.jsx";
import { configureAmplify } from "./amplifyConfig.js";
import { applyTheme } from "./theme/applyTheme.js";
import "./theme/globals.css";
import "./App.css";

configureAmplify();
applyTheme();

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>
);
