import { createRoot } from "react-dom/client";
import App from "./App";
import { appliquerTheme, lireTheme } from "./theme";
import "./styles.css";

appliquerTheme(lireTheme());

createRoot(document.getElementById("root")).render(<App />);
