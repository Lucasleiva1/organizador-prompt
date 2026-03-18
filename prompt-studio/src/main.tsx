import ReactDOM from "react-dom/client";
import App from "./App";

try {
  const root = document.getElementById("root");
  if (!root) throw new Error("Root element not found");
  ReactDOM.createRoot(root).render(<App />);
} catch (e: any) {
  console.error("Render error:", e);
}
