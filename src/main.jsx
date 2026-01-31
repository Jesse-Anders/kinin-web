import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";
import { configureAmplify } from "./amplifyConfig.js";
import "./App.css";

configureAmplify();

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
