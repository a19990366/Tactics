import "./styles.css";
import React from "react";
import ReactDOM from "react-dom/client";
import TacticsExtended from "./TacticsExtended";

const rootElement = document.getElementById("root")!;
const root = ReactDOM.createRoot(rootElement);

root.render(
  <React.StrictMode>
    <TacticsExtended />
  </React.StrictMode>
);
