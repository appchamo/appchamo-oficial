import { Capacitor } from '@capacitor/core';
import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

// ✅ REMOVIDO: localStorage.removeItem automático.
// Se deixarmos aqui, o login social nunca vai persistir porque o app 
// limpa a própria memória ao abrir via Deep Link.

// Se precisar de um reset de emergência, use uma flag temporária ou 
// faça isso dentro do handleAuthRedirect apenas se o token for inválido.

const container = document.getElementById("root");
if (!container) throw new Error("Não foi possível encontrar o elemento root");

const root = createRoot(container);
root.render(<App />);