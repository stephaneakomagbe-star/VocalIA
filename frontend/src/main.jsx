import { createRoot } from "react-dom/client";
import { Capacitor } from "@capacitor/core";
import App from "./App";
import { appliquerTheme, lireTheme } from "./theme";
import "./styles.css";

window.Capacitor = Capacitor;
appliquerTheme(lireTheme());

createRoot(document.getElementById("root")).render(<App />);
