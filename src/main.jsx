import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import "aws-amplify/auth/enable-oauth-listener";
import App from "./App.jsx";
import { configureAmplify } from "./amplifyConfig.js";
import "./App.css";

configureAmplify();

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>
);
